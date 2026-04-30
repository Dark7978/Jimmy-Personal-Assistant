// Vercel serverless function to proxy Vapi webhooks to your local AI agent
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const vapiMessage = req.body;
    console.log('📞 Received Vapi event:', vapiMessage.message?.type);

    // Handle different Vapi event types
    switch (vapiMessage.message?.type) {
      case 'assistant-request':
        // New call starting - create assistant configuration
        const assistantResponse = {
          assistant: {
            first_message: "Hello! I'm your AI assistant. How can I help you today?",
            model: {
              provider: "groq",
              model: "llama-3.1-8b-instant",
              messages: []
            },
            voice: {
              provider: "11labs",
              voice_id: "rachel"
            }
          }
        };
        return res.status(200).json(assistantResponse);

      case 'function-calls':
        // Tool calls - return empty response for now
        return res.status(200).json({});

      case 'transcript':
        // Process user speech
        if (vapiMessage.message?.transcript?.trim()) {
          try {
            const response = await processUserSpeech(vapiMessage.message.transcript);
            const transcriptResponse = {
              messages: [{
                role: "assistant",
                content: response
              }]
            };
            return res.status(200).json(transcriptResponse);
          } catch (error) {
            console.error('Error processing speech:', error);
            const errorResponse = {
              messages: [{
                role: "assistant",
                content: "I'm sorry, I had trouble processing that. Could you please repeat?"
              }]
            };
            return res.status(200).json(errorResponse);
          }
        }
        return res.status(200).json({});

      default:
        // Other events - return empty response
        return res.status(200).json({});
    }

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Process user speech using Groq API
async function processUserSpeech(userInput) {
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant having a voice conversation. Be concise and natural in your responses. Avoid markdown formatting and special characters that don\'t work well in speech.'
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }

  const data = await response.json();
  const aiResponse = data.choices[0].message.content;

  // Clean up response for voice (remove markdown, etc.)
  return aiResponse
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/```/g, '')
    .replace(/#/g, '')
    .trim();
}
