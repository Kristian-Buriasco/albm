import { readFile } from 'node:fs/promises';
import { FatalError } from '../lib/errors.mjs';

export const promptFor = (lang) =>
  `Write alt text for this photo: one factual sentence, under 125 characters, describing the scene and the action. ` +
  `Do not guess names, identity, age or ethnicity. No quotation marks. Language: ${lang}.`;

// Trim, strip surrounding quotes, keep the first sentence, cap at 160 characters.
export function cleanAlt(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  const first = s.match(/^.*?[.!?](?=\s|$)/);
  if (first) s = first[0];
  return s.slice(0, 160).trim();
}

export function createEngine(env = process.env) {
  const model = env.ALT_MODEL || 'qwen2.5vl:3b';
  const host = (env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const prompt = promptFor(env.ALT_LANG || 'English');
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
          body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt, images }] }),
        });
      } catch (err) {
        throw new FatalError(`cannot reach Ollama at ${host} (${err.cause?.code ?? err.message})`);
      }
      if (res.status === 404) throw new FatalError(`Ollama model "${model}" not found; run: ollama pull ${model}`);
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const alt = cleanAlt((await res.json())?.message?.content);
      if (!alt) throw new Error('ollama returned no text');
      return { alt };
    },
  };
}
