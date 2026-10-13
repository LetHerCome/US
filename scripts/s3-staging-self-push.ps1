# S3 stage-only FCM sender: run on Windows PowerShell or PowerShell 7.
# Authenticates through real Supabase Auth and requests one generic self-push.
# No Admin/secret/service-role key, no token in logs or disk. The backend itself
# refuses any recipient, FCM token, event or message content in client input.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('A1','A2','B1','B2')]
    [string] $Account,
    [string] $PublishableKey = $env:US_STAGING_SUPABASE_PUBLISHABLE_KEY
)
$ErrorActionPreference = 'Stop'
$stageUrl = 'https://dugmhngrfkuieeletatb.supabase.co'
$emails = @{
    A1 = 'us-s3-a1@qa.invalid'
    A2 = 'us-s3-a2@qa.invalid'
    B1 = 'us-s3-b1@qa.invalid'
    B2 = 'us-s3-b2@qa.invalid'
}
if (-not $PublishableKey) {
    $PublishableKey = Read-Host 'Staging Supabase publishable key (sb_publishable_...)'
}
if ($PublishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]{20,}$') {
    throw 'Only the STAGING publishable key is permitted; never service_role / sb_secret.'
}
$email = $emails[$Account]
Write-Host "Staging self-notification for $Account only. Password is not shown or stored."
$secure = Read-Host -AsSecureString "Password of synthetic account $email"
$password = [System.Net.NetworkCredential]::new('', $secure).Password
$jwt = $null
try {
    $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
    $session = Invoke-RestMethod -Uri "$stageUrl/auth/v1/token?grant_type=password" -Method POST `
        -Headers @{ apikey = $PublishableKey } -ContentType 'application/json' -Body $body
    $jwt = $session.access_token
    if (-not $jwt) { throw 'Staging login returned no session token' }
    $result = Invoke-RestMethod -Uri "$stageUrl/functions/v1/send-web-push" -Method POST `
        -Headers @{ apikey = $PublishableKey; Authorization = "Bearer $jwt" } `
        -ContentType 'application/json' -Body '{"type":"test"}'
    # Only aggregate outcomes. Never emit access tokens, Firebase tokens,
    # credential JSON, couple IDs or private content.
    Write-Host ("S3 QA outcome: delivered={0}, failed={1}, reason={2}, deduplicated={3}" -f `
      $result.delivered,$result.failed,$result.reason,$result.deduplicated)
} catch {
    Write-Error "S3 staging Auth/self-push failed. Check confirmed QA user, couple profile, and staging FCM service secret. Nothing was sent to production."
} finally {
    $password = $null
    $jwt = $null
    $secure = $null
}
