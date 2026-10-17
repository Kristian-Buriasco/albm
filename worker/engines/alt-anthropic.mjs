import { readFile } from 'node:fs/promises';
import { FatalError } from '../lib/errors.mjs';
import { cleanAlt, promptFor } from './alt-ollama.mjs';

// Sends the photo to api.anthropic.com. The loader enforces --allow-cloud before this runs.
export function createEngine(env = process.env) {
  const model = env.ALT_ANTHROPIC_MODEL || 'claude-haiku-5-5';
  const prompt = promptFor(env.ALT_LANG || 'English');
  return {
    id: `anthropic:${model}`,
    version: 1,
    async run(imagePath) {
      const data = (await readFile(imagePath)).toString('base64');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 120,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/webp', data } },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      });
      if (res.status === 401) throw new FatalError('Anthropic rejected ANTHROPIC_API_KEY (401)');
      if (!res.ok) throw new Error(`anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const body = await res.json();
      const alt = cleanAlt((body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(' '));
      if (!alt) throw new Error('anthropic returned no text');
      return { alt };
    },
  };
}
