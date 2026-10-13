# US - apre il keystore recuperato con il certificato creato da
# signing-recovery-key.ps1 (stesso utente Windows, stesso PC).
#
#   powershell -ExecutionPolicy Bypass -File scripts\signing-recovery-open.ps1
#
# Senza parametri prende il file US-signing-recovery-sealed*.zip piu' recente
# in Download e scrive la cartella US-keystore-recuperato sul Desktop.
param(
  [string]$InputPath,
  [string]$Destination = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'US-keystore-recuperato'),
  [string]$TestPfxPath  # solo per i test automatici
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue

if (-not $InputPath) {
  $InputPath = Get-ChildItem (Join-Path $HOME 'Downloads') -Filter 'US-signing-recovery-sealed*.zip' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  if (-not $InputPath) { throw "Nessun US-signing-recovery-sealed*.zip in Download" }
}
if (Test-Path $Destination) { throw "La cartella $Destination esiste gia': spostala o indica -Destination" }

$work = Join-Path ([IO.Path]::GetTempPath()) ("us-recovery-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $sealed = $InputPath
  if ($InputPath -like '*.zip') {
    Expand-Archive -Path $InputPath -DestinationPath (Join-Path $work 'download')
    $sealed = Join-Path $work 'download/US-signing-recovery.p7m'
  }
  $cms = New-Object System.Security.Cryptography.Pkcs.EnvelopedCms
  $cms.Decode([IO.File]::ReadAllBytes($sealed))
  if ($TestPfxPath) {
    $extra = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
    $extra.Import($TestPfxPath, $null, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    $cms.Decrypt($extra)
  } else {
    $cms.Decrypt()
  }
  $zip = Join-Path $work 'payload.zip'
  [IO.File]::WriteAllBytes($zip, $cms.ContentInfo.Content)
  Expand-Archive -Path $zip -DestinationPath $Destination
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
Write-Host "Keystore recuperato in: $Destination"
Get-ChildItem $Destination | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host "Leggi LEGGIMI.txt, copia la cartella su due supporti offline, poi cancella il file scaricato."
