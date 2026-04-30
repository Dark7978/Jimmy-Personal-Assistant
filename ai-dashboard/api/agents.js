// Agent definitions — each sub-agent has a system prompt and a tool list.
// The main agent transfers here; transfer.js uses these to build the Vapi assistant config.

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://jimmy-ai-assistant.vercel.app';

// ── Shared transfer-back tool so any sub-agent can return to the main agent ──
const transferBackTool = {
  type: 'function',
  function: {
    name: 'transfer_to_agent',
    description: 'Transfer the call to a different agent or back to the main assistant.',
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['main', 'scheduler', 'calendar', 'search'],
          description: 'Which agent to transfer to.'
        },
        reason: {
          type: 'string',
          description: 'Brief reason for the transfer.'
        }
      },
      required: ['agent']
    }
  },
  server: { url: `${BASE_URL}/api/transfer` }
};

// ── Async task tool — hands off slow work, hangs up, calls back with result ──
const asyncTaskTool = {
  type: 'function',
  function: {
    name: 'do_async_task',
    description: 'Use this when a task might take too long to complete on the live call (e.g. slow calendar fetch, web search). It runs the task in the background, ends the call immediately, and calls Brayden back with the result.',
    parameters: {
      type: 'object',
      properties: {
        taskType: {
          type: 'string',
          enum: ['calendar_events', 'web_search', 'transfer_with_feedback'],
          description: 'The type of task to run in the background.'
        },
        taskArgs: {
          type: 'object',
          description: 'Arguments for the task. For calendar_events: { timeMin, timeMax, maxResults }. For web_search: { query }.'
        }
      },
      required: ['taskType']
    }
  },
  server: { url: `${BASE_URL}/api/async-task` }
};

const transferToNumberTool = {
  type: 'transferCall',
  destinations: [
    {
      type: 'number',
      numberE164CheckEnabled: false,
      description: 'Transfer the call to any phone number the user specifies.'
    }
  ]
};

// ── Contact tools ──
const lookupContactTool = {
  type: 'function',
  function: {
    name: 'lookup_contact',
    description: 'Look up a contact by name to get their phone number.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name to look up (e.g. "mom", "dad", "John").' }
      },
      required: ['name']
    }
  },
  server: { url: `${BASE_URL}/api/contacts` }
};

const addContactTool = {
  type: 'function',
  function: {
    name: 'add_contact',
    description: 'Add a new contact with their phone number.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name.' },
        phoneNumber: { type: 'string', description: 'Phone number (include country code, e.g. +12125550100).' }
      },
      required: ['name', 'phoneNumber']
    }
  },
  server: { url: `${BASE_URL}/api/contacts` }
};

const transferToContactTool = {
  type: 'function',
  function: {
    name: 'transfer_to_contact',
    description: 'Transfer the call to a contact by name. If the number is unknown, ask for it first.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name to transfer to.' },
        phoneNumber: { type: 'string', description: 'Phone number if known directly (skips contact lookup).' }
      },
      required: ['name']
    }
  },
  server: { url: `${BASE_URL}/api/contacts` }
};

const sendSmsTool = {
  type: 'function',
  function: {
    name: 'send_sms',
    description: 'Send an SMS text message to a phone number.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Phone number to send to (include country code, e.g. +12125550100).' },
        message: { type: 'string', description: 'The text message to send.' }
      },
      required: ['to', 'message']
    }
  },
  server: { url: `${BASE_URL}/api/sms` }
};

