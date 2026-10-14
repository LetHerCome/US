# Builds the value of the GitHub secret ANDROID_PLAY_UPLOAD_BUNDLE_B64 from the
# Play upload keystore on this computer and copies it to the clipboard.
# Nothing is printed or written to disk. Run it on the founder's own computer:
#   powershell -ExecutionPolicy Bypass -File scripts\make-play-upload-secret.ps1 -Keystore C:\path\us-upload.jks
param(
  [Parameter(Mandatory = $true)][string]$Keystore,
  [string]$Alias = 'us-upload'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Keystore -PathType Leaf)) { throw "Keystore non trovato: $Keystore" }

function Read-Plain([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$storePassword = Read-Plain 'Password del keystore'
$keyPassword = Read-Plain 'Password della chiave (Invio = uguale al keystore)'
if ([string]::IsNullOrEmpty($keyPassword)) { $keyPassword = $storePassword }

$json = [ordered]@{
  keystoreBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $Keystore)))
  storePassword  = $storePassword
  keyAlias       = $Alias
  keyPassword    = $keyPassword
} | ConvertTo-Json -Compress
Set-Clipboard -Value ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
$json = $null; $storePassword = $null; $keyPassword = $null
Write-Host 'Valore copiato negli appunti. Incollalo in GitHub > Settings > Secrets and variables > Actions > ANDROID_PLAY_UPLOAD_BUNDLE_B64, poi copia altro testo per svuotare gli appunti.'
