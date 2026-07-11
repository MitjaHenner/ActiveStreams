using Jellyfin.Plugin.ActiveStreams.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.ActiveStreams;

/// <summary>
/// Registers plugin services with Jellyfin's DI container.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        // Request-time script injection middleware — injects the widget
        // &lt;script&gt; tag into the web index.html on every request.
        serviceCollection.AddSingleton<IStartupFilter, ScriptInjectionStartupFilter>();
    }
}
