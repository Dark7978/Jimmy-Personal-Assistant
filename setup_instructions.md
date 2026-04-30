# Vapi.ai Voice Integration Setup Instructions

## Current Status
✅ AI Agent server is running on port 8080
✅ Ngrok is installed
❌ Need to create HTTPS tunnel for Vapi.ai

## Manual Setup Steps

### 1. Start Ngrok Tunnel
Open a NEW PowerShell window and run:
```powershell
ngrok http 8080
```

This will show you something like:
```
Forwarding  https://random-string.ngrok.io -> http://localhost:8080
```

### 2. Get HTTPS URL
Copy the HTTPS URL from ngrok output (the `https://random-string.ngrok.io` part).

### 3. Configure Vapi.ai
Go to your Vapi phone number settings:
- URL: https://dashboard.vapi.ai/phone-numbers/fd6b1bf9-d78a-4714-beae-3309cada4bd7
- Set Server URL to: `https://YOUR_NGROK_URL.ngrok.io/webhook`
- Replace `YOUR_NGROK_URL` with the actual URL from ngrok

### 4. Test the Integration
1. Make sure both windows are running:
   - Window 1: AI Agent server (should be running already)
   - Window 2: Ngrok tunnel (just started)

2. Call your Vapi phone number
3. The AI agent should answer and have a voice conversation with you!

## Troubleshooting
- If ngrok doesn't start, try: `ngrok http 8080 --log=stdout`
- If the AI agent server isn't running, start it: `.\target\release\ai-agent.exe server`
- Check that port 8080 is free: `netstat -an | findstr ":8080"`

## What Happens Next
When someone calls your phone number:
1. Vapi.ai sends webhook to your ngrok URL
2. Ngrok forwards to your local AI agent
3. AI agent processes speech with Groq
4. Response is sent back as voice

Your AI agent will be able to have natural voice conversations!
