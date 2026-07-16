import { execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const PORT = 3200;
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'e2e', '.data');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const ENV_FILE = path.join(ROOT, 'e2e', '.test-env.json');
const PID_FILE = path.join(ROOT, 'e2e', '.server-pid');

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
  throw new Error('E2E server failed to become healthy');
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function killPort(port: number) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
      stdio: 'ignore',
    });
  } catch {
    /* ignore */
  }
}

export default async function globalSetup() {
  killPort(PORT);
  if (!fs.existsSync(path.join(STANDALONE, 'server.js'))) {
    execSync('npm run build', { stdio: 'inherit', cwd: ROOT });
  }
  const staticSrc = path.join(ROOT, '.next', 'static');
  const staticDest = path.join(STANDALONE, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    fs.rmSync(staticDest, { recursive: true, force: true });
    copyDir(staticSrc, staticDest);
  }
  const publicDest = path.join(STANDALONE, 'public');
  fs.rmSync(publicDest, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'public'), publicDest);

  // Standalone build copies project .env — remove so spawn env is authoritative.
  fs.rmSync(path.join(STANDALONE, '.env'), { force: true });

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const password = 'e2e-test-password';
  const hash = bcrypt.hashSync(password, 10);
  const sessionSecret = 'e2e-test-session-secret-0123456789abcdef0123456789ab';
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const server: ChildProcess = spawn('node', ['server.js'], {
    cwd: STANDALONE,
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      DATA_DIR,
      SESSION_SECRET: sessionSecret,
      ADMIN_PASSWORD_HASH: hash,
      BASE_URL: baseUrl,
      DISABLE_UPDATE_CHECK: '1',
      COOKIE_SECURE: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (!server.pid) throw new Error('Failed to start E2E server');

  server.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString();
    if (msg.includes('Error') || msg.includes('error')) {
      console.error('[e2e-server]', msg.trim());
    }
  });

  fs.writeFileSync(
    ENV_FILE,
    JSON.stringify({ password, baseUrl, dataDir: DATA_DIR }),
  );
  fs.writeFileSync(PID_FILE, String(server.pid));

  await waitForHealth(baseUrl, 90_000);
}
