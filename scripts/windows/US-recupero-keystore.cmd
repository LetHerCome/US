<# : US - recupero keystore interno. Doppio clic: Windows lo esegue con PowerShell.
@set "PSModulePath="
@powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; Invoke-Expression ((Get-Content -LiteralPath $f -Raw) -replace '(?s)^.*?#>\r?\n', '')"
@exit /b %errorlevel%
#>
# Un solo file, lanciato con doppio clic. Capisce da solo a che punto sei:
#  1. Nessun file scaricato: crea sul PC il certificato "US signing recovery"
#     (RSA 4096, chiave privata NON esportabile, nell'archivio certificati di
#     Windows), copia negli appunti la parte pubblica e apre la pagina del workflow.
#  2. In Download c'e' US-signing-recovery-sealed*.zip: lo apre con quel
#     certificato e crea US-keystore-recuperato sul Desktop. Non cancella nulla.
#  3. La cartella sul Desktop esiste gia': dopo la conferma "BACKUP FATTO"
#     cancella cartella, file scaricato e certificato di recupero.
# La chiave privata del certificato non lascia mai il PC. Nessuna password da digitare.
$ErrorActionPreference = 'Stop'
$subject = 'CN=US signing recovery'
$workflowUrl = 'https://github.com/LetHerCome/US/actions/workflows/android-signing-recovery.yml'
$interactive = -not $env:US_RECOVERY_NONINTERACTIVE
$useStore = -not $env:US_RECOVERY_TEST_PFX
function Done([string]$message) {
  Write-Host ''
  Write-Host $message
  if ($interactive) { [void](Read-Host 'Premi Invio per chiudere') }
}
function RecoveryCertificates { Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject } }

try {
  $downloads = if ($env:US_RECOVERY_DOWNLOADS) { $env:US_RECOVERY_DOWNLOADS } else { Join-Path $HOME 'Downloads' }
  $destination = if ($env:US_RECOVERY_DESTINATION) { $env:US_RECOVERY_DESTINATION } else { Join-Path ([Environment]::GetFolderPath('Desktop')) 'US-keystore-recuperato' }
  $sealedZip = Get-ChildItem $downloads -Filter 'US-signing-recovery-sealed*.zip' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

  if (Test-Path $destination) {
    # Passo 3: pulizia, solo dopo i backup.
    Write-Host "Questo cancella: $destination, il file scaricato e il certificato di recupero."
    Write-Host 'Fallo solo dopo aver copiato us-internal-signing.p12 su due supporti offline,'
    Write-Host 'controllato le copie, salvato la password nel gestore password e aggiornato il segreto.'
    $answer = if ($interactive) { Read-Host 'Scrivi BACKUP FATTO per confermare' } else { $env:US_RECOVERY_CONFIRM }
    if ($answer -cne 'BACKUP FATTO') { Done 'Nessuna modifica.'; return }
    Remove-Item -Recurse -Force $destination
    Get-ChildItem $downloads -Filter 'US-signing-recovery-sealed*.zip' -ErrorAction SilentlyContinue | Remove-Item -Force
    if ($useStore) { RecoveryCertificates | ForEach-Object { Remove-Item -Path "Cert:\CurrentUser\My\$($_.Thumbprint)" -DeleteKey } }
    Done 'Pulizia completata: cartella, file scaricato e certificato di recupero cancellati.'
    return
  }

  if (-not $sealedZip) {
    # Passo 1: certificato del destinatario.
    $cert = RecoveryCertificates | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(1) } |
      Sort-Object NotAfter -Descending | Select-Object -First 1
    if (-not $cert) {
      $cert = New-SelfSignedCertificate -Subject $subject -Type DocumentEncryptionCert `
        -KeyAlgorithm RSA -KeyLength 4096 -KeyExportPolicy NonExportable `
        -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(30)
    }
    $sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($cert.RawData)).Replace('-', '').ToLowerInvariant()
    $encoded = [Convert]::ToBase64String($cert.RawData)
    if ($env:US_RECOVERY_CERT_OUT) {
      # Solo per lo smoke test automatico: niente appunti e niente browser.
      Set-Content -LiteralPath $env:US_RECOVERY_CERT_OUT -Value $encoded -NoNewline
    } else {
      Set-Clipboard -Value $encoded
      Start-Process $workflowUrl
    }
    Done ("Certificato pronto e copiato negli appunti.`n" +
      "Nella pagina appena aperta: Run workflow, branch main, confirm = RECUPERA-KEYSTORE-US,`n" +
      "recipient_certificate = incolla (Ctrl+V).`n" +
      "Nel log del run, 'Recipient certificate SHA-256' deve essere: $sha`n" +
      "Poi scarica l'artifact US-signing-recovery-sealed in Download e rilancia questo file.")
    return
  }

  # Passo 2: apertura del file sigillato. Il file scaricato e il certificato restano
  # finche' i backup non sono fatti (passo 3).
  Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
  $work = Join-Path ([IO.Path]::GetTempPath()) ('us-recovery-' + [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    Expand-Archive -Path $sealedZip.FullName -DestinationPath (Join-Path $work 'download')
    $cms = New-Object System.Security.Cryptography.Pkcs.EnvelopedCms
    $cms.Decode([IO.File]::ReadAllBytes((Join-Path $work 'download/US-signing-recovery.p7m')))
    if ($useStore) {
      $cms.Decrypt()
    } else {
      # Solo per i test automatici: certificato da file invece che dall'archivio di Windows.
      $extra = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
      $extra.Import($env:US_RECOVERY_TEST_PFX, $null, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
      $cms.Decrypt($extra)
    }
    $payload = Join-Path $work 'payload.zip'
    [IO.File]::WriteAllBytes($payload, $cms.ContentInfo.Content)
    Expand-Archive -Path $payload -DestinationPath $destination
  } finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  }
  $p12 = Join-Path $destination 'us-internal-signing.p12'
  $p12Sha = (Get-FileHash -LiteralPath $p12 -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($useStore -and $interactive) { Invoke-Item $destination }
  Done ("Keystore recuperato in: $destination`n" +
    "1. Copia us-internal-signing.p12 su due supporti offline e controlla ogni copia:`n" +
    "   SHA-256 atteso $p12Sha`n" +
    "2. Salva la password di LEGGIMI.txt nel gestore password (non insieme alle copie).`n" +
    "3. GitHub > Settings > Secrets and variables > Actions > ANDROID_SIGNING_BUNDLE_B64 > Update:`n" +
    "   incolla il contenuto di NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt.`n" +
    "4. Rilancia questo file per cancellare cartella, file scaricato e certificato.")
} catch {
  Done ('ERRORE: ' + $_.Exception.Message)
  exit 1
}
