// Vercel serverless function for AI chat with Groq API
import { ownerSummary, OWNER_PROFILE } from './brayden-context.js';

// Build a Vapi call payload that carries chat context to the voice assistant
function buildCallPayload(phoneNumber, name, conversationHistory = [], reason = '') {
  const recent = conversationHistory.slice(-8).map(m =>
    `${m.role === 'user' ? 'Brayden' : 'You (AI)'}: ${m.content}`
  ).join('\n');

  const isCallingBrayden = name && name.toLowerCase() === 'brayden';
  const greetingTarget = isCallingBrayden ? 'Brayden' : (name || 'there');

  // Generate a context-aware first message
  let firstMessage;
  if (recent && isCallingBrayden) {
    firstMessage = `Hey Brayden, you asked me to call you${reason ? ' ' + reason : ''}. What's up?`;
  } else if (recent) {
    firstMessage = `Hi ${greetingTarget}, this is Brayden's AI assistant. He asked me to give you a call.`;
  } else {
    firstMessage = `Hi ${greetingTarget}, this is Brayden's AI assistant.`;
  }

  const contextSystemMessage = recent
    ? `You are continuing a conversation. Brayden was just chatting with you in his web dashboard and asked you to call ${isCallingBrayden ? 'him' : (name || 'this person')}. Here's the recent chat for context:\n\n${recent}\n\nUse this context naturally on the call. Don't read it verbatim — just reference it like you remember the conversation. Keep responses short and conversational since this is a voice call.`
    : null;

  const payload = {
    assistantId: (process.env.VAPI_ASSISTANT_ID || '').replace(/^\uFEFF/, '').trim(),
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: { number: phoneNumber },
    assistantOverrides: {
      firstMessage,
    }
  };

  if (contextSystemMessage) {
    payload.assistantOverrides.model = {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: contextSystemMessage }]
    };
  }

  return payload;
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`💬 Processing chat message: "${message}"`);

    // Check if this is a command that requires special handling
    const lowerMessage = message.toLowerCase();

    // Detect retry intent ("try again", "call again", "retry", "yes", "do it") and pull the last number from history
    const isRetry = /\b(try again|call again|retry|do it again|again|yes|yeah|sure|ok)\b/i.test(message)
                    && !lowerMessage.includes('call ')
                    && !lowerMessage.match(/\d{10}/);
    if (isRetry && conversationHistory.length > 0) {
      // Find the most recent phone number mentioned in conversation
      const recentText = conversationHistory.slice(-6).map(m => m.content).join(' ');
      const lastNumberMatch = recentText.match(/\+1\d{10}/);
      if (lastNumberMatch) {
        const phoneNumber = lastNumberMatch[0];
        console.log(`🔁 Retry detected, calling ${phoneNumber}`);
        const callResponse = await fetch('https://api.vapi.ai/call', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildCallPayload(phoneNumber, null, conversationHistory, 'to retry the call'))
        });
        if (callResponse.ok) {
          const callResult = await callResponse.json();
          return res.status(200).json({
            response: `🔁 Calling ${phoneNumber} again now! Hope they pick up this time.`,
            action: 'call_retried',
            callId: callResult.id
          });
        } else {
          const errorText = await callResponse.text();
          return res.status(200).json({
            response: `❌ Couldn't retry the call to ${phoneNumber}. ${errorText}`,
            action: 'call_failed'
          });
        }
      }
    }
    
    // Handle calling commands (including "call me at <number>")
    if (lowerMessage.includes('call') && (lowerMessage.includes('mom') || lowerMessage.includes('dad') || lowerMessage.match(/\d+/))) {
      // Extract phone number more carefully to handle formatting
      let phoneNumber = message.match(/(?:\+?1[\s-]?)?\(?(\d{3})\)?[\s-]?(\d{3})[\s-]?(\d{4})/);
      if (phoneNumber) {
        // Format as +1XXXXXXXXXX
        const areaCode = phoneNumber[1];
        const prefix = phoneNumber[2];
        const lineNumber = phoneNumber[3];
        phoneNumber = `+1${areaCode}${prefix}${lineNumber}`;
      } else {
        // Fallback to simple digit extraction
        const numbers = message.match(/\d+/g);
        if (numbers) {
          phoneNumber = numbers.join('');
          if (phoneNumber.length === 10) {
            phoneNumber = `+1${phoneNumber}`;
          } else if (phoneNumber.length === 11 && phoneNumber.startsWith('1')) {
            phoneNumber = `+${phoneNumber}`;
          }
        }
      }

      if (phoneNumber && phoneNumber.length >= 10) {
        const name = extractName(message);
        
        // Check for scheduling (e.g., "in 20 secs", "in 5 mins", "at 3pm")
        const scheduleMatch = message.match(/(?:in|at)\s+(\d+)\s*(secs?|mins?|hours?|seconds?|minutes?|hours?)|at\s+(\d+)(?::(\d+))?\s*(am|pm)?/i);
        
        if (scheduleMatch) {
          // Handle scheduled calls
          let delayMs = 0;
          if (scheduleMatch[1] && scheduleMatch[2]) {
            const amount = parseInt(scheduleMatch[1]);
            const unit = scheduleMatch[2].toLowerCase();
            if (unit.includes('sec')) delayMs = amount * 1000;
            else if (unit.includes('min')) delayMs = amount * 60 * 1000;
            else if (unit.includes('hour')) delayMs = amount * 60 * 60 * 1000;
          }

          if (delayMs > 0) {
            // Schedule the call
            setTimeout(async () => {
              try {
                const callResponse = await fetch('https://api.vapi.ai/call', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(buildCallPayload(phoneNumber, name, conversationHistory, 'as scheduled'))
                });
                const result = await callResponse.text();
                console.log(`Scheduled call result for ${name || 'contact'} at ${phoneNumber}:`, result);
              } catch (error) {
                console.error('Scheduled call failed:', error);
              }
            }, delayMs);

            const delayText = delayMs < 60000 ? `${delayMs/1000} seconds` : 
                            delayMs < 3600000 ? `${delayMs/60000} minutes` : 
                            `${delayMs/3600000} hours`;

            return res.status(200).json({
              response: `✅ I'll schedule a call to ${name || 'your contact'} at ${phoneNumber} in ${delayText}!`,
              action: 'call_scheduled',
              phoneNumber: phoneNumber,
              delay: delayMs
            });
          }
        }

        // Make immediate call (with chat context)
        const callResponse = await fetch('https://api.vapi.ai/call', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildCallPayload(phoneNumber, name, conversationHistory))
        });

        if (callResponse.ok) {
          const callResult = await callResponse.json();
          return res.status(200).json({
            response: `✅ I've initiated an outbound call to ${name || 'your contact'} at ${phoneNumber}! They should receive a call from your AI assistant shortly.`,
            action: 'call_initiated',
            callId: callResult.id
          });
        } else {
          const errorText = await callResponse.text();
          console.error('Call failed:', errorText);
          return res.status(200).json({
            response: `❌ Sorry, I couldn't make the outbound call to ${phoneNumber}. The error was: ${errorText}`,
            action: 'call_failed'
          });
        }
      } else {
        return res.status(200).json({
          response: "❌ I couldn't find a valid phone number in your message. Please use format like 'Call mom at +1 (555) 123-4567' or 'Call dad at 5551234567'",
          action: 'invalid_number'
        });
      }
    }

    // "call me" without a number => ask for the number
    if (/\bcall\s+me\b/i.test(lowerMessage) && !lowerMessage.match(/\d{10}/)) {
      return res.status(200).json({
        response: "Sure! What number should I call you at? (e.g. 'call me at 3525494568')",
        action: 'need_number'
      });
    }

    // Handle calendar queries
    const hasCalendarKeyword = /\b(calendar|schedule|event|meeting|appointment|what.*day|what.*tomorrow|what.*today|am i free|free on|busy on)\b/i.test(lowerMessage);
    const hasCreateIntent = /\b(add|create|schedule|set up|book)\b/i.test(lowerMessage) && /\b(event|meeting|appointment|call|reminder|calendar)\b/i.test(lowerMessage);
    const hasDeleteIntent = /\b(delete|remove|cancel|drop|get rid of|take off)\b/i.test(lowerMessage) && (/\b(event|meeting|appointment|calendar|from calendar|from my calendar)\b/i.test(lowerMessage) || hasCalendarKeyword);
    const isCalendarQuery = hasCalendarKeyword || hasCreateIntent || hasDeleteIntent;
    if (isCalendarQuery) {
      try {
        const baseUrl = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://jimmy-ai-assistant.vercel.app';
        const isCreate = hasCreateIntent;
        const isDelete = hasDeleteIntent;

        if (isDelete) {
          // First list events with IDs so we can match
          const calRes = await fetch(`${baseUrl}/api/calendar-tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_events_with_ids', maxResults: 15 })
          });
          const calData = await calRes.json();
          const events = calData.events || [];

          if (events.length === 0) {
            return res.status(200).json({ response: "📅 You don't have any upcoming events to delete.", action: 'calendar_empty' });
          }

          // Use Groq to figure out which event the user wants to delete
          const matchRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [{
                role: 'system',
                content: `You help match a user's delete request to a calendar event. Here are the upcoming events:\n${JSON.stringify(events, null, 2)}\n\nReturn ONLY a JSON object: {"eventId": "the id of the matching event", "summary": "the event name"}\nIf no event matches, return {"eventId": null, "reason": "why"}. Return ONLY JSON.`
              }, { role: 'user', content: message }],
              max_tokens: 200, temperature: 0.1
            })
          });
          const matchData = await matchRes.json();
          const matchJson = JSON.parse(matchData.choices[0].message.content.trim());

          if (!matchJson.eventId) {
            // Show the list so user can pick
            const list = events.map((e, i) => {
              const d = e.start ? new Date(e.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : 'TBD';
              return `${i + 1}. **${e.summary}** — ${d}`;
            }).join('\n');
            return res.status(200).json({
              response: `I couldn't tell which event you mean. Here are your upcoming events:\n\n${list}\n\nTell me the name or number to delete.`,
              action: 'calendar_list_for_delete',
              events
            });
          }

          // Delete it
          await fetch(`${baseUrl}/api/calendar-tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_event', eventId: matchJson.eventId })
          });
          return res.status(200).json({ response: `🗑️ Deleted "${matchJson.summary}" from your calendar.`, action: 'event_deleted' });

        } else if (isCreate) {
          // Let Groq extract the event details, then create it
          const extractRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [{
                role: 'system',
                content: `Extract event details from the user message and return ONLY valid JSON with these fields:
{"summary": "event title", "startTime": "ISO8601 datetime", "endTime": "ISO8601 datetime", "description": "optional"}
Use America/Chicago timezone. If no end time given, add 1 hour. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })}. Current time is ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })}. Return ONLY the JSON object, nothing else.`
              }, { role: 'user', content: message }],
              max_tokens: 300, temperature: 0.1
            })
          });
          const extractData = await extractRes.json();
          const jsonStr = extractData.choices[0].message.content.trim();
          const eventArgs = JSON.parse(jsonStr);
          const calRes = await fetch(`${baseUrl}/api/calendar-tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_event', ...eventArgs })
          });
          const calData = await calRes.json();

          // After creating the event, ask if they want a call reminder
          const reminderOpts = OWNER_PROFILE.reminderDefaults.reminderOptions;
          const reminderPrompt = `\n\n📞 Want me to call you before this event? Reply with how many minutes before (${reminderOpts.join(', ')}) or "no" to skip.`;

          return res.status(200).json({
            response: `✅ ${calData.formatted || 'Event created!'}${reminderPrompt}`,
            action: 'event_created_ask_reminder',
            eventDetails: eventArgs,
            eventId: calData.event?.id
          });

        } else {
          // Read upcoming events
          const calRes = await fetch(`${baseUrl}/api/calendar-tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_events', maxResults: 8 })
          });
          const calData = await calRes.json();
          return res.status(200).json({ response: `📅 ${calData.formatted}`, action: 'calendar_events' });
        }
      } catch (err) {
        console.error('Calendar error:', err);
        return res.status(200).json({ response: `Sorry, I had trouble accessing your calendar. (${err.message})`, action: 'calendar_error' });
      }
    }

    // Handle reminder confirmation after event creation (user says "15", "30 minutes", "no", etc.)
    const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant');
    const isReminderReply = lastAssistantMsg && lastAssistantMsg.content && lastAssistantMsg.content.includes('Want me to call you before this event');
    if (isReminderReply) {
      const noMatch = /\b(no|nah|skip|nope|don't|none)\b/i.test(lowerMessage);
      if (noMatch) {
        return res.status(200).json({ response: "👍 No reminder set. You're all good!", action: 'reminder_skipped' });
      }
      const minutesMatch = lowerMessage.match(/(\d+)/);
      if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1]);
        // Try to find the event start time from the previous assistant message or conversation
        const eventStartMatch = lastAssistantMsg.content.match(/Created:\s*(.+?)(?:\n|$)/);
        return res.status(200).json({
          response: `⏰ Got it! I'll call you ${minutes} minutes before your event to remind you. Make sure your phone number is set up so I can reach you!`,
          action: 'reminder_set',
          reminderMinutes: minutes
        });
      }
    }

    // Handle scheduling commands
    if (lowerMessage.includes('schedule') || lowerMessage.includes('set up a call')) {
      return res.status(200).json({
        response: "I can help you schedule a call! Please provide:\n• Name\n• Phone number\n• Message\n• Date and time\n\nOr use the 'Schedule Call' button for an easy form.",
        action: 'schedule_prompt'
      });
    }

    // Handle show scheduled calls
    if (lowerMessage.includes('show scheduled') || lowerMessage.includes('view schedule')) {
      return res.status(200).json({
        response: "You can view your scheduled calls using the 'View Schedule' button in the sidebar. This will show all your upcoming calls.",
        action: 'view_schedule'
      });
    }

    // Handle web search queries
    const hasSearchIntent = /\b(search|google|look up|lookup|find out|what is|what are|who is|who are|how to|how do|how does|how much|how many|when is|when did|when does|where is|where do|why is|why do|tell me about|search for|search the web|can you search|can you look|can you google|can you find)\b/i.test(lowerMessage);
    const isExplicitCalendarOrCall = /\b(call\s+(me|mom|dad)|add.*(calendar|event)|create.*(event|meeting)|delete.*(event|meeting)|schedule\s+(a\s+)?call|what.*on my calendar)\b/i.test(lowerMessage);
    const isSearchQuery = hasSearchIntent && !isExplicitCalendarOrCall;
    if (isSearchQuery) {
      try {
        // Extract the actual search query
        const baseUrl = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://jimmy-ai-assistant.vercel.app';
        const extractRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{
              role: 'system',
              content: 'Extract the search query from the user message. Return ONLY the search query string, nothing else. No quotes, no explanation.'
            }, { role: 'user', content: message }],
            max_tokens: 100, temperature: 0.1
          })
        });
        const extractData = await extractRes.json();
        const searchQuery = extractData.choices[0].message.content.trim();

        const searchRes = await fetch(`${baseUrl}/api/web-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, num: 5 })
        });
        const searchData = await searchRes.json();

        if (searchData.formatted) {
          // Have Groq summarize the results naturally
          const summaryRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [{
                role: 'system',
                content: `You are Brayden's AI assistant. Summarize these web search results naturally and helpfully. Be concise. Include relevant links.\n\nSearch results:\n${searchData.formatted}`
              }, { role: 'user', content: message }],
              max_tokens: 500, temperature: 0.5
            })
          });
          const summaryData = await summaryRes.json();
          return res.status(200).json({
            response: `🔍 ${summaryData.choices[0].message.content.trim()}`,
            action: 'search_results'
          });
        }

        return res.status(200).json({ response: searchData.formatted || "Couldn't find anything for that search.", action: 'search_results' });
      } catch (err) {
        console.error('Search error:', err);
        return res.status(200).json({ response: `Search failed: ${err.message}`, action: 'search_error' });
      }
    }

    // Fetch user profile for additional context (inline to avoid separate function)
    let userProfileContent = '';
    try {
      const fs = await import('fs');
      const path = await import('path');
      const profilePath = path.join(process.cwd(), '..', 'user-profile.md');
      
      if (fs.existsSync(profilePath)) {
        const profileData = fs.readFileSync(profilePath, 'utf-8');
        userProfileContent = `\n\n--- USER PROFILE ---\n${profileData}\n--- END USER PROFILE ---`;
      }
    } catch (e) {
      console.log('Could not read user profile:', e.message);
    }

    // Use Groq for general conversation
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are Brayden Clarkson's personal AI assistant. You help him manage voice calls, calendar, web searches, and have natural conversations.

