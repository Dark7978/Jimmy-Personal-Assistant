# Script to get ngrok HTTPS URL
Write-Host "Getting ngrok tunnel URL..."
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
    $httpsTunnel = $response.tunnels | Where-Object { $_.proto -eq "https" }
    if ($httpsTunnel) {
        $url = $httpsTunnel.public_url
        Write-Host "✅ Ngrok HTTPS URL: $url"
        Write-Host "Use this URL in Vapi.ai: $url/webhook"
        $url | Set-Content -Path "ngrok_url.txt"
    } else {
        Write-Host "❌ No HTTPS tunnel found. Make sure ngrok is running."
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
    Write-Host "Make sure ngrok is running with: ngrok http 8080"
}
