using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Jellyfin.Plugin.ActiveStreams.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.ActiveStreams;

/// <summary>
/// The main plugin.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    private readonly ILogger<Plugin> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    /// <param name="logger">Instance of the <see cref="ILogger{Plugin}"/> interface.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        _logger = logger;
        _logger.LogInformation("ActiveStreams plugin loaded (Id={Id}, Version={Version}).", Id, Version);
    }

    /// <inheritdoc />
    public override string Name => "Active Streams";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("be82ad29-cc88-4d5e-8149-ff122975a52b");

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    // Cache-busting key: plugin version plus DLL last-write timestamp so every
    // build yields a distinct value even when the version is unchanged (local dev).
    internal string ScriptCacheKey
    {
        get
        {
            var version = Version?.ToString() ?? "unknown";
            try
            {
                var location = typeof(Plugin).Assembly.Location;
                if (!string.IsNullOrEmpty(location) && File.Exists(location))
                {
                    var ticks = new FileInfo(location).LastWriteTimeUtc.Ticks;
                    return $"{version}-{ticks}";
                }
            }
            catch
            {
                // Fall through to bare version.
            }

            return version;
        }
    }

    /// <summary>
    /// Gets the &lt;script&gt; tag injected into index.html.
    /// </summary>
    /// <returns>The script tag HTML.</returns>
    internal string BuildScriptTag()
    {
        var cacheKey = ScriptCacheKey;
        return $"<script plugin=\"{Name}\" version=\"{cacheKey}\" src=\"../ActiveStreams/script?v={cacheKey}\" defer></script>";
    }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                DisplayName = "Active Streams",
                EnableInMainMenu = true,
                MenuIcon = "stream",
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.configPage.html", GetType().Namespace)
            }
        ];
    }
}
