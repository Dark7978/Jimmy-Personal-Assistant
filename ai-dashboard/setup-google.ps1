# Interactive setup for Google Calendar OAuth credentials.
# Prompts for Client ID + Client Secret, sets them in Vercel, redeploys, opens browser.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== Google Calendar Setup ===" -ForegroundColor Cyan
Write-Host ""

# Prompt for Client ID (not secret, plain input)
$clientId = Read-Host "Paste your Google Client ID"
if ([string]::IsNullOrWhiteSpace($clientId)) {
    Write-Host "Client ID can't be empty. Aborting." -ForegroundColor Red
    exit 1
}

# Prompt for Client Secret (masked input)
$clientSecretSecure = Read-Host "Paste your Google Client Secret" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($clientSecretSecure)
$clientSecret = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($clientSecret)) {
    Write-Host "Client Secret can't be empty. Aborting." -ForegroundColor Red
    exit 1
}

# Helper: remove existing var if present, then add fresh
function Set-VercelEnv($name, $value) {
    Write-Host ""
    Write-Host "Setting $name in Vercel (production)..." -ForegroundColor Yellow
    & vercel env rm $name production -y 2>$null | Out-Null
    $value | & vercel env add $name production
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set $name"
    }
}

Set-VercelEnv 'GOOGLE_CLIENT_ID' $clientId
Set-VercelEnv 'GOOGLE_CLIENT_SECRET' $clientSecret

Write-Host ""
Write-Host "Redeploying..." -ForegroundColor Yellow
& vercel --prod
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Now opening the consent screen in your browser..." -ForegroundColor Cyan
Write-Host "Sign in with the same Google account you added as a Test User."
Write-Host ""
Start-Sleep -Seconds 2
Start-Process "https://jimmy-ai-assistant.vercel.app/api/google-auth"

Write-Host "After you authorize, the page will show a refresh token + a single command to save it."
Write-Host "Run that command, then come back to chat and tell me 'done'."
Write-Host ""
