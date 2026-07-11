namespace Jellyfin.Plugin.ActiveStreams.Controllers;

/// <summary>
/// Broadcast request payload.
/// </summary>
public sealed class BroadcastRequest
{
    /// <summary>
    /// Gets or sets the optional header text.
    /// </summary>
    public string? Header { get; set; }

    /// <summary>
    /// Gets or sets the message text.
    /// </summary>
    public string? Text { get; set; }

    /// <summary>
    /// Gets or sets the timeout in milliseconds.
    /// </summary>
    public int TimeoutMs { get; set; } = 10000;
}
