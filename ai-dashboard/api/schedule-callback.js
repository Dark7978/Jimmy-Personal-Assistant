// Tool endpoint for Vapi assistant: schedule a callback after N seconds.
// Supports long delays (minutes, hours) by chaining relay hops.
// The voice assistant invokes this when the user says "call me back in X".
import { waitUntil } from '@vercel/functions';

const HOP_SECONDS = 45; // each relay hop waits this long, then re-invokes itself
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://jimmy-ai-assistant.vercel.app';

// ── Fire the outbound callback call; retry once if it doesn't go through ──
async function fireCallWithRetry(phoneNumber, reason, attempt = 1) {
  const firstMessage = `Hey, calling you back like you asked. ${reason !== 'as you asked' ? reason + '.' : ''} What's up?`;
  let callId = null;
  let success = false;

  try {
    const callRes = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: (process.env.VAPI_ASSISTANT_ID || '').replace(/^\uFEFF/, '').trim(),
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: phoneNumber },
        assistantOverrides: { firstMessage }
      })
    });

    const text = await callRes.text();
    console.log(`☎️  Callback attempt ${attempt} to ${phoneNumber}: HTTP ${callRes.status} ${text.slice(0, 200)}`);

    if (callRes.ok) {
      try {
        const json = JSON.parse(text);
        callId = json.id;
        // status may be 'queued', 'ringing', 'in-progress' — all fine; only 'failed'/'error' is bad
        const status = (json.status || '').toLowerCase();
        success = !['failed', 'error', 'ended'].includes(status);
      } catch {
        success = true; // non-JSON but 2xx — treat as OK
      }
    }
  } catch (e) {
    console.error(`Callback attempt ${attempt} threw:`, e);
  }

  if (!success && attempt < 2) {
    console.log(`🔁 Call didn't go through (callId=${callId}), retrying in 8s...`);
    await new Promise(r => setTimeout(r, 8000));

    // Verify the call status before retrying in case Vapi just hadn't updated yet
    if (callId) {
      try {
        const checkRes = await fetch(`https://api.vapi.ai/call/${callId}`, {
          headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}` }
        });
        if (checkRes.ok) {
          const check = await checkRes.json();
          const liveStatus = (check.status || '').toLowerCase();
          if (['ringing', 'in-progress', 'queued'].includes(liveStatus)) {
            console.log(`✅ Call ${callId} is actually ${liveStatus} — no retry needed.`);
            return;
          }
        }
      } catch (e) {
        console.error('Status check failed:', e);
      }
    }

    await fireCallWithRetry(phoneNumber, reason, 2);
  }
}

// ── Internal relay: sleep then either fire the call or chain another hop ──
async function relayHop(phoneNumber, remainingSeconds, reason) {
  const sleepFor = Math.min(remainingSeconds, HOP_SECONDS);
  await new Promise(r => setTimeout(r, sleepFor * 1000));

  const left = remainingSeconds - sleepFor;

  if (left <= 0) {
    // Time's up — make the call, with one automatic retry if it doesn't go through
    await fireCallWithRetry(phoneNumber, reason);
  } else {
    // More time left — chain the next hop via a new request to ourselves
    console.log(`🔗 Relay: ${left}s remaining for ${phoneNumber}, chaining next hop...`);
    try {
      await fetch(`${BASE_URL}/api/schedule-callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _relay: true,
          phoneNumber,
          remainingSeconds: left,
          reason
        })
      });
    } catch (e) {
      console.error('Relay chain failed:', e);
    }
  }
}

function normalize(num) {
  if (!num) return '';
  return String(num).replace(/[^\d+]/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};

    // ── Handle internal relay hops ──
    if (body._relay) {
      const { phoneNumber, remainingSeconds, reason } = body;
      console.log(`⏰ Relay hop: ${remainingSeconds}s left for ${phoneNumber}`);
      waitUntil(relayHop(phoneNumber, remainingSeconds, reason || 'as you asked'));
      return res.status(200).json({ ok: true, remaining: remainingSeconds });
    }

    // ── Handle Vapi tool calls ──
    console.log('🛠 Tool webhook received:', JSON.stringify(body).slice(0, 500));

    const msg = body.message || {};
    const toolCalls = msg.toolCalls || msg.toolCallList || [];
    const legacyFn = msg.functionCall || msg.function_call;

    // Pull customer phone from Vapi call payload as default
    const customerNumber = msg.call?.customer?.number || body.call?.customer?.number;

    const results = [];

    const handleArgs = (rawArgs, toolCallId) => {
      let args = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch { args = {}; }
      }
      args = args || {};

      const delaySeconds = Math.max(parseInt(args.delaySeconds || args.delay_seconds || 20, 10), 5);
      // Use an explicitly provided number, or fall back to the caller's number.
      const phoneNumber = normalize(args.phoneNumber || args.phone_number) || customerNumber;
      const reason = args.reason || 'as you asked';

      if (!phoneNumber) {
        results.push({
          toolCallId,
          result: "I don't have a phone number to call back. Please tell me the number first."
        });
        return;
      }

      // Human-friendly time label
      const label = delaySeconds >= 3600 ? `${Math.round(delaySeconds / 3600 * 10) / 10} hour(s)`
                   : delaySeconds >= 60   ? `${Math.round(delaySeconds / 60)} minute(s)`
                   : `${delaySeconds} seconds`;

      console.log(`⏰ Scheduling callback to ${phoneNumber} in ${label} (${reason})`);

      // Kick off the relay chain
      waitUntil(relayHop(phoneNumber, delaySeconds, reason));

      results.push({
        toolCallId,
        result: `Callback scheduled for ${label} from now. Tell the user "Got it, I'll call you back in ${label}. Talk soon!" and then end the call immediately using the endCall tool.`
      });
    };

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fn = tc.function || tc;
        handleArgs(fn.arguments, tc.id);
      }
    } else if (legacyFn) {
      handleArgs(legacyFn.arguments || legacyFn.parameters, legacyFn.id);
    } else {
      return res.status(200).json({});
    }

    return res.status(200).json({ results, endCallAfterSpoken: true });
  } catch (err) {
    console.error('schedule-callback error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
