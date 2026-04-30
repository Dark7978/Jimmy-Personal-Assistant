// Call your mom (or any contact) with your AI assistant
const https = require('https');

// Your Vapi API key (get from Vapi dashboard)
const VAPI_API_KEY = 'YOUR_VAPI_API_KEY_HERE';

// Your assistant ID (get from Vapi dashboard)
const ASSISTANT_ID = 'YOUR_ASSISTANT_ID_HERE';

// Contacts list
const contacts = {
  mom: {
    phone: '+1XXXXXXXXXX', // Replace with your mom's number
    name: 'Mom',
    message: 'Brayden wanted me to check in on you and see how you\'re doing!'
  },
  // Add more contacts here
  // dad: {
  //   phone: '+1XXXXXXXXXX',
  //   name: 'Dad', 
  //   message: 'Just saying hello from Brayden\'s AI assistant!'
  // }
};

const makeCall = async (contactKey) => {
  const contact = contacts[contactKey];
  if (!contact) {
    console.log('Contact not found:', contactKey);
    return;
  }

  const data = JSON.stringify({
    assistant: ASSISTANT_ID,
    phoneNumber: contact.phone,
    first_message: `Hi ${contact.name}, this is Brayden's AI assistant. ${contact.message}`,
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
          console.log(`✅ Call initiated to ${contact.name}:`, result);
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
const contactKey = process.argv[2];
if (contactKey) {
  makeCall(contactKey);
} else {
  console.log('Usage: node call_mom.js <contact_name>');
  console.log('Available contacts:', Object.keys(contacts).join(', '));
}

module.exports = { makeCall, contacts };
