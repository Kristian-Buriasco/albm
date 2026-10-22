#!/usr/bin/env python3
"""Host-side updater for a Docker Compose Albm. Albm's admin calls it; it pulls the new pinned image,
backs up the DB, swaps the tag in compose.yaml, restarts the service and rolls back if it never gets healthy.

Albm never touches the Docker socket: only this process does, and it only ever acts on one compose
project, one service and one image, and only accepts a plain x.y.z version.

Config (environment): UPDATER_TOKEN, COMPOSE_DIR, SERVICE, IMAGE (e.g. ghcr.io/kristian-buriasco/albm),
LISTEN_HOST (default 172.17.0.1, the docker0 gateway), LISTEN_PORT (default 9201), HEALTH_TIMEOUT (default 120).
"""
import hmac
import json
import os
import re
import shutil
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get('UPDATER_TOKEN', '')
COMPOSE_DIR = os.environ.get('COMPOSE_DIR', '')
SERVICE = os.environ.get('SERVICE', '')
IMAGE = os.environ.get('IMAGE', '')
HOST = os.environ.get('LISTEN_HOST', '172.17.0.1')
PORT = int(os.environ.get('LISTEN_PORT', '9201'))
HEALTH_TIMEOUT = int(os.environ.get('HEALTH_TIMEOUT', '120'))

VERSION_RE = re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}$')
state = {'state': 'idle', 'target': None, 'message': ''}
lock = threading.Lock()


def set_state(**kw):
    with lock:
        state.update(kw)


def run(args, timeout=600):
    return subprocess.run(args, cwd=COMPOSE_DIR, capture_output=True, text=True, timeout=timeout)


def compose_path():
    return os.path.join(COMPOSE_DIR, 'compose.yaml')


def swap_tag(text, version):
    """Replace the tag on the single `image: IMAGE:<tag>` line. Returns (new_text, old_tag)."""
    pat = re.compile(r'^(\s*image:\s*)' + re.escape(IMAGE) + r':([\w.-]+)\s*$', re.M)
    found = pat.findall(text)
    if len(found) != 1:
        raise ValueError(f'expected exactly one "image: {IMAGE}:<tag>" line, found {len(found)}')
    return pat.sub(lambda m: f'{m.group(1)}{IMAGE}:{version}', text), found[0][1]


def container_health():
    cid = run(['docker', 'compose', 'ps', '-q', SERVICE]).stdout.strip()
    if not cid:
        return 'missing'
    out = run(['docker', 'inspect', '--format', '{{.State.Health.Status}}', cid]).stdout.strip()
    return out or 'unknown'


def wait_healthy():
    end = time.time() + HEALTH_TIMEOUT
    while time.time() < end:
        if container_health() == 'healthy':
            return True
        time.sleep(3)
    return False


BACKUP_JS = (
    "const D=require('better-sqlite3'),fs=require('fs');"
    "const t=Date.now();new D('/data/gallery.db').exec(`VACUUM INTO '/data/pre-update-${t}.db'`);"
    "fs.readdirSync('/data').filter(f=>/^pre-update-\\d+\\.db$/.test(f)).sort().slice(0,-3)"
    ".forEach(f=>fs.unlinkSync('/data/'+f));"
)


def do_update(version):
    path = compose_path()
    backup = None
    try:
        set_state(state='pulling', target=version, message=f'Pulling {IMAGE}:{version}')
        r = run(['docker', 'pull', f'{IMAGE}:{version}'])
        if r.returncode != 0:
            raise RuntimeError('Pull failed: ' + (r.stderr.strip().splitlines() or ['unknown'])[-1])
        set_state(message='Backing up the database')
        r = run(['docker', 'compose', 'exec', '-T', SERVICE, 'node', '-e', BACKUP_JS], timeout=300)
        if r.returncode != 0:
            raise RuntimeError('Database backup failed, nothing changed')
        with open(path, encoding='utf8') as f:
            original = f.read()
        new, old = swap_tag(original, version)
        backup = f'{path}.bak-{old}'
        shutil.copyfile(path, backup)
        with open(path, 'w', encoding='utf8') as f:
            f.write(new)
        set_state(state='restarting', message='Restarting')
        r = run(['docker', 'compose', 'up', '-d', SERVICE])
        if r.returncode != 0 or not wait_healthy():
            raise RuntimeError('New version did not become healthy')
        set_state(state='done', message=f'Updated from {old} to {version}')
    except Exception as e:  # roll back whatever was changed
        msg = str(e)
        if backup and os.path.exists(backup):
            shutil.copyfile(backup, path)
            run(['docker', 'compose', 'up', '-d', SERVICE])
            msg += ' (rolled back)'
        set_state(state='failed', message=msg)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        given = self.headers.get('Authorization', '').removeprefix('Bearer ')
        return bool(TOKEN) and hmac.compare_digest(given.encode(), TOKEN.encode())

    def do_GET(self):
        if not self.authed():
            return self.reply(401, {'error': 'unauthorized'})
        if self.path != '/status':
            return self.reply(404, {'error': 'not found'})
        with lock:
            self.reply(200, dict(state))

    def do_POST(self):
        if not self.authed():
            return self.reply(401, {'error': 'unauthorized'})
        if self.path != '/update':
            return self.reply(404, {'error': 'not found'})
        try:
            body = json.loads(self.rfile.read(min(int(self.headers.get('Content-Length', 0)), 1024)) or b'{}')
        except ValueError:
            return self.reply(400, {'error': 'bad json'})
        version = body.get('version') if isinstance(body, dict) else None
        if not isinstance(version, str) or not VERSION_RE.match(version):
            return self.reply(400, {'error': 'version must look like 2.3.0'})
        with lock:
            if state['state'] in ('pulling', 'restarting'):
                return self.reply(409, {'error': 'an update is already running'})
            state.update(state='pulling', target=version, message='Starting')
        threading.Thread(target=do_update, args=(version,), daemon=True).start()
        self.reply(202, {'ok': True})


if __name__ == '__main__':
    if not (TOKEN and COMPOSE_DIR and SERVICE and IMAGE):
        raise SystemExit('UPDATER_TOKEN, COMPOSE_DIR, SERVICE and IMAGE are required')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