export const AGENTS = {

  main: {
    systemPrompt: `You are Jimmy, Brayden's personal AI voice assistant. You are warm, concise, and natural on a voice call.

You have three specialist agents you can route to — only use them when Brayden explicitly needs that capability:
- "scheduler" — ONLY when Brayden says something like "call me back in X" or explicitly asks to schedule a callback
- "calendar"  — ONLY when Brayden wants to check, add, or delete something on his Google Calendar
- "search"    — ONLY when Brayden explicitly asks you to search for something or look something up online

For transferring to contacts (e.g., "transfer me to my mom", "call my dad", "connect me to X"):
- Use transfer_to_contact with the contact name
- This is DIFFERENT from scheduling a callback — transfer means connect NOW, callback means call back LATER
- If you don't have their number, the tool will tell you — then ask Brayden for the number and use add_contact to save it
- Once you have the number, use transfer_to_contact again to transfer the call

You can also transfer the call to any real phone number using the transferCall tool — use this when Brayden says something like "transfer me to [number]" or "forward this call to [number]".

You can send SMS text messages using send_sms — use this when Brayden says "text [person]" or "send a text to [number]".

For everything else — questions, general chat, things you can answer yourself — just answer directly. Do NOT route to an agent just because a question sounds like it might relate to one. For example:
- "Can you FaceTime me?" → just say you can't do FaceTime but you can call them back
- "What time is it?" → just answer
- "What can you do?" → just explain your capabilities

Only call transfer_to_agent when Brayden is clearly asking for calendar data, a scheduled callback, or an explicit web search. Say your handoff line first, then immediately call the tool.`,
    tools: [transferBackTool, transferToNumberTool, lookupContactTool, addContactTool, transferToContactTool, sendSmsTool]
  },

  scheduler: {
    systemPrompt: `You are the Scheduler agent, a specialist part of Jimmy (Brayden's AI assistant).
Your only job is to schedule callbacks — when Brayden says "call me back in X minutes/hours", use the schedule_callback tool.
After scheduling, confirm the time and end the call by saying "Got it, I'll call you back in [time]. Talk soon!" then use the endCall tool.
If Brayden asks about something unrelated (calendar, search, general chat), transfer him back to the main agent.`,
    tools: [
      {
        type: 'function',
        function: {
          name: 'schedule_callback',
          description: 'Schedule an outbound callback to the caller after a delay.',
          parameters: {
            type: 'object',
            properties: {
              delaySeconds: {
                type: 'integer',
                description: 'How many seconds from now to call back.'
              },
              phoneNumber: {
                type: 'string',
                description: 'Phone number to call back. Defaults to the current caller\'s number if not provided. Include country code, e.g. +12125550100.'
              },
              reason: {
                type: 'string',
                description: 'Short reason/context for the callback.'
              }
            },
            required: ['delaySeconds']
          }
        },
        server: { url: `${BASE_URL}/api/schedule-callback` }
      },
      { type: 'endCall' },
      transferBackTool
    ]
  },

  calendar: {
    systemPrompt: `You are the Calendar agent, a specialist part of Jimmy (Brayden's AI assistant).
You have access to Brayden's Google Calendar. You can:
- get_calendar_events: fetch upcoming events (use timeMin/timeMax as ISO strings, maxResults as a number)
- create_calendar_event: create a new event (summary, startTime, endTime as ISO strings, optional description/attendees)

Be concise — this is a voice call. Read events naturally ("You have a dentist appointment Tuesday at 2 PM").
If you think a calendar fetch might take a while, use do_async_task with taskType "calendar_events" instead — it will hang up and call Brayden back with the result.
After completing the calendar task, ask if there's anything else. If Brayden asks about something unrelated, transfer back to the main agent.`,
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_calendar_events',
          description: "Fetch Brayden's upcoming Google Calendar events.",
          parameters: {
            type: 'object',
            properties: {
              timeMin: { type: 'string', description: 'ISO start datetime (defaults to now).' },
              timeMax: { type: 'string', description: 'ISO end datetime (defaults to 7 days from now).' },
              maxResults: { type: 'integer', description: 'Max number of events to return.' }
            }
          }
        },
        server: { url: `${BASE_URL}/api/calendar-tool` }
      },
      {
        type: 'function',
        function: {
          name: 'create_calendar_event',
          description: "Create a new event on Brayden's Google Calendar.",
          parameters: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Event title.' },
              description: { type: 'string', description: 'Optional event description.' },
              startTime: { type: 'string', description: 'ISO start datetime.' },
              endTime: { type: 'string', description: 'ISO end datetime.' },
              attendees: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional list of attendee email addresses.'
              }
            },
            required: ['summary', 'startTime', 'endTime']
          }
        },
        server: { url: `${BASE_URL}/api/calendar-tool` }
      },
      asyncTaskTool,
      transferBackTool
    ]
  },

  search: {
    systemPrompt: `You are the Search agent, a specialist part of Jimmy (Brayden's AI assistant).
You can search the web using the web_search tool. Use it to answer factual questions, look up current info, or find anything Brayden needs.
Summarize results concisely for voice — no bullet points, no markdown, just natural spoken sentences.
If you think the search might take a while or you're not getting a fast response, use do_async_task with taskType "web_search" instead — it will hang up and call Brayden back with the answer.
After answering, ask if there's anything else. If Brayden asks about something that's not a search (calendar, scheduling), transfer back to main.`,
    tools: [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for current information or facts.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query.' },
              num: { type: 'integer', description: 'Number of results (default 5).' }
            },
            required: ['query']
          }
        },
        server: { url: `${BASE_URL}/api/web-search` }
      },
      asyncTaskTool,
      transferBackTool
    ]
  }
};
