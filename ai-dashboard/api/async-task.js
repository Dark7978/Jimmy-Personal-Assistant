// Async task endpoint — handles long-running work off the live call.
// When an agent calls the do_async_task tool, this endpoint:
//   1. Immediately ACKs so Vapi ends the call
//   2. Runs the task in the background (waitUntil)
//   3. Calls the user back with the result when done
import { waitUntil } from '@vercel/functions';
import { getCalendarEvents } from './calendar-tool.js';

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://jimmy-ai-assistant.vercel.app';

// ── Run the requested task and return a spoken result string ──
async function runTask(taskType, taskArgs) {
  switch (taskType) {

    case 'transfer_with_feedback': {
      const { targetNumber, targetName, callbackNumber } = taskArgs;
      if (!targetNumber || !callbackNumber) {
        return "I couldn't transfer — missing target or callback number.";
      }

      // Call the target number
      const callRes = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assistantId: (process.env.VAPI_ASSISTANT_ID || '').replace(/^\uFEFF/, '').trim(),
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
          customer: { number: targetNumber },
          assistantOverrides: {
            firstMessage: `Brayden asked me to connect you to him.`,
            endCallFunctionEnabled: true
          }
        })
      });

      if (!callRes.ok) {
        console.error('Transfer call failed:', callRes.status, await callRes.text());
        await callBackWithResult(callbackNumber, `Sorry, I couldn't reach ${targetName}. Something went wrong.`);
        return;
      }

      const callData = await callRes.json();
      const callId = callData.id;
      console.log(`📞 Transfer call to ${targetName} started: ${callId}`);

      // Wait 25 seconds to see if they answer
      await new Promise(r => setTimeout(r, 25000));

      // Check call status
      const statusRes = await fetch(`https://api.vapi.ai/call/${callId}`, {
        headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}` }
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const status = (statusData.status || '').toLowerCase();

        if (['ringing', 'in-progress', 'queued'].includes(status)) {
          console.log(`✅ ${targetName} answered (${status}) — no callback needed.`);
          return; // They answered, don't call back
        }

        console.log(`❌ ${targetName} didn't answer (status: ${status}) — calling back Brayden.`);
        await callBackWithResult(callbackNumber, `Unfortunately ${targetName} didn't pick up. I tried calling them but there was no answer.`);
        return;
      }

      console.error('Status check failed:', statusRes.status);
      await callBackWithResult(callbackNumber, `I tried calling ${targetName} but couldn't tell if they answered. Sorry about that.`);
      return;
    }

    case 'calendar_events': {
      const events = await getCalendarEvents(taskArgs);
      if (!events.length) return "You've got nothing on your calendar for that period.";
      return events.slice(0, 5).map(e => {
        const start = e.start?.dateTime || e.start?.date;
        const when = start ? new Date(start).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
        }) : 'All day';
        return `${e.summary || 'Untitled'} on ${when}`;
      }).join('. ');
    }

    case 'web_search': {
      const query = taskArgs.query;
      if (!query) return "I didn't have a search query to look up.";
      const res = await fetch(`${BASE_URL}/api/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, num: 3 })
      });
      const data = await res.json();
      if (!data.results?.length) return `I couldn't find anything for "${query}".`;
      // Summarise top result for voice
      const top = data.results[0];
      return `Here's what I found for "${query}": ${top.snippet || top.title}.`;
    }

    default:
      return `I finished the task but I'm not sure how to summarise the result for ${taskType}.`;
  }
}

// ── Fire an outbound callback with the task result as the first message ──
async function callBackWithResult(phoneNumber, resultText, attempt = 1) {
  const firstMessage = resultText;
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
    console.log(`📲 Async callback attempt ${attempt} to ${phoneNumber}: HTTP ${callRes.status}`);

    if (callRes.ok) {
      try {
        const json = JSON.parse(text);
        callId = json.id;
        const status = (json.status || '').toLowerCase();
        success = !['failed', 'error', 'ended'].includes(status);
      } catch { success = true; }
    }
  } catch (e) {
    console.error(`Async callback attempt ${attempt} threw:`, e);
  }

  if (!success && attempt < 2) {
    console.log(`🔁 Async callback didn't go through (callId=${callId}), retrying in 8s...`);
    await new Promise(r => setTimeout(r, 8000));

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
      } catch (e) { console.error('Status check failed:', e); }
    }

    await callBackWithResult(phoneNumber, resultText, 2);
  }
}

// ── Main handler ──
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const msg = body.message || {};
    const toolCalls = msg.toolCalls || msg.toolCallList || [];
    const legacyFn = msg.functionCall || msg.function_call;
    const customerNumber = msg.call?.customer?.number || body.call?.customer?.number;

    const results = [];

    const handleTask = (rawArgs, toolCallId) => {
      let args = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch { args = {}; }
      }
      args = args || {};

      const taskType = args.taskType || args.task_type;
      const taskArgs = args.taskArgs || args.task_args || {};
      const phoneNumber = args.phoneNumber || customerNumber;

      if (!phoneNumber) {
        results.push({ toolCallId, result: "I don't have a number to call back on." });
        return;
      }
      if (!taskType) {
        results.push({ toolCallId, result: "No task type provided." });
        return;
      }

      console.log(`⚙️  Async task "${taskType}" for ${phoneNumber}, running in background...`);

      // Run the task and call back — all in the background after response is sent
      waitUntil((async () => {
        try {
          const result = await runTask(taskType, taskArgs);
          await callBackWithResult(phoneNumber, result);
        } catch (e) {
          console.error('Async task failed:', e);
          await callBackWithResult(phoneNumber, "Hey, I ran into an issue getting that for you. Sorry about that.");
        }
      })());

      results.push({
        toolCallId,
        result: `Task started. Tell Brayden "I'll call you right back once I've got that." then end the call using the endCall tool.`
      });
    };

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fn = tc.function || tc;
        handleTask(fn.arguments, tc.id);
      }
    } else if (legacyFn) {
      handleTask(legacyFn.arguments || legacyFn.parameters, legacyFn.id);
    } else {
      return res.status(200).json({});
    }

    return res.status(200).json({ results, endCallAfterSpoken: true });
  } catch (err) {
    console.error('async-task error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
