#r "Jellyfin.Plugin.ActiveStreams/bin/Release/net9.0/Jellyfin.Plugin.ActiveStreams.dll"
using System.Reflection;
var dll = Assembly.LoadFrom("Jellyfin.Plugin.ActiveStreams/bin/Release/net9.0/Jellyfin.Plugin.ActiveStreams.dll");
foreach (var name in dll.GetManifestResourceNames())
{
    Console.WriteLine(name);
}
