# Vapi Environment Setup

## Step 1: Get Your Vapi API Key
1. Go to https://dashboard.vapi.ai
2. Click "API Keys" in the sidebar
3. Copy your API key

## Step 2: Get Your Assistant ID
1. Go to "Assistants" in Vapi dashboard
2. Find your assistant (the one configured for your phone number)
3. Copy the Assistant ID (looks like: `assistant_xxxxxxxxxxxxxxxx`)

## Step 3: Configure vapi.env
Edit the `vapi.env` file and replace the placeholder values:

```env
# Vapi.ai Configuration
VAPI_API_KEY=your_actual_vapi_api_key_here
VAPI_ASSISTANT_ID=your_actual_assistant_id_here
```

## Step 4: Install dotenv (if not already installed)
```bash
npm install dotenv
```

## Step 5: Test the Configuration
```bash
# Test without making a call (just check configuration)
node make_call.js

# Should show usage instructions if configured correctly
# Should show error if environment variables are missing
```

## Step 6: Make Your First Call
```bash
node make_call.js "+15551234567" "Test Person" "This is a test call"
```

## Security Benefits:
✅ API keys not hardcoded in scripts  
✅ Easy to update without changing code  
✅ Can add vapi.env to .gitignore for security  
✅ Separate configuration from logic  

## File Structure:
```
├── make_call.js          # Main calling script
├── vapi.env             # Environment variables (add to .gitignore)
├── vapi_setup.md        # This setup guide
└── .gitignore           # Make sure vapi.env is ignored
```

Your outbound calling system is now properly configured with environment variables!
