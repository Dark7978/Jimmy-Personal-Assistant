// Vapi inbound webhook: gates incoming calls with an allowlist.
// Phone number's server.url points here. Vapi calls this with type=assistant-request
// when a new call comes in, and we return either the real assistant
// or a polite refusal assistant for unknown callers.

import { AGENTS } from './agents.js';

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://jimmy-ai-assistant.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const msg = body.message || {};
    const eventType = msg.type;

    console.log(`📞 Vapi webhook event: ${eventType}`);

    if (eventType !== 'assistant-request') {
      // We don't need to handle other events here (end-of-call, status, etc.)
      return res.status(200).json({});
    }

    // Who's calling? Vapi puts the caller number in message.call.customer.number
    const callerNumber = normalize(msg.call?.customer?.number || msg.customer?.number);
    const allowed = parseAllowlist(process.env.ALLOWED_CALLERS).map(normalize);
    const isAllowed = callerNumber && allowed.includes(callerNumber);

    console.log(`   caller=${callerNumber} allowed=${isAllowed}`);

    if (!isAllowed) {
      // Polite refusal + auto end call
      return res.status(200).json({
        assistant: {
          firstMessage: "Sorry, this line isn't accepting calls right now. Goodbye.",
          firstMessageMode: 'assistant-speaks-first',
          endCallFunctionEnabled: true,
          model: {
            provider: 'groq',
            model: 'llama-3.1-8b-instant',
            messages: [{
              role: 'system',
              content: "You are a refusal bot. You do NOT help the caller with anything. Your only job is to say 'Sorry, this line isn't accepting calls right now. Goodbye.' and then end the call immediately using the endCall tool. Do not answer questions, do not chat, do not reveal any information about Brayden or this number."
            }],
            tools: [{ type: 'endCall' }]
          },
          voice: { provider: 'vapi', voiceId: 'Leo' },
          transcriber: { provider: 'deepgram', model: 'flux-general-en', language: 'en' },
          maxDurationSeconds: 30
        }
      });
    }

    // Allowed caller: boot the main agent with full inline config (not assistantOverrides)
    const mainAgent = AGENTS.main;
    console.log(`📦 Sending ${mainAgent.tools.length} tools to assistant:`, mainAgent.tools.map(t => t.function?.name || t.type));
    return res.status(200).json({
      assistant: {
        firstMessage: "Hey, what's up?",
        firstMessageMode: 'assistant-speaks-first',
        model: {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: mainAgent.systemPrompt }],
          tools: mainAgent.tools
        },
        voice: { provider: 'vapi', voiceId: 'Leo' },
        transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' },
        endCallFunctionEnabled: true
      }
    });
  } catch (err) {
    console.error('webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function normalize(num) {
  if (!num) return '';
  return String(num).replace(/[^\d+]/g, '');
}

function parseAllowlist(raw) {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}
