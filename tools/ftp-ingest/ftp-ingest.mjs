#!/usr/bin/env node
/**
 * albm ftp-ingest — receive photos from a camera over FTP and publish each one
 * to an Albm gallery the moment it arrives.
 *
 *   camera --FTP--> [this process] --HTTP /api/publish--> Albm
 *
 * Zero dependencies (Node >= 20). Files are spooled to disk first, so a flaky
 * network or an Albm restart never loses a frame: uploads retry with backoff,
 * and anything still in the spool is re-sent on startup.
 *
 * Usage:  node ftp-ingest.mjs [config.json]      (default ./config.json)
 *
 * FTP is plaintext. Run it on a trusted LAN / hotspot, and give every camera
 * its own FTP user (each user maps to one gallery + one Albm upload token).
 */
import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  albmUrl: 'http://127.0.0.1:3200',
  listen: { host: '0.0.0.0', port: 2121, pasvHost: null, pasvMin: 50000, pasvMax: 50100 },
  spoolDir: './spool',
  concurrency: 2,
  extensions: ['.jpg', '.jpeg', '.png'],
  keepUploaded: false,
  maxAuthFailuresPerIp: 10,
  retryBaseMs: 1000,
};

// Cameras/clients often upload to a temporary name, then RNTO the final one.
const TEMP_NAME = /(^\.)|(\.(tmp|part|filepart|temp|upload|uploading)$)/i;

export function lanIp() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

/** Strip any path and unsafe characters from a client-supplied filename. */
export function cleanName(raw) {
  const base = path.posix.basename(String(raw).replaceAll('\\', '/'));
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ]+/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..' || cleaned.startsWith('.')) return null;
  return cleaned;
}

/**
 * A dropped connection looks like a clean end-of-file in FTP, so verify the
 * file is structurally complete before publishing it: JPEGs end with the EOI
 * marker (FF D9, possibly followed by zero padding), PNGs end with IEND.
 */
export async function looksComplete(file, ext) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const n = Math.min(size, 64);
    const buf = Buffer.alloc(n);
    await fh.read(buf, 0, n, size - n);
    if (ext === '.png') return buf.includes(Buffer.from('IEND'));
    let end = n;
    while (end > 0 && buf[end - 1] === 0) end--;
    return end >= 2 && buf[end - 2] === 0xff && buf[end - 1] === 0xd9;
  } finally {
    await fh.close();
  }
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

