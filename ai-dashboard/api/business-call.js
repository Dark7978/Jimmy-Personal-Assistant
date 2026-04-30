// Business inquiry calling - enhanced outbound calls with specific purposes
// Supports: ordering, hiring inquiries, general information, etc.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phoneNumber, businessName, purpose, details = {} } = req.body;

    if (!phoneNumber || !businessName || !purpose) {
      return res.status(400).json({ error: 'phoneNumber, businessName, and purpose are required' });
    }

    // Define purpose-specific messages
    const purposeMessages = {
      hiring: {
        firstMessage: `Hi, this is Brayden's AI assistant calling on behalf of Brayden. I'm calling to inquire about job opportunities at ${businessName}. Is Brayden able to speak with someone about employment?`,
        context: 'hiring inquiry'
      },
      order: {
        firstMessage: `Hi, this is Brayden's AI assistant. Brayden would like to place an order at ${businessName}. Can you take the order or should I have Brayden call back?`,
        context: 'placing an order'
      },
      information: {
        firstMessage: `Hi, this is Brayden's AI assistant. Brayden has a few questions about ${businessName}. Is this a good time to ask?`,
        context: 'general information'
      },
      hours: {
        firstMessage: `Hi, this is Brayden's AI assistant. Brayden is calling to confirm your business hours. What are your current operating hours?`,
        context: 'business hours'
      },
      appointment: {
        firstMessage: `Hi, this is Brayden's AI assistant. Brayden would like to schedule an appointment at ${businessName}. What times are available?`,
        context: 'scheduling appointment'
      },
      custom: {
        firstMessage: details.customMessage || `Hi, this is Brayden's AI assistant. Brayden is calling about ${businessName}.`,
        context: 'custom inquiry'
      }
    };

    const messageConfig = purposeMessages[purpose] || purposeMessages.custom;
    const firstMessage = messageConfig.firstMessage;

    console.log(`📞 Making business call to ${businessName} at ${phoneNumber}`);
    console.log(`🎯 Purpose: ${purpose}`);

    const callData = {
      assistantId: (process.env.VAPI_ASSISTANT_ID || '').replace(/^\uFEFF/, '').trim(),
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: phoneNumber },
      firstMessage: firstMessage
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
      businessName,
      purpose,
      context: messageConfig.context,
      message: `Call initiated to ${businessName} for ${purpose}`
    });

  } catch (error) {
    console.error('Business call error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
