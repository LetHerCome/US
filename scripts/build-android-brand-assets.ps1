$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw (Join-Path $root 'assets/ASSET_MANIFEST.json') | ConvertFrom-Json
$res = Join-Path $root 'android/app/src/main/res'
$sources = [ordered]@{
  'assets/source/brand/us-symbol-master-v1.png' = 'us-symbol-master-v1.png'
  'assets/source/brand/app-icon/us-adaptive-foreground-v1.png' = 'us-adaptive-foreground-v1.png'
  'assets/source/brand/app-icon/us-adaptive-background-v1.png' = 'us-adaptive-background-v1.png'
  'assets/source/brand/splash/us-splash-master-v1.png' = 'us-splash-master-v1.png'
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
      $sha.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-Approved([string]$RelativePath) {
  $entry = $manifest.assets | Where-Object { $_.path -eq $RelativePath } | Select-Object -First 1
  if ($null -eq $entry -or $entry.status -ne 'APPROVED' -or $entry.immutable -ne $true) {
    throw "Approved master missing from manifest: $RelativePath"
  }
  $source = Join-Path $root $RelativePath
  if ((Get-Sha256 $source) -ne $entry.sha256) {
    throw "Approved master hash mismatch: $RelativePath"
  }
  return $source
}

function Write-Png([System.Drawing.Image]$Image, [string]$Destination) {
  $directory = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $Image.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
}

Add-Type -AssemblyName System.Drawing
$sourceFiles = [ordered]@{}
foreach ($relative in $sources.Keys) { $sourceFiles[$relative] = Assert-Approved $relative }

$derivatives = New-Object System.Collections.Generic.List[object]
function Add-Derivative([string]$RelativePath, [string]$Operation, [string[]]$InputPaths) {
  $absolute = Join-Path $root $RelativePath
  $derivatives.Add([ordered]@{
    path = $RelativePath.Replace('\', '/')
    sha256 = Get-Sha256 $absolute
    operation = $Operation
    sources = $InputPaths
  })
}

$drawableNoDpi = Join-Path $res 'drawable-nodpi'
New-Item -ItemType Directory -Force -Path $drawableNoDpi | Out-Null

$copies = @(
  @('assets/source/brand/app-icon/us-adaptive-foreground-v1.png', 'android/app/src/main/res/drawable-nodpi/us_adaptive_foreground_v1.png'),
  @('assets/source/brand/app-icon/us-adaptive-background-v1.png', 'android/app/src/main/res/drawable-nodpi/us_adaptive_background_v1.png'),
  @('assets/source/brand/splash/us-splash-master-v1.png', 'android/app/src/main/res/drawable-nodpi/us_splash_master_v1.png')
)
foreach ($copy in $copies) {
  Copy-Item -LiteralPath $sourceFiles[$copy[0]] -Destination (Join-Path $root $copy[1]) -Force
  Add-Derivative $copy[1] 'BYTE_COPY' @($copy[0])
}

$background = [System.Drawing.Image]::FromFile($sourceFiles['assets/source/brand/app-icon/us-adaptive-background-v1.png'])
$foreground = [System.Drawing.Image]::FromFile($sourceFiles['assets/source/brand/app-icon/us-adaptive-foreground-v1.png'])
try {
  $sizes = [ordered]@{ 'mipmap-mdpi' = 48; 'mipmap-hdpi' = 72; 'mipmap-xhdpi' = 96; 'mipmap-xxhdpi' = 144; 'mipmap-xxxhdpi' = 192 }
  foreach ($density in $sizes.Keys) {
    $size = $sizes[$density]
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
      $graphics.DrawImage($background, $rect)
      $graphics.DrawImage($foreground, $rect)
      foreach ($name in @('ic_launcher.png', 'ic_launcher_round.png')) {
        $relative = "android/app/src/main/res/$density/$name"
        Write-Png $bitmap (Join-Path $root $relative)
        Add-Derivative $relative 'COMPOSITE_RESIZE' @('assets/source/brand/app-icon/us-adaptive-background-v1.png', 'assets/source/brand/app-icon/us-adaptive-foreground-v1.png')
      }
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $foreground.Dispose()
  $background.Dispose()
}

$symbol = [System.Drawing.Image]::FromFile($sourceFiles['assets/source/brand/us-symbol-master-v1.png'])
try {
  $size = 512
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(255, 8, 4, 14))
    $scale = [Math]::Min($size / $symbol.Width, $size / $symbol.Height)
    $width = [int][Math]::Round($symbol.Width * $scale)
    $height = [int][Math]::Round($symbol.Height * $scale)
    $x = [int](($size - $width) / 2)
    $y = [int](($size - $height) / 2)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($symbol, (New-Object System.Drawing.Rectangle $x, $y, $width, $height))
    $relative = 'android/app/src/main/res/drawable-nodpi/us_splash_symbol.png'
    Write-Png $bitmap (Join-Path $root $relative)
    Add-Derivative $relative 'FIT_CENTER_PAD_DARK' @('assets/source/brand/us-symbol-master-v1.png')
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
} finally {
  $symbol.Dispose()
}

$sourceHashes = [ordered]@{}
foreach ($relative in $sources.Keys) { $sourceHashes[$relative] = Get-Sha256 $sourceFiles[$relative] }
$output = [ordered]@{
  schemaVersion = 1
  generator = 'scripts/build-android-brand-assets.mjs + scripts/build-android-brand-assets.ps1'
  sources = $sourceHashes
  derivatives = @($derivatives | Sort-Object path)
}
$manifestPath = Join-Path $root 'android/brand-assets-manifest.json'
[System.IO.File]::WriteAllText($manifestPath, ($output | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Android brand assets generated'
