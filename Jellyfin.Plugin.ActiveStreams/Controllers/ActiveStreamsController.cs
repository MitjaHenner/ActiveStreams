using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ActiveStreams.Controllers;

/// <summary>
/// Serves the widget script and provides the sessions API.
/// </summary>
[Route("ActiveStreams")]
[ApiController]
public class ActiveStreamsController : ControllerBase
{
    private readonly ISessionManager _sessionManager;
    private readonly ILogger<ActiveStreamsController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="ActiveStreamsController"/> class.
    /// </summary>
    /// <param name="sessionManager">The session manager.</param>
    /// <param name="logger">The logger.</param>
    public ActiveStreamsController(ISessionManager sessionManager, ILogger<ActiveStreamsController> logger)
    {
        _sessionManager = sessionManager;
        _logger = logger;
    }

    /// <summary>
    /// Serves the widget JavaScript from the embedded resource.
    /// </summary>
    /// <returns>The JavaScript file.</returns>
    [HttpGet("script")]
    public ActionResult GetScript()
    {
        var stream = typeof(ActiveStreamsController).Assembly
            .GetManifestResourceStream("Jellyfin.Plugin.ActiveStreams.js.active-streams.js");

        if (stream == null)
        {
            return NotFound();
        }

        var devMode = Plugin.Instance?.Configuration is { DevMode: true };
        Response.Headers["Cache-Control"] = devMode ? "no-store" : "public, max-age=31536000, immutable";
        return new FileStreamResult(stream, "application/javascript");
    }

    /// <summary>
    /// Debug endpoint — returns ALL sessions with raw claim info (no auth).
    /// </summary>
    /// <returns>Debug information about sessions and user claims.</returns>
    [HttpGet("debug-sessions")]
    public IActionResult DebugSessions()
    {
        var sessions = _sessionManager.Sessions.ToArray();
        var claims = User?.Claims.Select(c => new { c.Type, c.Value }).ToArray();

        return Ok(new
        {
            totalSessions = sessions.Length,
            claims,
            sessions = sessions.Select(s => new
            {
                s.Id,
                s.UserId,
                s.UserName,
                s.Client,
                s.DeviceName,
                HasPlayState = s.PlayState != null,
                HasNowPlayingItem = s.NowPlayingItem != null,
                NowPlayingItemName = s.NowPlayingItem?.Name
            })
        });
    }

    /// <summary>
    /// Returns active sessions for the current user (or all for admins).
    /// </summary>
    /// <returns>Array of active sessions.</returns>
    [HttpGet("sessions")]
    [Authorize]
    public IActionResult GetSessions()
    {
        var sessions = _sessionManager.Sessions.ToArray();
        var isAdmin = User?.Identity is { IsAuthenticated: true }
            && User.IsInRole("Administrators");
        var currentUserId = UserHelper.GetCurrentUserId(User);

        // Token auth passes [Authorize] but may carry no claims.
        // When we can't resolve the user ID, return all sessions
        // (matches Jellyfin-Enhanced reference behaviour).
        var currentUserIdStr = currentUserId?.ToString();
        var result = sessions
            .Where(s => isAdmin || currentUserIdStr == null || s.UserId.ToString() == currentUserIdStr)
            .Select(s => new
            {
                UserId = s.UserId,
                UserName = s.UserName,
                Client = s.Client,
                DeviceName = s.DeviceName,
                RemoteEndPoint = isAdmin ? s.RemoteEndPoint : null,
                PlayState = s.PlayState != null ? new
                {
                    IsPaused = s.PlayState.IsPaused,
                    PositionTicks = s.PlayState.PositionTicks,
                    PlayMethod = s.PlayState.PlayMethod
                }
                : null,
                TranscodingInfo = s.TranscodingInfo != null ? new
                {
                    IsVideoDirect = s.TranscodingInfo.IsVideoDirect,
                    IsAudioDirect = s.TranscodingInfo.IsAudioDirect,
                    VideoCodec = s.TranscodingInfo.VideoCodec,
                    AudioCodec = s.TranscodingInfo.AudioCodec,
                    Bitrate = s.TranscodingInfo.Bitrate,
                    Width = s.TranscodingInfo.Width,
                    Height = s.TranscodingInfo.Height,
                    Framerate = s.TranscodingInfo.Framerate,
                    CompletionPercentage = s.TranscodingInfo.CompletionPercentage,
                    TranscodeReasons = s.TranscodingInfo.TranscodeReasons
                }
                : null,
                NowPlayingItem = s.NowPlayingItem != null ? new
                {
                    Id = s.NowPlayingItem.Id,
                    Name = s.NowPlayingItem.Name,
                    SeriesName = s.NowPlayingItem.SeriesName,
                    SeriesId = s.NowPlayingItem.SeriesId,
                    SeriesPrimaryImageTag = s.NowPlayingItem.SeriesPrimaryImageTag,
                    ParentIndexNumber = s.NowPlayingItem.ParentIndexNumber,
                    IndexNumber = s.NowPlayingItem.IndexNumber,
                    ProductionYear = s.NowPlayingItem.ProductionYear,
                    RunTimeTicks = s.NowPlayingItem.RunTimeTicks,
                    ImageTags = s.NowPlayingItem.ImageTags,
                    MediaStreams = s.NowPlayingItem.MediaStreams != null
                        ? s.NowPlayingItem.MediaStreams.Select(ms => new
                        {
                            Type = ms.Type,
                            Codec = ms.Codec,
                            BitRate = ms.BitRate
                        }).ToArray()
                        : null
                }
                : null
            })
            .ToArray();

        return Ok(result);
    }

    /// <summary>
    /// Broadcast a notification to all active sessions (admin only).
    /// </summary>
    /// <param name="request">The broadcast request payload.</param>
    /// <returns>Result of the broadcast operation.</returns>
    [HttpPost("broadcast")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest("Message text is required.");
        }

        var sent = 0;
        var skipped = 0;
        var errors = new List<string>();

        // Use the current session as the controlling session (admin's own session)
        var controllingSessionId = string.Empty;
        try
        {
            var currentUserId = UserHelper.GetCurrentUserId(User);
            var adminSession = _sessionManager.Sessions
                .FirstOrDefault(s => s.UserId == currentUserId);
            controllingSessionId = adminSession?.Id ?? string.Empty;
        }
        catch
        {
            // non-fatal — empty string is accepted
        }

        var command = new MessageCommand
        {
            Header = request.Header,
            Text = request.Text,
            TimeoutMs = request.TimeoutMs
        };

        foreach (var session in _sessionManager.Sessions)
        {
            // Skip sessions with no real user
            if (string.IsNullOrWhiteSpace(session.UserName) ||
                string.Equals(session.UserName, "Unknown", StringComparison.OrdinalIgnoreCase))
            {
                skipped++;
                continue;
            }

            try
            {
                await _sessionManager.SendMessageCommand(
                    controllingSessionId,
                    session.Id,
                    command,
                    CancellationToken.None).ConfigureAwait(false);
                sent++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex, "Broadcast: failed to send to session {SessionId} ({UserName}).", session.Id, session.UserName);
                errors.Add($"{session.UserName}: {ex.Message}");
                skipped++;
            }
        }

        return Ok(new { sent, skipped, errors });
    }
}
