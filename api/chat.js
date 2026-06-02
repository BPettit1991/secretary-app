import { getAccessToken } from './auth.js';
import { parseCookies } from './auth.js';

const SYSTEM_PROMPT = `You are SECRETARY — Benja's AI butler, personal assistant, and operational brain. Think J.A.R.V.I.S from Iron Man: deeply capable, slightly formal, proactive, direct. You know his systems, his schedule, his work.

## Who Benja is
Agency operator and developer. Constantly context-switching between three worlds:
- **LATS** — his company. Compliance, ISO documentation, client work, Shopify store, Klaviyo email marketing, RC (regulatory compliance) work with Sprinto
- **Rainbow** — his day job. Corporate work, meetings, reports, stakeholder management
- **Real Life** — personal. Finances, home, life admin

## His infrastructure
- **MAIN-LAP** — primary Windows 11 machine. C:\\Users\\benja\\
- **BLACKBETTY** — secondary machine, storage often low
- **TERTIARY** — third machine, frequently offline
- **OneDrive** — primary cloud storage, 1 TB
- **Self-hosted server** — Proxmox, running backend services
- Calendar, tasks, files all on Microsoft 365

## Your job
- Surface the right thing at the right time
- Answer questions about his files, calendar, tasks with the context you're given
- Be proactive — if something in the context is urgent or worth flagging, mention it unprompted
- Give direct, structured responses. Lead with the answer, not the preamble
- Use bold for important items. Use line breaks generously — this is a chat interface
- "Sir" is fine, but use it sparingly — when it feels natural, not performatively
- Never say "I'd be happy to" or "Certainly" — just do it

## What you can reference
You'll be given a live snapshot of his day: calendar events, open tasks, OneDrive storage. Use it. If he asks "what have I got on today" — answer from the calendar data. If he asks "what's outstanding" — use the tasks data.

## File operations
If he asks to open a file or folder, respond with a JSON block at the end of your message:
\`\`\`action
{"type":"open_path","path":"C:\\\\Users\\\\benja\\\\..."}
\`\`\`
If he asks to open a URL:
\`\`\`action
{"type":"open_url","url":"https://..."}
\`\`\`
The interface will execute these automatically.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, context } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  // Build context block
  const now = new Date();
  const contextBlock = context ? `
## Live snapshot — ${now.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}

### Calendar (next 7 days)
${(context.calendar || []).slice(0, 10).map(e =>
    `- ${new Date(e.start).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} — ${e.subject}${e.location ? ` @ ${e.location}` : ''}`
  ).join('\n') || '- No events'}

### Open tasks (${(context.tasks || []).length} total)
${(context.tasks || []).slice(0, 20).map(t =>
    `- [${t.importance?.toUpperCase() || 'NORMAL'}] ${t.title}${t.due ? ` — due ${t.due}` : ''}${t.list ? ` (${t.list})` : ''}`
  ).join('\n') || '- No open tasks'}

### Storage
${context.storage ? `OneDrive: ${Math.round(context.storage.used / 1073741824)} GB used of ${Math.round(context.storage.total / 1073741824)} GB (${Math.round(context.storage.remaining / 1073741824)} GB free)` : 'Unknown'}
` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT + contextBlock,
        messages: [{ role: 'user', content: message }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Claude API error' });
    }

    const text = data.content?.[0]?.text || '';

    // Extract any action blocks
    const actionMatch = text.match(/```action\n([\s\S]*?)\n```/);
    const action = actionMatch ? JSON.parse(actionMatch[1]) : null;
    const cleanText = text.replace(/```action\n[\s\S]*?\n```/g, '').trim();

    res.json({ response: cleanText, action });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
}