${ownerSummary()}
${userProfileContent}

Your capabilities:
- Make outbound calls through Vapi.ai when asked
- Schedule calls for specific times
- Read, create, and DELETE Google Calendar events
- Search the web / Google for any topic
- Offer to call Brayden before calendar events as a reminder
- Provide helpful information and assistance
- Have friendly, natural conversations

When asked to "call someone at [number]", acknowledge that you'll make the call.
When asked about calendar/schedule/events, I will fetch them from Google Calendar automatically.
When asked to add/create a calendar event, I will create it and offer a call reminder.
When asked to delete/remove/cancel an event, I will find and delete it.
When asked to search/google/look up something, I will search the web and summarize results.
Always be helpful, concise, and friendly. Use Central Time for all times.

Current context: You're communicating through a web dashboard chat interface. Brayden can ask you to make calls, manage his calendar, search the web, or just chat.`
          },
          ...conversationHistory.slice(-5), // Keep last 5 messages for context
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!groqResponse.ok) {
      console.error('Groq API error:', await groqResponse.text());
      return res.status(200).json({
        response: "I'm having trouble connecting to my AI brain right now. Please try again in a moment.",
        action: 'error'
      });
    }

    const groqData = await groqResponse.json();
    const aiResponse = groqData.choices[0].message.content;

    return res.status(200).json({
      response: aiResponse.trim(),
      action: 'chat_response'
    });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function extractName(message) {
  const lowerMessage = message.toLowerCase();
  // "call me" => the user is the target (Brayden)
  if (/\bcall\s+me\b/.test(lowerMessage)) {
    return 'Brayden';
  }
  const names = ['mom', 'dad', 'sarah', 'john', 'mike', 'lisa', 'tom', 'jane'];
  for (const name of names) {
    if (lowerMessage.includes(name)) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}
