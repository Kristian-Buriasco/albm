import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError } from '../lib/errors.mjs';

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

export function createEngine(env = process.env) {
  const bin = env.VISION_BIBS_BIN || join(here, '..', 'bin', 'vision-bibs');
  if (!existsSync(bin)) throw new UsageError(`${bin} not found: run bash worker/build-vision.sh`);
  let warned = false;
  return {
    id: 'apple-vision-tiles-v1',
    version: 1,
    async run(imagePath) {
      if (!warned) {
        warned = true;
        console.error('note: the first Apple Vision call after boot can take ~60 s (model compile)');
      }
      let stdout;
      try {
        ({ stdout } = await execFileP(bin, [imagePath], { timeout: 180_000, maxBuffer: 1 << 20 }));
      } catch (err) {
        stdout = err.stdout ?? '';
        if (!stdout.trim()) throw new Error(`vision-bibs failed: ${err.message.split('\n')[0]}`);
      }
      const line = stdout.trim().split('\n').pop();
      const out = JSON.parse(line);
      if (out.error) throw new Error(out.error);
      if (!Array.isArray(out.numbers)) throw new Error('vision-bibs: no numbers array in output');
      return { bibs: out.numbers.map((x) => ({ number: String(x.n), confidence: Number(x.conf) })) };
    },
  };
}
