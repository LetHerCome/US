<# : US - recupero keystore interno. Doppio clic: Windows lo esegue con PowerShell.
@powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; Invoke-Expression ((Get-Content -LiteralPath $f -Raw) -replace '(?s)^.*?#>\r?\n', '')"
@exit /b
#>
# Un solo file, da lanciare con doppio clic due volte:
#  1a volta: crea sul PC il certificato "US signing recovery" (RSA 4096, chiave
#            privata NON esportabile, nell'archivio certificati di Windows),
#            copia negli appunti la parte pubblica e apre la pagina del workflow.
#  2a volta: se in Download c'e' US-signing-recovery-sealed*.zip, lo apre con
#            quel certificato e crea US-keystore-recuperato sul Desktop.
# La chiave privata non lascia mai il PC. Nessuna password da digitare.
$ErrorActionPreference = 'Stop'
$subject = 'CN=US signing recovery'
$workflowUrl = 'https://github.com/LetHerCome/US/actions/workflows/android-signing-recovery.yml'
$interactive = -not $env:US_RECOVERY_NONINTERACTIVE
function Done([string]$message) {
  Write-Host ''
  Write-Host $message
  if ($interactive) { [void](Read-Host 'Premi Invio per chiudere') }
}

try {
  $downloads = if ($env:US_RECOVERY_DOWNLOADS) { $env:US_RECOVERY_DOWNLOADS } else { Join-Path $HOME 'Downloads' }
  $destination = if ($env:US_RECOVERY_DESTINATION) { $env:US_RECOVERY_DESTINATION } else { Join-Path ([Environment]::GetFolderPath('Desktop')) 'US-keystore-recuperato' }
  $sealedZip = Get-ChildItem $downloads -Filter 'US-signing-recovery-sealed*.zip' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

  if (-not $sealedZip) {
    # Passo 1: certificato del destinatario.
    $cert = Get-ChildItem Cert:\CurrentUser\My |
      Where-Object { $_.Subject -eq $subject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(1) } |
      Sort-Object NotAfter -Descending | Select-Object -First 1
    if (-not $cert) {
      $cert = New-SelfSignedCertificate -Subject $subject -Type DocumentEncryptionCert `
        -KeyAlgorithm RSA -KeyLength 4096 -KeyExportPolicy NonExportable `
        -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(30)
    }
    $sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($cert.RawData)).Replace('-', '').ToLowerInvariant()
    Set-Clipboard -Value ([Convert]::ToBase64String($cert.RawData))
    Start-Process $workflowUrl
    Done ("Certificato pronto e copiato negli appunti.`n" +
      "Nella pagina appena aperta: Run workflow, branch main, confirm = RECUPERA-KEYSTORE-US,`n" +
      "recipient_certificate = incolla (Ctrl+V).`n" +
      "Nel log del run, 'Recipient certificate SHA-256' deve essere: $sha`n" +
      "Poi scarica l'artifact US-signing-recovery-sealed in Download e rilancia questo file.")
    return
  }

  # Passo 2: apertura del file sigillato.
  if (Test-Path $destination) { throw "La cartella $destination esiste gia'. Spostala e rilancia." }
  Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
  $work = Join-Path ([IO.Path]::GetTempPath()) ('us-recovery-' + [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    Expand-Archive -Path $sealedZip.FullName -DestinationPath (Join-Path $work 'download')
    $cms = New-Object System.Security.Cryptography.Pkcs.EnvelopedCms
    $cms.Decode([IO.File]::ReadAllBytes((Join-Path $work 'download/US-signing-recovery.p7m')))
    if ($env:US_RECOVERY_TEST_PFX) {
      # Solo per i test automatici: certificato da file invece che dall'archivio di Windows.
      $extra = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
      $extra.Import($env:US_RECOVERY_TEST_PFX, $null, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
      $cms.Decrypt($extra)
    } else {
      $cms.Decrypt()
    }
    $payload = Join-Path $work 'payload.zip'
    [IO.File]::WriteAllBytes($payload, $cms.ContentInfo.Content)
    Expand-Archive -Path $payload -DestinationPath $destination
  } finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  }
  Remove-Item -Force $sealedZip.FullName
  if (-not $env:US_RECOVERY_TEST_PFX) {
    Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject } |
      ForEach-Object { Remove-Item -Path "Cert:\CurrentUser\My\$($_.Thumbprint)" -DeleteKey }
    Invoke-Item $destination
  }
  Done ("Keystore recuperato in: $destination`n" +
    "Il file scaricato e il certificato di recupero sono stati cancellati.`n" +
    "1. Copia la cartella su due supporti offline e la password di LEGGIMI.txt nel gestore password.`n" +
    "2. GitHub > Settings > Secrets and variables > Actions > ANDROID_SIGNING_BUNDLE_B64 > Update:`n" +
    "   incolla il contenuto di NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt.")
} catch {
  Done ("ERRORE: " + $_.Exception.Message)
  exit 1
}
