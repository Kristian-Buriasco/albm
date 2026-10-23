import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

// Deterministic stand-ins for the real engines (WORKER_FAKE_ENGINES=1). WORKER_FAKE_FAIL=<text> makes
// every photo whose temp file name contains that text throw, to exercise the per-photo error path.
export function createFakeEngine(task, env = process.env) {
  const failOn = env.WORKER_FAKE_FAIL || null;
  return {
    id: `fake-${task}`,
    version: 1,
    async run(imagePath) {
      const bytes = await readFile(imagePath);
      if (!bytes.length) throw new Error('fake engine: empty image');
      if (failOn && basename(imagePath).includes(failOn)) throw new Error('fake engine: simulated failure');
      if (task === 'bibs') {
        return { bibs: [{ number: '20', confidence: 0.99 }, { number: '7', confidence: 0.8 }] };
      }
      if (task === 'score') return { score: 7 };
      return { alt: 'A test photo.' };
    },
  };
}
