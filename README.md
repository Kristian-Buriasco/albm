# gallery-site

Self-hosted photography portfolio + client proofing galleries (a Pic-Time
replacement). Single Next.js 15 app: public portfolio site, private client
galleries at unguessable URLs (optional password), and a single-user admin
panel. SQLite + filesystem storage, no external services.

## Stack

- Next.js 15 (App Router, TypeScript, `output: 'standalone'`)
- SQLite via Drizzle ORM + better-sqlite3 (WAL, migrations applied at boot)
- Sharp for image derivatives (in-process queue, concurrency 1)
- Tailwind CSS, iron-session cookies, archiver for streaming ZIPs
- Only native modules: `sharp` and `better-sqlite3`

## Configuration

Copy `.env.example` to `.env` and fill in:

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (default 3200; TLS terminated upstream) |
| `DATA_DIR` | Root of all runtime data (default `./data` in dev) |
| `SESSION_SECRET` | 64 random chars for cookie encryption |
| `ADMIN_PASSWORD_HASH` | bcrypt hash — generate with `node scripts/hash-password.mjs 'mypassword'` |
| `NEXT_PUBLIC_SITE_NAME` | Site name (baked in at build time) |
| `BASE_URL` | Public base URL, used for share links |

All photos and the SQLite DB live under `$DATA_DIR`:

```
$DATA_DIR/
  gallery.db
  photos/<galleryId>/{originals,web,thumb}/…
  watermark.png
```

Nothing under `$DATA_DIR` is ever served statically; every image byte goes
through an auth-checked route handler.

## Development

```bash
npm install
npm run dev          # http://localhost:3200
```

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`,
`npm run db:generate` (regenerate Drizzle migrations after schema changes).

## Production build & deploy

The production host (Intel Mac mini, macOS 10.13, 2 GB RAM, Node 20.19 via
MacPorts) **cannot run `next build`**. Build on a dev machine and copy the
standalone bundle over:

```bash
npm install
npm run build

# Assemble the runnable bundle (standalone output does not include these):
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public   # if a public/ directory exists
```

Copy `.next/standalone/` to the host (e.g. `/opt/sites/gallery/app`), then on
the host:

```bash
cd /opt/sites/gallery/app

# Native modules must match the host platform (darwin-x64, Node 20).
# The bundle built on an arm64 Mac ships arm64 binaries — rebuild/replace them:
npm rebuild better-sqlite3 sharp
# or: (cd node_modules/… ) reinstall with npm install --cpu=x64 --os=darwin sharp

PORT=3200 \
DATA_DIR=/opt/sites/gallery/data \
SESSION_SECRET=… \
ADMIN_PASSWORD_HASH=… \
BASE_URL=https://gallery.kristianburiasco.it \
node server.js
```

Migrations are applied automatically at boot; photos stuck in `processing`
from an interrupted run are re-enqueued automatically.

Deployment details (launchd plist, reverse proxy host, TLS) are handled
outside this codebase — the app only needs `node server.js` honoring `PORT`
and `DATA_DIR`.

### Known runtime risk: sharp on macOS 10.13

Sharp's prebuilt binaries claim macOS ≥ 10.13 support, but 10.13 is the
**oldest supported target and must be verified on the host before first
deploy**:

```bash
node -e "require('sharp')"
```

If it fails, fall back to sharp 0.32.x (`npm install sharp@0.32`) — this
codebase only uses sharp APIs available in 0.32 (`resize`, `composite`,
`webp`, `metadata`, `rotate`, `cache`, `concurrency`), so no code changes
should be needed. `better-sqlite3` likewise needs a darwin-x64 prebuild or a
local `npm rebuild` (requires Xcode CLT on the host).

## Notes

- Rate limiting of password attempts is in-memory (single process): 10
  failures per IP per 15 minutes → 429.
- ZIP downloads stream originals in `store` mode directly to the response —
  no temp files, minimal memory.
- Image processing runs in-process with concurrency 1 (`sharp.cache(false)`,
  `sharp.concurrency(1)`) to fit the 2 GB RAM host.
