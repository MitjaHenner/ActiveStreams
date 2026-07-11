using System;
using System.Reflection;
var dllPath = args.Length > 0 ? args[0] : "Jellyfin.Plugin.ActiveStreams/bin/Release/net9.0/Jellyfin.Plugin.ActiveStreams.dll";
var bytes = System.IO.File.ReadAllBytes(dllPath);
var asm = Assembly.Load(bytes);
Console.WriteLine("Embedded resources:");
foreach (var n in asm.GetManifestResourceNames())
{
    Console.WriteLine($"  {n}");
}
