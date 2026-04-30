// Contact lookup endpoint — allows the assistant to look up contacts by name
// and also add new contacts if unknown.
import { OWNER_PROFILE } from './brayden-context.js';

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

    const handleLookup = (rawArgs, toolCallId) => {
      let args = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch { args = {}; }
      }
      args = args || {};

      const name = args.name || args.contact;
      if (!name) {
        results.push({ toolCallId, result: "I need a name to look up." });
        return;
      }

      const contact = OWNER_PROFILE.getContact(name);
      if (!contact || !contact.number) {
        results.push({
          toolCallId,
          result: `I don't have a phone number for ${name}. What's their number?`
        });
        return;
      }

      results.push({
        toolCallId,
        result: `Found ${contact.name}: ${contact.number}`
      });
    };

    const handleAdd = (rawArgs, toolCallId) => {
      let args = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch { args = {}; }
      }
      args = args || {};

      const name = args.name || args.contact;
      const number = args.phone_number || args.phoneNumber || args.number;

      if (!name || !number) {
        results.push({ toolCallId, result: "I need both a name and a phone number." });
        return;
      }

      // Normalize number
      const normalized = String(number).replace(/[^\d+]/g, '');
      OWNER_PROFILE.addContact(name, normalized);

      results.push({
        toolCallId,
        result: `Got it — ${name} saved as ${normalized}.`
      });
    };

    const handleCall = (rawArgs, toolCallId) => {
      let args = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch { args = {}; }
      }
      args = args || {};

      const name = args.name || args.contact;
      let number = args.phone_number || args.phoneNumber || args.number;
      const customerNumber = msg.call?.customer?.number || body.call?.customer?.number;

      // If name but no number, look it up
      if (name && !number) {
        const contact = OWNER_PROFILE.getContact(name);
        if (contact && contact.number) {
          number = contact.number;
        } else {
          results.push({
            toolCallId,
            result: `I don't have a phone number for ${name}. What's their number?`
          });
          return;
        }
      }

      if (!number) {
        results.push({ toolCallId, result: "I need a phone number to call." });
        return;
      }

      const normalized = String(number).replace(/[^\d+]/g, '');

      // Use async transfer with feedback: end call, call target, callback if no answer
      results.push({
        toolCallId,
        result: `Let me call ${name || normalized} for you. I'll call you right back if they don't pick up.`,
        // Use the async task pattern
        asyncTask: {
          type: 'function',
          function: {
            name: 'do_async_task',
            arguments: JSON.stringify({
              taskType: 'transfer_with_feedback',
              taskArgs: {
                targetNumber: normalized,
                targetName: name || normalized,
                callbackNumber: customerNumber
              }
            })
          },
          server: { url: `${BASE_URL}/api/async-task` }
        },
        endCallAfterSpoken: true
      });
    };

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fn = tc.function || tc;
        if (fn.name === 'lookup_contact') {
          handleLookup(fn.arguments, tc.id);
        } else if (fn.name === 'add_contact') {
          handleAdd(fn.arguments, tc.id);
        } else if (fn.name === 'transfer_to_contact') {
          handleCall(fn.arguments, tc.id);
        }
      }
    } else if (legacyFn) {
      if (legacyFn.name === 'lookup_contact') {
        handleLookup(legacyFn.arguments || legacyFn.parameters, legacyFn.id);
      } else if (legacyFn.name === 'add_contact') {
        handleAdd(legacyFn.arguments || legacyFn.parameters, legacyFn.id);
      } else if (legacyFn.name === 'transfer_to_contact') {
        handleCall(legacyFn.arguments || legacyFn.parameters, legacyFn.id);
      }
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error('contacts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
