import { parseArgs } from 'node:util';
import { UsageError } from './errors.mjs';

export const USAGE = `usage: node worker/albm-worker.mjs --url <albm> --token <worker token> [options]
  --tasks bibs,alt       tasks to run (default bibs,alt; score = rate photos for the Instagram carousel, local Ollama)
  --gallery <id>         only this gallery
  --limit <1..50>        photos per batch (default 10; the run continues until none are left)
  --loop                 keep polling (every 30 s when idle)
  --redo                 also re-offer finished and exhausted photos
  --dry-run              look at the next batch, analyse it and print what would be posted; post
                         nothing and lease nothing
  --allow-cloud          required for the anthropic alt engine (photos leave this machine)
env: ALBM_URL, ALBM_WORKER_TOKEN, ALT_ENGINE (ollama|anthropic), ALT_MODEL, ALT_ANTHROPIC_MODEL,
     ALT_LANG, SCORE_MODEL, OLLAMA_HOST, ANTHROPIC_API_KEY, ALT_ALLOW_CLOUD=1, WORKER_FAKE_ENGINES=1 (tests)`;

const TASKS = ['alt', 'bibs', 'score'];

export function parseConfig(argv, env) {
  let v;
  try {
    ({ values: v } = parseArgs({
      args: argv,
      strict: true,
      options: {
        url: { type: 'string' },
        token: { type: 'string' },
        tasks: { type: 'string', default: 'bibs,alt' },
        gallery: { type: 'string' },
        limit: { type: 'string', default: '10' },
        loop: { type: 'boolean', default: false },
        redo: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'allow-cloud': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    throw new UsageError(err.message);
  }
  if (v.help) return { help: true };

  const url = (v.url ?? env.ALBM_URL ?? '').trim();
  if (!url) throw new UsageError('missing --url (or ALBM_URL)');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new UsageError(`--url is not a valid URL: ${url}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new UsageError('--url must be http(s)');

  const token = v.token ?? env.ALBM_WORKER_TOKEN;
  if (!token) throw new UsageError('missing --token (or ALBM_WORKER_TOKEN)');

  const tasks = [...new Set(v.tasks.split(',').map((t) => t.trim()).filter(Boolean))];
  if (!tasks.length) throw new UsageError('--tasks is empty');
  for (const t of tasks) if (!TASKS.includes(t)) throw new UsageError(`unknown task "${t}" (use bibs, alt or score)`);

  const limit = Number(v.limit);
  if (!/^\d+$/.test(v.limit) || limit < 1 || limit > 50) throw new UsageError('--limit must be 1..50');

  return {
    url: url.replace(/\/+$/, ''),
    token,
    tasks,
    gallery: v.gallery,
    limit,
    loop: v.loop,
    redo: v.redo,
    dryRun: v['dry-run'],
    allowCloud: v['allow-cloud'] || env.ALT_ALLOW_CLOUD === '1',
  };
}
