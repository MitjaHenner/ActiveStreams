using System;

namespace Jellyfin.Plugin.ActiveStreams.Controllers;

/// <summary>
/// Helper to extract current user ID from the claims principal.
/// </summary>
public static class UserHelper
{
    /// <summary>
    /// Extracts the user ID from the claims principal.
    /// </summary>
    /// <param name="user">The claims principal.</param>
    /// <returns>The user ID if found, null otherwise.</returns>
    public static Guid? GetCurrentUserId(System.Security.Claims.ClaimsPrincipal? user)
    {
        if (user == null)
        {
            return null;
        }

        // Try multiple claim types that Jellyfin uses across versions
        var idClaim = user.FindFirst("id")?.Value
                     ?? user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                     ?? user.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
                     ?? user.FindFirst("nameidentifier")?.Value;
        if (!string.IsNullOrWhiteSpace(idClaim) && Guid.TryParse(idClaim, out var id))
        {
            return id;
        }

        return null;
    }
}