export function createIngest(userConfig, hooks = {}) {
  const cfg = {
    ...DEFAULTS,
    ...userConfig,
    listen: { ...DEFAULTS.listen, ...(userConfig.listen ?? {}) },
  };
  cfg.extensions = cfg.extensions.map((e) => e.toLowerCase());
  const spoolRoot = path.resolve(cfg.spoolDir);
  const users = new Map(cfg.users.map((u) => [u.name, u]));
  const log = hooks.log ?? ((...a) => console.log(new Date().toISOString().slice(11, 19), ...a));

  const stats = { received: 0, uploaded: 0, duplicates: 0, failed: 0, skipped: 0, incomplete: 0 };
  const queue = [];
  let inflight = 0;
  let waiting = 0; // items sleeping between retries
  let stopping = false;
  const authFailures = new Map(); // ip -> [timestamps]
  const pausedUsers = new Set(); // user names whose token was rejected (401)
  const sockets = new Set();
  const retryTimers = new Set();
  let server = null;

  // ---------- upload pipeline ----------
  function enqueue(item) {
    queue.push(item);
    pump();
  }

  function pump() {
    while (!stopping && inflight < cfg.concurrency && queue.length > 0) {
      const idx = queue.findIndex((i) => !pausedUsers.has(i.user));
      if (idx === -1) return;
      const item = queue.splice(idx, 1)[0];
      inflight++;
      void run(item).finally(() => {
        inflight--;
        pump();
      });
    }
  }

  async function run(item) {
    const user = users.get(item.user);
    const file = path.join(item.dir, item.name);
    let outcome;
    try {
      const buf = await fsp.readFile(file);
      const form = new FormData();
      form.append(
        'file',
        new Blob([buf], { type: MIME[path.extname(item.name).toLowerCase()] ?? 'application/octet-stream' }),
        item.name,
      );
      const res = await fetch(
        `${cfg.albmUrl.replace(/\/$/, '')}/api/publish/${encodeURIComponent(user.galleryId)}/photos`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${user.token}` },
          body: form,
          signal: AbortSignal.timeout(180_000),
        },
      );
      const text = await res.text();
      let body = {};
      try {
        body = JSON.parse(text);
      } catch {
        /* non-JSON error page */
      }
      if (res.status === 201) outcome = { kind: 'ok' };
      else if (res.status === 200 && body.duplicate) outcome = { kind: 'dup', existing: body.existingFilename };
      else if (res.status === 401) outcome = { kind: 'auth' };
      else if (res.status === 429 || res.status >= 500) outcome = { kind: 'retry', why: `HTTP ${res.status}` };
      else outcome = { kind: 'fail', why: `HTTP ${res.status} ${body.error ?? ''}`.trim() };
    } catch (err) {
      outcome = { kind: 'retry', why: err?.cause?.code ?? err?.name ?? 'network error' };
    }

    if (outcome.kind === 'ok' || outcome.kind === 'dup') {
      if (outcome.kind === 'ok') stats.uploaded++;
      else stats.duplicates++;
      log(`${outcome.kind === 'ok' ? 'uploaded' : 'duplicate'}  ${item.user}/${item.name}`);
      await finish(item, true);
      hooks.onUploaded?.(item, outcome);
    } else if (outcome.kind === 'auth') {
      // Token rejected: stop hammering Albm for this user and keep the files.
      pausedUsers.add(item.user);
      queue.unshift(item);
      log(`!! upload token rejected for user "${item.user}" — pausing that user. Fix the token and restart.`);
    } else if (outcome.kind === 'fail') {
      stats.failed++;
      log(`FAILED     ${item.user}/${item.name} (${outcome.why}) -> failed/`);
      await finish(item, false, outcome.why);
    } else {
      item.attempts = (item.attempts ?? 0) + 1;
      const delay = Math.min(60_000, cfg.retryBaseMs * 2 ** Math.min(item.attempts, 6));
      log(`retry #${item.attempts} in ${delay >= 1000 ? Math.round(delay / 1000) + 's' : delay + 'ms'}  ${item.user}/${item.name} (${outcome.why})`);
      waiting++;
      const t = setTimeout(() => {
        retryTimers.delete(t);
        waiting--;
        enqueue(item);
      }, delay);
      retryTimers.add(t);
    }
  }

  async function finish(item, ok, reason) {
    try {
      if (ok && !cfg.keepUploaded) {
        await fsp.rm(item.dir, { recursive: true, force: true });
      } else {
        const dest = path.join(spoolRoot, item.user, ok ? 'uploaded' : 'failed', path.basename(item.dir));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        if (reason) await fsp.writeFile(path.join(item.dir, 'REASON.txt'), reason + '\n');
        await fsp.rename(item.dir, dest);
      }
    } catch (err) {
      log('cleanup error:', err.message);
    }
  }

  /** Move a finished upload out of .incoming into its own spool dir and queue it. */
  async function accept(userName, partFile, finalName) {
    const name = cleanName(finalName);
    const ext = name ? path.extname(name).toLowerCase() : '';
    if (!name || !cfg.extensions.includes(ext)) {
      stats.skipped++;
      log(`skipped    ${userName}/${finalName} (not an accepted image type)`);
      await fsp.rm(partFile, { force: true });
      return 'skipped';
    }
    if (!(await looksComplete(partFile, ext))) {
      stats.incomplete++;
      log(`incomplete ${userName}/${name} (truncated transfer; discarded — the camera should resend)`);
      await fsp.rm(partFile, { force: true });
      return 'incomplete';
    }
    const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const dir = path.join(spoolRoot, userName, 'pending', id);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(partFile, path.join(dir, name));
    stats.received++;
    log(`received   ${userName}/${name}`);
    hooks.onReceived?.({ user: userName, name });
    enqueue({ user: userName, dir, name });
    return 'ok';
  }

  // ---------- FTP control connections ----------
  function recentAuthFailures(ip) {
    const cutoff = Date.now() - 15 * 60_000;
    const arr = (authFailures.get(ip) ?? []).filter((t) => t > cutoff);
    authFailures.set(ip, arr);
    return arr.length;
  }

  function handleControl(sock) {
    sockets.add(sock);
    sock.setEncoding('utf8');
    sock.setTimeout(30 * 60_000, () => sock.destroy());
    const remote = (sock.remoteAddress ?? '').replace(/^::ffff:/, '');
    const local = (sock.localAddress ?? '').replace(/^::ffff:/, '');
    const s = {
      user: null, // authenticated user object
      pendingUser: null,
      cwd: '/',
      rnfr: null,
      pasv: null, // { server, accept(): Promise<Socket>, close() }
      active: null, // { host, port }
      temps: new Map(), // temp filename -> .part path (awaiting RNTO)
      transfers: 0,
    };
    const reply = (code, text) => sock.write(`${code} ${text}\r\n`);
    const multi = (code, lines, end) => sock.write(`${code}-${lines.join('\r\n')}\r\n${code} ${end}\r\n`);

    reply(220, 'albm ftp-ingest ready');

    function closePasv() {
      s.pasv?.close();
      s.pasv = null;
    }

    function openPasv() {
      closePasv();
      return new Promise((resolve, reject) => {
        const srv = net.createServer();
        let conn = null;
        let waiter = null;
        const timer = setTimeout(() => srv.close(), 60_000);
        srv.on('connection', (c) => {
          const from = (c.remoteAddress ?? '').replace(/^::ffff:/, '');
          if (from !== remote) {
            c.destroy(); // data connections must come from the control peer
            return;
          }
          conn = c;
          clearTimeout(timer);
          waiter?.(c);
          srv.close();
        });
        const tryPort = (n) => {
          const min = cfg.listen.pasvMin;
          const max = cfg.listen.pasvMax;
          const port = min + Math.floor(Math.random() * (max - min + 1));
          srv.once('error', (e) => {
            if (e.code === 'EADDRINUSE' && n < 30) tryPort(n + 1);
            else reject(e);
          });
          srv.listen(port, cfg.listen.host === '0.0.0.0' ? '0.0.0.0' : cfg.listen.host, () => {
            srv.removeAllListeners('error');
            resolve({
              port,
              accept: () =>
                new Promise((res, rej) => {
                  if (conn) return res(conn);
                  waiter = res;
                  setTimeout(() => rej(new Error('data connection timeout')), 30_000);
                }),
              close: () => {
                clearTimeout(timer);
                srv.close();
                conn?.destroy();
              },
            });
          });
        };
        tryPort(0);
      });
    }

    function dataConnection() {
      if (s.pasv) {
        const p = s.pasv;
        s.pasv = null;
        return p.accept();
      }
      if (s.active) {
        const a = s.active;
        s.active = null;
        return new Promise((res, rej) => {
          const c = net.connect({ host: a.host, port: a.port }, () => res(c));
          c.once('error', rej);
        });
      }
      return Promise.reject(new Error('no data connection set up'));
    }

    async function onStor(arg) {
      if (!s.user) return reply(530, 'Not logged in');
      const rawName = arg.trim();
      if (!rawName) return reply(501, 'Filename required');
      const base = path.posix.basename(rawName.replaceAll('\\', '/'));
      const temp = TEMP_NAME.test(base);
      const id = crypto.randomBytes(6).toString('hex');
      const partFile = path.join(spoolRoot, s.user.name, '.incoming', `${id}.part`);
      await fsp.mkdir(path.dirname(partFile), { recursive: true });
      let data;
      try {
        reply(150, 'Opening data connection');
        data = await dataConnection();
      } catch (err) {
        return reply(425, `Cannot open data connection: ${err.message}`);
      }
      const out = fs.createWriteStream(partFile);
      let ok = true;
      await new Promise((resolve) => {
        data.pipe(out);
        data.once('error', () => {
          ok = false;
          out.destroy();
          resolve();
        });
        data.once('close', () => {
          // A close without a clean end (we destroyed it, or the peer reset it)
          // means the file is incomplete; make sure we never wait forever.
          if (!data.readableEnded) {
            ok = false;
            out.destroy();
            resolve();
          }
        });
        out.once('close', resolve);
        out.once('error', () => {
          ok = false;
          resolve();
        });
      });
      if (!ok) {
        await fsp.rm(partFile, { force: true });
        return reply(426, 'Transfer aborted');
      }
      s.transfers++;
      if (temp) {
        s.temps.set(base, partFile);
        return reply(226, 'Transfer complete (awaiting rename)');
      }
      const result = await accept(s.user.name, partFile, base);
      if (result === 'incomplete') return reply(426, 'Transfer incomplete; please resend');
      return reply(226, 'Transfer complete');
    }

    async function onCommand(line) {
      const sp = line.indexOf(' ');
      const cmd = (sp === -1 ? line : line.slice(0, sp)).toUpperCase();
      const arg = sp === -1 ? '' : line.slice(sp + 1);

      if (cmd === 'USER') {
        s.pendingUser = arg.trim();
        s.user = null;
        return reply(331, 'Password required');
      }
      if (cmd === 'PASS') {
        if (recentAuthFailures(remote) >= cfg.maxAuthFailuresPerIp) {
          return reply(421, 'Too many failed logins; try later'), sock.end();
        }
        const u = s.pendingUser ? users.get(s.pendingUser) : null;
        const given = Buffer.from(arg);
        const want = Buffer.from(u?.password ?? '');
        const ok = !!u && given.length === want.length && crypto.timingSafeEqual(given, want);
        if (!ok) {
          authFailures.set(remote, [...(authFailures.get(remote) ?? []), Date.now()]);
          log(`login failed from ${remote} (user "${s.pendingUser ?? ''}")`);
          await new Promise((r) => setTimeout(r, 800));
          return reply(530, 'Login incorrect');
        }
        s.user = u;
        log(`login      ${u.name} from ${remote}`);
        return reply(230, 'Logged in');
      }
      // Commands usable before login.
      if (cmd === 'QUIT') return reply(221, 'Goodbye'), sock.end();
      if (cmd === 'SYST') return reply(215, 'UNIX Type: L8');
      if (cmd === 'NOOP') return reply(200, 'OK');
      if (cmd === 'FEAT') return multi(211, ['Features:', ' UTF8', ' EPSV', ' SIZE'], 'End');
      if (cmd === 'OPTS') return reply(200, 'OK');
      if (cmd === 'AUTH' || cmd === 'PBSZ' || cmd === 'PROT') return reply(534, 'TLS not supported by this server');

      if (!s.user) return reply(530, 'Please log in first');

      switch (cmd) {
        case 'PWD':
        case 'XPWD':
          return reply(257, `"${s.cwd}" is the current directory`);
        case 'CWD':
        case 'XCWD': {
          const target = arg.trim() || '/';
          s.cwd = path.posix.normalize(target.startsWith('/') ? target : path.posix.join(s.cwd, target));
          return reply(250, 'OK');
        }
        case 'CDUP':
          s.cwd = path.posix.dirname(s.cwd);
          return reply(250, 'OK');
        case 'TYPE':
        case 'MODE':
        case 'STRU':
          return reply(200, 'OK');
        case 'MKD':
        case 'XMKD':
          return reply(257, `"${arg.trim()}" created`);
        case 'RMD':
        case 'XRMD':
          return reply(250, 'OK');
        case 'PASV': {
          try {
            const p = await openPasv();
            s.pasv = p;
            s.active = null;
            const advertise = cfg.listen.pasvHost || (local === '127.0.0.1' ? '127.0.0.1' : lanIp());
            const h = advertise.split('.').join(',');
            return reply(227, `Entering Passive Mode (${h},${p.port >> 8},${p.port & 255})`);
          } catch {
            return reply(425, 'Cannot open passive port');
          }
        }
        case 'EPSV': {
          try {
            const p = await openPasv();
            s.pasv = p;
            s.active = null;
            return reply(229, `Entering Extended Passive Mode (|||${p.port}|)`);
          } catch {
            return reply(425, 'Cannot open passive port');
          }
        }
        case 'PORT': {
          const n = arg.split(',').map(Number);
          if (n.length !== 6 || n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return reply(501, 'Bad PORT');
          const host = n.slice(0, 4).join('.');
          if (host !== remote) return reply(504, 'PORT must target the client address');
          closePasv();
          s.active = { host, port: n[4] * 256 + n[5] };
          return reply(200, 'PORT ok');
        }
        case 'EPRT': {
          const parts = arg.split('|');
          const host = parts[2];
          const port = Number(parts[3]);
          if (!host || !Number.isInteger(port) || host.replace(/^::ffff:/, '') !== remote) return reply(504, 'EPRT must target the client address');
          closePasv();
          s.active = { host, port };
          return reply(200, 'EPRT ok');
        }
        case 'LIST':
        case 'NLST':
        case 'MLSD': {
          try {
            reply(150, 'Here comes the listing');
            const d = await dataConnection();
            d.end('');
            return reply(226, 'Directory send OK');
          } catch (err) {
            return reply(425, `Cannot open data connection: ${err.message}`);
          }
        }
        case 'STOR':
        case 'APPE':
        case 'STOU':
          return onStor(arg);
        case 'RNFR':
          s.rnfr = path.posix.basename(arg.trim().replaceAll('\\', '/'));
          return reply(350, 'Ready for RNTO');
        case 'RNTO': {
          const to = arg.trim();
          const from = s.rnfr;
          s.rnfr = null;
          if (!from || !s.temps.has(from)) return reply(550, 'Rename source not found');
          const part = s.temps.get(from);
          s.temps.delete(from);
          const renamed = await accept(s.user.name, part, to);
          if (renamed === 'incomplete') return reply(550, 'File was incomplete; please resend');
          return reply(250, 'Rename successful');
        }
        case 'DELE':
          return reply(550, 'Delete not permitted');
        case 'SIZE':
        case 'MDTM':
        case 'RETR':
          return reply(550, 'Not found');
        case 'ABOR':
          closePasv();
          return reply(226, 'Aborted');
        default:
          return reply(502, `${cmd} not implemented`);
      }
    }

    // Serialise commands per connection (a camera never pipelines, but be safe).
    let buffer = '';
    let chain = Promise.resolve();
    sock.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        chain = chain
          .then(() => onCommand(line))
          .catch((err) => {
            log('command error:', err.message);
            try {
              reply(451, 'Local error');
            } catch {
              /* socket gone */
            }
          });
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => {
      sockets.delete(sock);
      closePasv();
      for (const part of s.temps.values()) void fsp.rm(part, { force: true });
    });
  }

  // ---------- lifecycle ----------
  async function recoverSpool() {
    let n = 0;
    for (const u of users.keys()) {
      await fsp.rm(path.join(spoolRoot, u, '.incoming'), { recursive: true, force: true });
      const pending = path.join(spoolRoot, u, 'pending');
      let ids = [];
      try {
        ids = await fsp.readdir(pending);
      } catch {
        continue;
      }
      for (const id of ids.sort()) {
        const dir = path.join(pending, id);
        const files = (await fsp.readdir(dir)).filter((f) => f !== 'REASON.txt');
        if (files[0]) {
          enqueue({ user: u, dir, name: files[0] });
          n++;
        }
      }
    }
    if (n) log(`recovered ${n} unsent file(s) from the spool`);
  }

  return {
    stats,
    pending: () => queue.length + inflight + waiting,
    async start() {
      for (const u of cfg.users) {
        if (!u.name || !u.password || !u.galleryId || !u.token) {
          throw new Error(`user "${u.name ?? '?'}" needs name, password, galleryId and token`);
        }
        await fsp.mkdir(path.join(spoolRoot, u.name), { recursive: true });
      }
      await recoverSpool();
      server = net.createServer(handleControl);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(cfg.listen.port, cfg.listen.host, resolve);
      });
      const addr = server.address();
      log(`listening on ${cfg.listen.host}:${addr.port}  (passive ${cfg.listen.pasvMin}-${cfg.listen.pasvMax}, advertise ${cfg.listen.pasvHost || lanIp()})`);
      return addr.port;
    },
    async stop() {
      stopping = true;
      for (const t of retryTimers) clearTimeout(t);
      for (const sck of sockets) sck.destroy();
      await new Promise((r) => (server ? server.close(r) : r()));
    },
  };
}

// ---------- CLI ----------
async function main() {
  const file = path.resolve(process.argv[2] ?? 'config.json');
  let config;
  try {
    config = JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    console.error(`Cannot read config ${file}: ${err.message}\nCopy config.example.json to config.json and fill it in.`);
    process.exit(1);
  }
  const st = await fsp.stat(file);
  if (st.mode & 0o077) console.warn(`warning: ${file} holds upload tokens and passwords — run: chmod 600 ${file}`);

  const ingest = createIngest(config);
  await ingest.start();
  setInterval(() => {
    const s = ingest.stats;
    console.log(
      `${new Date().toISOString().slice(11, 19)} status    received ${s.received} · uploaded ${s.uploaded} · duplicate ${s.duplicates} · failed ${s.failed} · skipped ${s.skipped} · incomplete ${s.incomplete} · waiting ${ingest.pending()}`,
    );
  }, 60_000).unref();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.log(`${sig}: shutting down (unsent files stay in the spool)`);
      await ingest.stop();
      process.exit(0);
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
