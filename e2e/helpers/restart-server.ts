import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { loadTestEnv } from './env';

const PORT = 3200;
const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const PID_FILE = path.join(ROOT, 'e2e', '.server-pid');
const SESSION_SECRET = 'e2e-test-session-secret-0123456789abcdef0123456789ab';

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('E2E server failed to become healthy after restart');
}

function stopServerPid() {
  if (!fs.existsSync(PID_FILE)) return;
  const pid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
  if (!Number.isFinite(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already stopped */
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already stopped */
  }
  fs.rmSync(PID_FILE, { force: true });
}

/** Restart the standalone server, preserving DATA_DIR (for rate-limit persistence tests). */
export async function restartE2eServer(): Promise<void> {
  const env = loadTestEnv();
  stopServerPid();
  await new Promise((r) => setTimeout(r, 800));

  fs.rmSync(path.join(STANDALONE, '.env'), { force: true });
  const hash = bcrypt.hashSync(env.password, 10);

  const server: ChildProcess = spawn('node', ['server.js'], {
    cwd: STANDALONE,
    detached: true,
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      DATA_DIR: env.dataDir,
      SESSION_SECRET,
      ADMIN_PASSWORD_HASH: hash,
      BASE_URL: env.baseUrl,
      DISABLE_UPDATE_CHECK: '1',
      COOKIE_SECURE: '0',
    },
    stdio: 'ignore',
  });
  server.unref();

  if (!server.pid) throw new Error('Failed to restart E2E server');
  fs.writeFileSync(PID_FILE, String(server.pid));
  await waitForHealth(env.baseUrl, 60_000);
}
