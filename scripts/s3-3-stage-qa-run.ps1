# US Store S3.3 / local Windows runner.
# Prompts for four known SYNTHETIC QA identities, no credentials in CLI args or repo.
# Node script is hard pinned to US-STAGING; it never creates/deletes users or files.
$ErrorActionPreference = 'Stop'
$actors = @('A1','A2','B1','B2')
$keys = New-Object System.Collections.Generic.List[string]
try {
  $attestation = Read-Host 'Type FOUR_INDEPENDENT_SYNTHETIC_QA_ACCOUNTS to attest these are all synthetic QA accounts'
  if ($attestation -cne 'FOUR_INDEPENDENT_SYNTHETIC_QA_ACCOUNTS') {
    throw 'S33 BLOCKED: synthetic QA account attestation missing'
  }
  $apiKey = Read-Host 'US-STAGING publishable sb_publishable_ key (never a secret/service_role key)'
  if ($apiKey -cnotmatch '^sb_publishable_[A-Za-z0-9_-]{12,}$') {
    throw 'S33 BLOCKED: invalid publishable key'
  }
  $vars = @{
    'US_S33_SEED_CONFIRM' = 'US_S33_SYNTHETIC_STAGE_ONLY'
    'US_S33_QA_ATTESTATION' = $attestation
    'US_S33_STAGING_PUBLISHABLE_KEY' = $apiKey
  }
  foreach ($entry in $vars.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    $keys.Add($entry.Key)
  }
  foreach ($actor in $actors) {
    $email = Read-Host "Synthetic QA $actor email (US-STAGING only)"
    $secret = Read-Host "Synthetic QA $actor password (hidden)" -AsSecureString
    $emailKey = 'US_S33_' + $actor + '_EMAIL'
    $passKey = 'US_S33_' + $actor + '_PASSWORD'
    [Environment]::SetEnvironmentVariable($emailKey, $email, 'Process')
    $keys.Add($emailKey)
    $plain = [System.Net.NetworkCredential]::new('', $secret).Password
    [Environment]::SetEnvironmentVariable($passKey, $plain, 'Process')
    $keys.Add($passKey)
    $plain = $null
    $secret.Dispose()
  }
  $root = Split-Path -Parent $PSScriptRoot
  $runner = Join-Path $root 'scripts\s3-3-seed-and-verify-stage.cjs'
  & node $runner
  if ($LASTEXITCODE -ne 0) { throw 'S33 BLOCKED: stage-only test did not pass' }
}
finally {
  foreach ($key in $keys) {
    [Environment]::SetEnvironmentVariable($key, $null, 'Process')
  }
}
