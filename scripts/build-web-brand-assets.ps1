$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$masterRelative = 'assets/source/brand/us-wordmark-v1.png'
$outputRelative = 'assets/derived/brand/us-symbol-ui-crisp-v1.png'
$manifestPath = Join-Path $root 'assets/ASSET_MANIFEST.json'
$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

$masterEntry = $manifest.assets | Where-Object { $_.path -eq $masterRelative } | Select-Object -First 1
if ($null -eq $masterEntry -or $masterEntry.status -ne 'APPROVED' -or $masterEntry.immutable -ne $true) {
  throw "Approved master missing from manifest: $masterRelative"
}

$masterPath = Join-Path $root $masterRelative
if ((Get-Sha256 $masterPath) -ne $masterEntry.sha256) {
  throw "Approved master hash mismatch: $masterRelative"
}

$derivativeEntry = $manifest.assets | Where-Object { $_.path -eq $outputRelative } | Select-Object -First 1
if ($null -eq $derivativeEntry -or $derivativeEntry.status -ne 'APPROVED' -or $derivativeEntry.immutable -ne $true) {
  throw "Approved derivative missing from manifest: $outputRelative"
}
if ($derivativeEntry.source -ne $masterRelative -or $derivativeEntry.sourceSha256 -ne $masterEntry.sha256) {
  throw "Approved derivative provenance mismatch: $outputRelative"
}

$outputPath = Join-Path $root $outputRelative
if (-not (Test-Path -LiteralPath $outputPath)) {
  throw "Approved derivative missing: $outputRelative"
}
if ((Get-Sha256 $outputPath) -ne $derivativeEntry.sha256) {
  throw "Approved derivative hash mismatch: $outputRelative"
}

$temporaryOutputPath = Join-Path ([System.IO.Path]::GetTempPath()) ("us-web-brand-{0}-{1}.png" -f $PID, [guid]::NewGuid().ToString('N'))
try {
  Add-Type -AssemblyName System.Drawing
  $source = [System.Drawing.Bitmap]::FromFile($masterPath)
  try {
    $output = New-Object System.Drawing.Bitmap $source.Width, $source.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      for ($y = 0; $y -lt $source.Height; $y++) {
        for ($x = 0; $x -lt $source.Width; $x++) {
          $pixel = $source.GetPixel($x, $y)
          # The approved isolated US wordmark already has alpha. Remove only its
          # low-alpha ambient glow; the monogram pixels and geometry are retained.
          if ($pixel.A -lt 128) {
            $output.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            continue
          }
          $alpha = 64 + [int][Math]::Round((($pixel.A - 128) / 127) * 191)
          $output.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
        }
      }
      $output.Save($temporaryOutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $output.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  if ((Get-Sha256 $temporaryOutputPath) -ne $derivativeEntry.sha256) {
    throw "Generated derivative does not match APPROVED asset: $outputRelative"
  }
} finally {
  if (Test-Path -LiteralPath $temporaryOutputPath) {
    Remove-Item -LiteralPath $temporaryOutputPath -Force
  }
}

Write-Output 'Web brand derivative verified'
