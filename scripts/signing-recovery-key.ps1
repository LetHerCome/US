# US - certificato personale per ricevere il keystore recuperato.
#
# Crea (o riusa) sul tuo PC un certificato "US signing recovery" con chiave
# RSA 4096 NON esportabile, nel tuo archivio certificati di Windows. Copia negli
# appunti solo la parte pubblica, da incollare nel campo "recipient_certificate"
# del workflow "Android signing recovery". La chiave privata non lascia mai il PC.
#
#   powershell -ExecutionPolicy Bypass -File scripts\signing-recovery-key.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\signing-recovery-key.ps1 -Remove   (a lavoro finito)
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$subject = 'CN=US signing recovery'
$existing = @(Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject })

if ($Remove) {
  $existing | ForEach-Object { Remove-Item -Path "Cert:\CurrentUser\My\$($_.Thumbprint)" -DeleteKey }
  Write-Host "Certificato di recupero rimosso ($($existing.Count))."
  return
}

$cert = $existing | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(1) } |
  Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -Subject $subject -Type DocumentEncryptionCert `
    -KeyAlgorithm RSA -KeyLength 4096 -KeyExportPolicy NonExportable `
    -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(30)
}
$sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($cert.RawData)).Replace('-', '').ToLowerInvariant()
Set-Clipboard -Value ([Convert]::ToBase64String($cert.RawData))
Write-Host "Certificato copiato negli appunti: incollalo in 'recipient_certificate'."
Write-Host "Impronta da ritrovare nel log del workflow (Recipient certificate SHA-256): $sha"
