using System;
using System.Reflection;
class P { static void Main() {
    var bytes = System.IO.File.ReadAllBytes("Jellyfin.Plugin.ActiveStreams/bin/Release/net9.0/Jellyfin.Plugin.ActiveStreams.dll");
    var asm = Assembly.Load(bytes);
    foreach (var n in asm.GetManifestResourceNames()) Console.WriteLine(n);
}}
