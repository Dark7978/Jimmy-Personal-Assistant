// Dynamic outbound calling for your AI assistant
const https = require('https');
require('dotenv').config({ path: './vapi.env' });

// Configuration from environment variables
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

const makeCall = async (phoneNumber, name, message = "Brayden wanted me to check in on you!") => {
  const data = JSON.stringify({
    assistant: ASSISTANT_ID,
    phoneNumber: phoneNumber,
    first_message: `Hi ${name}, this is Brayden's AI assistant. ${message}`,
  });

  const options = {
    hostname: 'api.vapi.ai',
    path: '/call',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          console.log(`✅ Call initiated to ${name} at ${phoneNumber}:`);
          console.log(`📞 Call ID: ${result.id}`);
          console.log(`💬 Message: "${message}"`);
          resolve(result);
        } catch (error) {
          console.log('Response:', responseData);
          resolve(responseData);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error making call:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
};

// Command line usage
const args = process.argv.slice(2);

// Check if environment variables are set
if (!VAPI_API_KEY || VAPI_API_KEY === 'your_vapi_api_key_here') {
  console.log('❌ Error: VAPI_API_KEY not configured in vapi.env');
  console.log('Please edit vapi.env and add your Vapi API key');
  process.exit(1);
}

if (!ASSISTANT_ID || ASSISTANT_ID === 'your_assistant_id_here') {
  console.log('❌ Error: VAPI_ASSISTANT_ID not configured in vapi.env');
  console.log('Please edit vapi.env and add your assistant ID');
  process.exit(1);
}

if (args.length >= 2) {
  const phoneNumber = args[0];
  const name = args[1];
  const message = args[2] || "Brayden wanted me to check in on you!";
  
  console.log(`🚀 Making call to ${name}...`);
  makeCall(phoneNumber, name, message);
} else {
  console.log('Usage: node make_call.js <phone_number> <name> [message]');
  console.log('');
  console.log('Examples:');
  console.log('  node make_call.js "+15551234567" "Mom"');
  console.log('  node make_call.js "+15551234567" "Mom" "Just wanted to say hello!"');
  console.log('  node make_call.js "+15551234567" "John" "Brayden asked me to call about the project"');
  console.log('');
  console.log('Setup: Edit vapi.env to add your VAPI_API_KEY and VAPI_ASSISTANT_ID');
}

module.exports = { makeCall };
