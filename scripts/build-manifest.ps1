# Builds the plugin DLL and generates a Jellyfin custom-repo manifest.
# Usage: ./scripts/build-manifest.ps1
# Output: dist/manifest.json + dist/Jellyfin.Plugin.ActiveStreams.dll

param(
    [string]$ManifestBaseUrl = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$DistDir = Join-Path $Root "dist"
$DllName = "Jellyfin.Plugin.ActiveStreams.dll"
$DllPath = Join-Path $Root "Jellyfin.Plugin.ActiveStreams/bin/Release/net9.0/$DllName"

# Read metadata from build.yaml (simple parser — no YAML dependency)
$BuildYamlPath = Join-Path $Root "build.yaml"
$BuildYamlLines = Get-Content $BuildYamlPath

function Get-YamlValue($Key) {
    foreach ($line in $BuildYamlLines) {
        if ($line -match "^$Key\s*:\s*['\x22]?(.+?)['\x22]?\s*$") {
            return $Matches[1].Trim()
        }
    }
    return ""
}

$Name        = Get-YamlValue "name"
$Guid        = Get-YamlValue "guid"
$Version     = Get-YamlValue "version"
$TargetAbi   = Get-YamlValue "targetAbi"
$Category    = Get-YamlValue "category"
$Owner       = Get-YamlValue "owner"
$Overview    = Get-YamlValue "overview"
$Description = Get-YamlValue "description"

# Build
Write-Host "Building plugin..." -ForegroundColor Green
Push-Location $Root
try {
    dotnet build -c Release --nologo
} finally {
    Pop-Location
}

if (-not (Test-Path $DllPath)) {
    Write-Error "DLL not found at $DllPath. Build may have failed."
    exit 1
}

# Copy DLL to dist
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
Copy-Item $DllPath (Join-Path $DistDir $DllName) -Force

# Compute SHA256
$sha256 = (Get-FileHash $DllPath -Algorithm SHA256).Hash.ToLower()

# Build download URL
if (-not $ManifestBaseUrl) {
    # Default: GitHub Pages URL pattern (user/repo/raw/gh-pages/...)
    Write-Host ""
    Write-Host "Specify -ManifestBaseUrl, e.g.:" -ForegroundColor Yellow
    Write-Host "  ./scripts/build-manifest.ps1 -ManifestBaseUrl https://username.github.io/ActiveStreams"
    Write-Host ""
}
$DownloadUrl = "$ManifestBaseUrl/$DllName"

# Generate manifest.json
$Manifest = @{
    version  = 1
    plugins  = @(
        @{
            category    = $Category
            guid        = $Guid
            name        = $Name
            description = $Description
            overview    = $Overview
            owner       = $Owner
            version     = $Version
            targetAbi   = $TargetAbi
            artifacts   = @{
                $TargetAbi = @{
                    checksum     = $sha256
                    checksumType = "sha256"
                    version      = $Version
                    timestamp    = (Get-Date).ToUniversalTime().ToString("o")
                    downloadUrl  = $DownloadUrl
                }
            }
        }
    )
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 10
$ManifestPath = Join-Path $DistDir "manifest.json"
$ManifestJson | Set-Content $ManifestPath -Encoding UTF8

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  DLL:       $DistDir\$DllName"
Write-Host "  Manifest:  $ManifestPath"
Write-Host "  SHA256:    $sha256"
Write-Host "  Download:  $DownloadUrl"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Deploy dist/ to gh-pages (copy dist/* to gh-pages root)"
Write-Host "  2. In Jellyfin: Dashboard > Plugins > Custom Repositories > Add"
Write-Host "  3. Paste: $ManifestBaseUrl/manifest.json"
