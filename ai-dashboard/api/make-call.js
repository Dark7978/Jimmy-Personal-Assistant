// Vercel serverless function for making outbound calls from the dashboard
// Supports both personal calls and purpose-based business calls
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phoneNumber, name, message = "Brayden wanted me to check in on you!", purpose, details = {} } = req.body;

    // Business call mode with purpose
    if (purpose) {
      const purposeMessages = {
        hiring: {
          firstMessage: `Hi, this is Brayden's AI assistant calling on behalf of Brayden. I'm calling to inquire about job opportunities at ${name}. Is Brayden able to speak with someone about employment?`,
          context: 'hiring inquiry'
        },
        order: {
          firstMessage: `Hi, this is Brayden's AI assistant. Brayden would like to place an order at ${name}. Can you take the order or should I have Brayden call back?`,
          context: 'placing an order'
        },
        information: {
          firstMessage: `Hi, this is Brayden's AI assistant. Brayden has a few questions about ${name}. Is this a good time to ask?`,
          context: 'general information'
        },
        hours: {
          firstMessage: `Hi, this is Brayden's AI assistant. Brayden is calling to confirm your business hours. What are your current operating hours?`,
          context: 'business hours'
        },
        appointment: {
          firstMessage: `Hi, this is Brayden's AI assistant. Brayden would like to schedule an appointment at ${name}. What times are available?`,
          context: 'scheduling appointment'
        },
        custom: {
          firstMessage: details.customMessage || `Hi, this is Brayden's AI assistant. Brayden is calling about ${name}.`,
          context: 'custom inquiry'
        }
      };

      const messageConfig = purposeMessages[purpose] || purposeMessages.custom;
      const firstMessage = messageConfig.firstMessage;

      console.log(`📞 Making business call to ${name} at ${phoneNumber}`);
      console.log(`🎯 Purpose: ${purpose}`);

      const callData = {
        assistantId: (process.env.VAPI_ASSISTANT_ID || '').replace(/^\uFEFF/, '').trim(),
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: phoneNumber },
        assistantOverrides: {
          firstMessage: firstMessage
        }
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
      console.log('✅ Business call initiated:', result);

      return res.status(200).json({ 
        success: true, 
        callId: result.id,
        businessName: name,
        purpose,
        context: messageConfig.context,
        message: `Call initiated to ${name} for ${purpose}`
      });
    }

    // Regular personal call mode
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
