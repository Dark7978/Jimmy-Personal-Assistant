// Vapi tool endpoint: handles transfer_to_agent tool calls.
// Returns a new assistant config (system prompt + tools) for the requested sub-agent.
// Vapi will seamlessly hand the call over to the new agent config mid-conversation.

import { AGENTS } from './agents.js';

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

    const handleTransfer = (rawArgs, toolCallId) => {
      let args = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch { args = {}; }
      }
      args = args || {};

      const agentKey = (args.agent || 'main').toLowerCase();
      const reason = args.reason || '';
      const agent = AGENTS[agentKey] || AGENTS.main;

      console.log(`🔀 Transfer to "${agentKey}" agent${reason ? ' — ' + reason : ''}`);

      // Build transition message
      const transitions = {
        main:      "Transferring you back to Jimmy.",
        scheduler: "Let me connect you with the scheduling agent.",
        calendar:  "Let me connect you with the calendar agent.",
        search:    "Let me connect you with the search agent."
      };
      const handoff = transitions[agentKey] || "One moment, transferring you now.";

      results.push({
        toolCallId,
        result: handoff,
        // Vapi reads this and hot-swaps the assistant config for the rest of the call
        assistant: {
          firstMessage: handoff,
          firstMessageMode: 'assistant-speaks-first',
          model: {
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: agent.systemPrompt }],
            tools: agent.tools
          },
          voice: { provider: 'vapi', voiceId: 'Leo' },
          transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' }
        }
      });
    };

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fn = tc.function || tc;
        handleTransfer(fn.arguments, tc.id);
      }
    } else if (legacyFn) {
      handleTransfer(legacyFn.arguments || legacyFn.parameters, legacyFn.id);
    } else {
      return res.status(200).json({});
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error('transfer error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
