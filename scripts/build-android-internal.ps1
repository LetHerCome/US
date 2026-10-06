$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$keystoreProperties = Join-Path $root "android\keystore.properties"
if (-not (Test-Path $keystoreProperties)) {
  throw "Missing android\keystore.properties. See docs/native/ANDROID_INTERNAL_SIGNING.md"
}

$versionCode = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$env:US_ANDROID_VERSION_CODE = "$versionCode"
$env:US_ANDROID_VERSION_NAME = "1.0-internal.$versionCode"

Push-Location $root
try {
  npm ci
  npm run build:capacitor-web
  npx cap sync android
  Push-Location android
  try {
    .\gradlew.bat --no-daemon testDebugUnitTest assembleRelease
  } finally {
    Pop-Location
  }
  Write-Host ""
  Write-Host "Signed APK:"
  Write-Host "  android\app\build\outputs\apk\release\app-release.apk"
  Write-Host "Version code: $versionCode"
} finally {
  Pop-Location
}
