# Script to restore ngrok exclusions after quarantine
Write-Host "Adding ngrok to security exclusions..."

# Add ngrok.exe to Windows Defender exclusions
try {
    Add-MpPreference -ExclusionProcess "ngrok.exe" -ErrorAction Stop
    Write-Host "✅ Added ngrok.exe to Windows Defender exclusions"
} catch {
    Write-Host "❌ Failed to add to Windows Defender: $($_.Exception.Message)"
}

# Add ngrok directory to exclusions
try {
    Add-MpPreference -ExclusionPath "C:\Users\brayd\AppData\Roaming\npm" -ErrorAction Stop
    Write-Host "✅ Added npm directory to Windows Defender exclusions"
} catch {
    Write-Host "❌ Failed to add directory to Windows Defender: $($_.Exception.Message)"
}

# Add firewall rule
try {
    New-NetFirewallRule -DisplayName "Ngrok Tunnel" -Direction Inbound -Program "ngrok.exe" -Action Allow -ErrorAction Stop
    Write-Host "✅ Added ngrok to Windows Firewall"
} catch {
    Write-Host "❌ Failed to add firewall rule: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "🚀 Now you can run: ngrok http 8080"
