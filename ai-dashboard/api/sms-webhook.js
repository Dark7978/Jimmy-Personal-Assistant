// SMS webhook — receives incoming SMS messages from Vapi
// When someone texts the Vapi number, Vapi sends the message here.
// This endpoint processes the message and can trigger actions or responses.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    console.log(`📨 SMS received:`, body);

    // Extract message details
    const from = body.from || body.phoneNumber;
    const message = body.message || body.text || body.body;

    if (!from || !message) {
      console.error('Invalid SMS payload:', body);
      return res.status(400).json({ error: 'Invalid SMS payload' });
    }

    console.log(`📨 From ${from}: "${message}"`);

    // TODO: Process the SMS message
    // - Could trigger assistant actions
    // - Could send a response back
    // - Could log to database
    // - Could integrate with other systems

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('sms-webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
