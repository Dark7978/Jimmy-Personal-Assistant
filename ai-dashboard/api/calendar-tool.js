// Vapi tool endpoint + direct API for Google Calendar.
// Handles: get_calendar_events, create_calendar_event
// Called by both the voice assistant (via Vapi tool) and the chat endpoint.

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

async function getAccessToken() {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function getCalendarEvents({ timeMin, timeMax, maxResults = 10 } = {}) {
  const token = await getAccessToken();
  const now = new Date();
  const params = new URLSearchParams({
    calendarId: 'primary',
    timeMin: timeMin || now.toISOString(),
    timeMax: timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime'
  });
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar fetch failed: ${JSON.stringify(data)}`);
  return data.items || [];
}

export async function createCalendarEvent({ summary, description, startTime, endTime, attendees = [] }) {
  const token = await getAccessToken();
  const body = {
    summary,
    description,
    start: { dateTime: startTime, timeZone: 'America/Chicago' },
    end: { dateTime: endTime, timeZone: 'America/Chicago' },
    attendees: attendees.map(email => ({ email }))
  };
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Event creation failed: ${JSON.stringify(data)}`);
  return data;
}

export async function deleteCalendarEvent(eventId) {
  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Delete failed (${res.status}): ${text}`);
  }
  return true;
}

function formatEventsForSpeech(events) {
  if (!events.length) return 'You have no upcoming events.';
  return events.map(e => {
    const start = e.start?.dateTime || e.start?.date;
    const date = start ? new Date(start).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
    }) : 'All day';
    return `${e.summary || 'Untitled'} on ${date}`;
  }).join('. ');
}

// Vapi tool webhook handler
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};

    // Support direct calls from chat endpoint: { action, ...args }
    if (body.action) {
      if (body.action === 'get_events') {
        const events = await getCalendarEvents(body);
        return res.status(200).json({ events, formatted: formatEventsForSpeech(events) });
      }
      if (body.action === 'create_event') {
        const event = await createCalendarEvent(body);
        return res.status(200).json({ event, formatted: `Created: ${event.summary}` });
      }
      if (body.action === 'delete_event') {
        if (!body.eventId) return res.status(400).json({ error: 'eventId is required' });
        await deleteCalendarEvent(body.eventId);
        return res.status(200).json({ success: true, formatted: 'Event deleted.' });
      }
      if (body.action === 'list_events_with_ids') {
        const events = await getCalendarEvents(body);
        const withIds = events.map(e => ({
          id: e.id,
          summary: e.summary || 'Untitled',
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
        }));
        return res.status(200).json({ events: withIds, formatted: formatEventsForSpeech(events) });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    // Vapi tool call format
    const msg = body.message || {};
    const toolCalls = msg.toolCalls || msg.toolCallList || [];
    const results = [];

    for (const tc of toolCalls) {
      const fn = tc.function || tc;
      const name = fn.name;
      let args = fn.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      args = args || {};

      try {
        if (name === 'get_calendar_events') {
          const events = await getCalendarEvents(args);
          results.push({ toolCallId: tc.id, result: formatEventsForSpeech(events) });
        } else if (name === 'create_calendar_event') {
          const event = await createCalendarEvent(args);
          results.push({ toolCallId: tc.id, result: `Done! I've added "${event.summary}" to your calendar.` });
        } else {
          results.push({ toolCallId: tc.id, result: `Unknown tool: ${name}` });
        }
      } catch (err) {
        results.push({ toolCallId: tc.id, result: `Error: ${err.message}` });
      }
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error('calendar-tool error:', err);
    return res.status(500).json({ error: err.message });
  }
}
