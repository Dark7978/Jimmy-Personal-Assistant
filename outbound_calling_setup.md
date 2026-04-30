# Outbound Calling Setup Guide

## What You Need:

1. **Vapi API Key** - Get from Vapi dashboard
2. **Your Assistant ID** - Get from Vapi dashboard  
3. **Contact phone numbers** - Add to the contacts list

## Setup Steps:

### 1. Get Your Vapi API Key:
- Go to https://dashboard.vapi.ai
- Click "API Keys" in the sidebar
- Copy your API key

### 2. Get Your Assistant ID:
- Go to "Assistants" in Vapi dashboard
- Find your assistant
- Copy the ID (looks like: `assistant_xxxxxxxxxxxxxxxx`)

### 3. Configure the Script:
Edit `call_mom.js`:
- Replace `YOUR_VAPI_API_KEY_HERE` with your API key
- Replace `YOUR_ASSISTANT_ID_HERE` with your assistant ID
- Add your mom's phone number: `phone: '+1XXXXXXXXXX'`

### 4. Make a Call:
```bash
node call_mom.js mom
```

## Available Commands:

```bash
# Call mom
node call_mom.js mom

# Add more contacts to the contacts object:
const contacts = {
  mom: {
    phone: '+1XXXXXXXXXX',
    name: 'Mom',
    message: 'Brayden wanted me to check in on you!'
  },
  dad: {
    phone: '+1XXXXXXXXXX', 
    name: 'Dad',
    message: 'Just saying hello!'
  }
};
```

## What Happens When You Call:

1. Your AI assistant calls the contact
2. Says the custom message
3. Has a natural conversation
4. Contact can talk back to your AI

## Cost:
- Vapi outbound calls: ~$0.01 per minute
- Groq API: Free tier covers most usage
- Very affordable for occasional check-ins

## Safety Tips:
- Only call people who know about your AI assistant
- Test with yourself first
- Be respectful of calling times
- Get permission from contacts

Your AI assistant can now make outbound calls to check on people!
