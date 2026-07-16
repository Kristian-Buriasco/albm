import fs from 'node:fs';
import path from 'node:path';

const PID_FILE = path.join(process.cwd(), 'e2e', '.server-pid');

export default async function globalTeardown() {
  if (!fs.existsSync(PID_FILE)) return;
  const pid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
  if (Number.isFinite(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already stopped */
    }
  }
  fs.rmSync(PID_FILE, { force: true });
}
