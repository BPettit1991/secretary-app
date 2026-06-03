import { getAccessToken } from './auth.js';

const PROMPT = `You are generating automation suggestions for Benja's personal secretary system.
Analyse his context and generate exactly 8 specific, actionable automation ideas.

Return ONLY a valid JSON array. No explanation, no markdown, just the array.

Each suggestion must follow this exact structure:
{
  "id": "unique-slug",
  "title": "Short action title",
  "description": "One sentence — what it does and why it saves time",
  "category": "LATS" | "Rainbow" | "Real Life" | "System" | "Files" | "Email",
  "type": "scheduled" | "trigger" | "ai" | "sync" | "cleanup",
  "effort": "low" | "medium" | "high",
  "saving": "e.g. 20 min/week",
  "priority": "high" | "medium" | "low"
}

Types:
- scheduled: runs on a cron/time schedule
- trigger: fires when something happens (file saved, email received)
- ai: uses AI to do cognitive work
- sync: keeps things in sync across systems
- cleanup: organises or archives things

Base suggestions on the context provided. Make them specific to his actual calendar items, task names, and file structure — not generic.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { context } = req.body || {};

  const contextBlock = context ? `
Current context:
- Open tasks: ${(context.tasks || []).slice(0, 10).map(t => t.title).join(', ') || 'none'}
- Upcoming calendar events: ${(context.calendar || []).slice(0, 6).map(e => e.subject).join(', ') || 'none'}
- OneDrive storage: ${Math.round((context.storage?.used || 0) / 1e9)}GB used of ${Math.round((context.storage?.total || 0) / 1e9)}GB
` : '';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: PROMPT + '\n\n' + contextBlock,
        }],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.error?.message });

    const text = data.content?.[0]?.text || '[]';
    // Extract JSON from response
    const match = text.match(/\[[\s\S]*\]/);
    const suggestions = match ? JSON.parse(match[0]) : [];

    res.json({ suggestions, generated: new Date().toISOString() });
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({ error: err.message });
  }
}
