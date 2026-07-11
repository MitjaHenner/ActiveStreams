using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.ActiveStreams.Configuration;

/// <summary>
/// Plugin configuration.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Initializes a new instance of the <see cref="PluginConfiguration"/> class.
    /// </summary>
    public PluginConfiguration()
    {
        IsEnabled = true;
        ShowForAdminsOnly = true;
    }

    /// <summary>
    /// Gets or sets a value indicating whether isEnabled.
    /// </summary>
    public bool IsEnabled { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether showForAdminsOnly.
    /// </summary>
    public bool ShowForAdminsOnly { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether development mode is enabled (disables script caching).
    /// </summary>
    public bool DevMode { get; set; }
}
