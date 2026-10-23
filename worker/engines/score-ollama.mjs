import { readFile } from 'node:fs/promises';
import { FatalError } from '../lib/errors.mjs';

const PROMPT =
  'Rate this photo for an Instagram feed from 1 (poor) to 10 (stunning): sharp focus, good exposure and composition, ' +
  'emotion or action, a clear subject. Be harsh; most photos are 4-6. Reply with only the number.';

// First number in the reply, clamped to 1-10; null when there is none.
export function parseScore(raw) {
  const n = Number(/\d+(\.\d+)?/.exec(String(raw ?? ''))?.[0]);
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : null;
}

// Local only: the photo goes to your own Ollama. shortcut: a small model scores most usable photos alike and
// mainly flags bad exposure; the picker adds sharpness on top. Use a bigger SCORE_MODEL for finer ranking.
export function createEngine(env = process.env) {
  const model = env.SCORE_MODEL || 'qwen2.5vl:7b';
  const host = (env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  return {
    id: `ollama:${model}`,
    version: 1,
    async run(imagePath) {
      const images = [(await readFile(imagePath)).toString('base64')];
      let res;
      try {
        res = await fetch(`${host}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, stream: false, options: { temperature: 0 }, messages: [{ role: 'user', content: PROMPT, images }] }),
        });
      } catch (err) {
        throw new FatalError(`cannot reach Ollama at ${host} (${err.cause?.code ?? err.message})`);
      }
      if (res.status === 404) throw new FatalError(`Ollama model "${model}" not found; run: ollama pull ${model}`);
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const score = parseScore((await res.json())?.message?.content);
      if (score === null) throw new Error('ollama returned no number');
      return { score };
    },
  };
}
