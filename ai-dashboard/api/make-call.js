// Vercel serverless function for making outbound calls from the dashboard
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phoneNumber, name, message = "Brayden wanted me to check in on you!" } = req.body;

    if (!phoneNumber || !name) {
      return res.status(400).json({ error: 'Phone number and name are required' });
    }

    console.log(`📞 Making call to ${name} at ${phoneNumber}`);

    const callData = {
      assistantId: (process.env.VAPI_ASSISTANT_ID || '').replace(/^\uFEFF/, '').trim(),
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: phoneNumber }
    };

    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Vapi API error:', errorData);
      return res.status(500).json({ error: 'Failed to initiate call' });
    }

    const result = await response.json();
    console.log('✅ Call initiated:', result);

    return res.status(200).json({ 
      success: true, 
      callId: result.id,
      message: `Call initiated to ${name} at ${phoneNumber}`
    });

  } catch (error) {
    console.error('Call error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
