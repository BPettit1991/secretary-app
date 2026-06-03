/**
 * SECRETARY Vision API
 * Accepts an image (base64 or URL) + optional prompt
 * Returns Claude's analysis with full butler context
 */
import { getAccessToken } from './auth.js';

const VISION_SYSTEM = `You are SECRETARY — Benja's AI butler. You have just been shown an image.
Analyse it with precision. Be specific about what you see. If it's a document, extract the key information.
If it's a screenshot, describe what's happening and surface anything actionable.
If it's a file or UI, identify what it is and what should be done with it.
Lead with the most important observation. Be concise but complete.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image, mediaType = 'image/png', prompt = 'What do you see? Surface anything actionable.', context } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image required (base64)' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  // Build context block
  const contextBlock = context ? `\n\nCurrent context: ${(context.tasks||[]).slice(0,5).map(t=>t.title).join(', ')}` : '';

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
        max_tokens: 1024,
        system: VISION_SYSTEM + contextBlock,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: image.replace(/^data:[^;]+;base64,/, ''),
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        }],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.error?.message });

    res.json({ response: data.content?.[0]?.text || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
