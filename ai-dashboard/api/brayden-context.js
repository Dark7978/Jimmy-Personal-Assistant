// Personal context about Brayden — imported by chat.js so the AI knows who it's talking to.
// Update this file whenever preferences change.

export const OWNER_PROFILE = {
  name: 'Brayden Clarkson',
  timezone: 'America/Chicago',          // Central Time
  timezoneLabel: 'Central Time (CT)',
  locale: 'en-US',

  // Quick facts the AI can reference naturally
  facts: [
    'Lives in the Central Time zone (America/Chicago).',
    'Goes by Brayden.',
    'Built this AI assistant dashboard himself.',
    'Uses Vapi.ai for voice calls.',
    'Google Calendar is his primary calendar.',
    'Prefers concise, friendly responses — not too formal.',
    'Likes to stay on top of his schedule and hates missing appointments.',
  ],

  // Contacts the AI knows about (name → phone). Add more as needed.
  contacts: {
    mom: null,   // fill in when known
    dad: null,
  },

  // Fuzzy contact matching for transfers
  getContact(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    // Direct match
    if (this.contacts[lower]) return { name, number: this.contacts[lower] };
    // Fuzzy match
    for (const [key, number] of Object.entries(this.contacts)) {
      if (number && key.includes(lower) || lower.includes(key)) {
        return { name: key, number };
      }
    }
    return null;
  },

  addContact(name, number) {
    this.contacts[name.toLowerCase().trim()] = number;
  },

  // Default reminder preferences
  reminderDefaults: {
    callReminderMinutesBefore: 15,   // default: call 15 min before event
    reminderOptions: [5, 10, 15, 30, 60],  // minutes the user can pick from
  },
};

// Build a system-prompt-friendly summary
export function ownerSummary() {
  const now = new Date().toLocaleString('en-US', { timeZone: OWNER_PROFILE.timezone });
  return [
    `Owner: ${OWNER_PROFILE.name}`,
    `Timezone: ${OWNER_PROFILE.timezoneLabel}`,
    `Current local time: ${now}`,
    '',
    'Things to know about Brayden:',
    ...OWNER_PROFILE.facts.map(f => `- ${f}`),
  ].join('\n');
}
