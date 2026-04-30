// SMS endpoint — handles sending and receiving SMS messages
// Integrates with Vapi's SMS capabilities.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const msg = body.message || {};
    const toolCalls = msg.toolCalls || msg.toolCallList || [];
    const legacyFn = msg.functionCall || msg.function_call;

    const results = [];

    const handleSend = async (rawArgs, toolCallId) => {
      let args = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch { args = {}; }
      }
      args = args || {};

      const to = args.to || args.phoneNumber || args.phone_number;
      const message = args.message || args.text || args.body;

      if (!to || !message) {
        results.push({ toolCallId, result: "I need both a phone number and a message to send." });
        return;
      }

      // Normalize number
      const normalized = String(to).replace(/[^\d+]/g, '');

      try {
        // Use Vapi's SMS API
        const smsRes = await fetch('https://api.vapi.ai/sms', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
            to: normalized,
            message: message
          })
        });

        if (smsRes.ok) {
          results.push({ toolCallId, result: `Text sent to ${normalized}.` });
        } else {
          const errorText = await smsRes.text();
          console.error('SMS send failed:', smsRes.status, errorText);
          results.push({ toolCallId, result: `Sorry, I couldn't send the text. Something went wrong.` });
        }
      } catch (e) {
        console.error('SMS send error:', e);
        results.push({ toolCallId, result: `Sorry, I couldn't send the text. Something went wrong.` });
      }
    };

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fn = tc.function || tc;
        if (fn.name === 'send_sms' || fn.name === 'send_text') {
          await handleSend(fn.arguments, tc.id);
        }
      }
    } else if (legacyFn) {
      if (legacyFn.name === 'send_sms' || legacyFn.name === 'send_text') {
        await handleSend(legacyFn.arguments || legacyFn.parameters, legacyFn.id);
      }
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error('sms error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
