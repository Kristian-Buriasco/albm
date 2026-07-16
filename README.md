<div align="center">

# Albm

**Self-hosted photography portfolio and client proofing — a Pic-Time replacement you own.**

One Next.js app: public portfolio, private client galleries at unguessable URLs, photo proofing, event self-service, passkey admin login, and safe self-hosted upgrades. SQLite and local files. No external services required.

[![Release](https://img.shields.io/github/v/release/Kristian-Buriasco/Albm?color=111)](https://github.com/Kristian-Buriasco/Albm/releases)
[![CI](https://github.com/Kristian-Buriasco/Albm/actions/workflows/ci.yml/badge.svg)](https://github.com/Kristian-Buriasco/Albm/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Container: GHCR](https://img.shields.io/badge/ghcr.io-albm-2496ED?logo=docker&logoColor=white)](https://github.com/Kristian-Buriasco/Albm/pkgs/container/albm)

</div>

---

## Screenshots

| Public portfolio | Client gallery |
|---|---|
| ![Homepage with Featured Work](docs/screenshots/portfolio.png) | ![Client proofing grid](docs/screenshots/client-gallery.png) |

| Lightbox & selections | Contact |
|---|---|
| ![Lightbox with favorites and slideshow](docs/screenshots/client-lightbox.png) | ![Contact with Instagram and WhatsApp](docs/screenshots/contact.png) |

| Admin dashboard | Gallery detail |
|---|---|
| ![Admin dashboard with charts](docs/screenshots/admin.png) | ![Sections, tags, and bulk select](docs/screenshots/admin-gallery.png) |

| Security | Audit log |
|---|---|
| ![Passkeys and recovery codes](docs/screenshots/security.png) | ![Admin audit log](docs/screenshots/audit.png) |

| Event self-service |
|---|
| ![Public event page with bib search](docs/screenshots/event-page.png) |

## Features

### Portfolio

- Homepage **Featured Work** and **More Work** grids; per-card shoot location
- Work-tab search by title, tag chips, and year
- Editable hero, about, contact, and footer copy from admin
- Portfolio lightbox with optional anonymous likes; sort by like count
- Open Graph previews for portfolio galleries when enabled

### Client proofing

- Unguessable slug URLs; optional password, 6-digit PIN, and auto-expiry
- Sections, folder upload (optional map subfolders → sections), drag-reorder, one-shot sort
- Photo tags with filter chips in gallery and admin
- Always `noindex`; optional link-preview OG card (cover + title only)
- Per-visitor favorites, optional selection limits, moderated comments
- Up to 5 favorite lists per visitor; ZIP and admin CSV export per list
- Magic-link client accounts (“Save my selections” → copyable link + QR, no SMTP); does not bypass password/PIN

### Delivery & protection

- Downloads when enabled: single photo, full-gallery ZIP, or favorites-only ZIP (streamed; no temp files)
- Multi-resolution downloads (optional per gallery): Web, Print (~3000px), and/or Original
- GPS stripped on download by default; optional keep of non-GPS EXIF
- Visible watermark (position, opacity, scale) plus optional gallery-specific PNG
- RAW / DNG ingest (optional): working JPEG for clients unless **Deliver RAW** is on (uploads up to 100 MB)
- Invisible forensic watermark (optional, **default off**): per-download stego mark + decode at `/admin/forensic`
- EXIF on request (**GPS is never stored** in the DB / never shown in the viewer)

### Event self-service

All of the following are **per-gallery options, default off**:

- Live upload / auto-publish — publish API pushes go live as processing finishes; client gallery polls with a Live badge
- Bib-number search — OCR at upload; attendees search at `/g/[slug]/find` (“photos matching #NNN”)
- Face search — overnight/admin batch embeddings; attendee selfie match **in memory, never stored** (biometric; notice-gated)
- Public event page — `/g/[slug]/event` with bib/selfie search and venue QR via ShareTools

### Admin & ops

- Passkeys (WebAuthn), one-time recovery codes, optional password login
- Stats with inline SVG charts, disk usage, bulk photo actions
- **Show in Featured Work** picker; **new-gallery defaults** under Settings
- Admin gallery folders (client / year / event — invisible on the public site)
- Upload tokens for the external publish API (hashed; shown once) — see [`docs/EXPORT.md`](docs/EXPORT.md)
- Audit log at `/admin/audit` (read-only, pruned)
- Session management — list/revoke admin sessions under Settings
- CSV and filename export for client selections
- Optional gallery collaborators (scoped invites + passkeys)
- Safe upgrades: DB backed up before every migration; failed migration aborts boot
- Self-contained UI (no external CDN, fonts, or trackers)
- Optional daily GitHub release check — disable with `DISABLE_UPDATE_CHECK=1`
- Persistent rate-limit store in SQLite; cookie consent gates optional analytics

### Security

- Single-admin (plus optional scoped collaborators), self-hosted
- See [SECURITY.md](SECURITY.md) for the threat model and private vulnerability reporting

### Host notes (mini / older macOS)

Bib OCR and face search use **WASM** stacks so they build on older Apple clang / macOS 10.13-class hosts without native ONNX/tfjs-node. Face batch is offline/admin-triggered, not real-time. Optional `dcraw` improves proprietary RAW decode (`DCRAW_PATH` if not on `PATH`).

## Roadmap

**Shipped** — client proofing, portfolio, passkeys, PIN/password gates, watermarking, sections, EXIF (GPS excluded), cover/link-preview/focal pickers, shift-select, CSV export, QR share, LQIP/retina, slideshow, PWA, sitemap/feeds/JSON-LD, EN/NL/IT, Docker + GHCR, live upload, RAW, forensic mark, multi-res download, GPS strip, bib/face search, event page, gallery collaborators, audit, presets, publish API, folders, work search, favorite lists, magic links, rate-limit store, sessions, consent.

**Later — scale-out** (when needed): object-storage backend, multi-photographer / studio mode.

Explicitly out of scope for now: automated backups, email/SMTP notifications.

## Quick start (Docker)

```bash
git clone https://github.com/Kristian-Buriasco/Albm.git
cd Albm

export SESSION_SECRET=$(openssl rand -hex 32)
export BASE_URL=https://gallery.example.com   # your real https origin

docker compose up -d --build
docker compose logs -f            # first run prints a temporary admin password
```

Open the site, log in at `/admin/login` with the printed password, then add a passkey under **Settings → Security**. Put a reverse proxy (Caddy, nginx, NPM) in front for HTTPS — passkeys require a secure origin.

Prebuilt images: **`ghcr.io/kristian-buriasco/albm`** (pin a version in production instead of `:latest`).

```bash
docker run -e SESSION_SECRET=$(openssl rand -hex 32) -v gallery:/data \
  -p 3200:3200 ghcr.io/kristian-buriasco/albm:latest
```

## Configuration

Copy `.env.example` to `.env` (or set these in the compose environment):

| Var | Purpose |
|---|---|
| `SESSION_SECRET` | **Required in prod.** Signs/encrypts cookies. `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | bcrypt hash. Empty → temp password printed on first run. `node scripts/hash-password.mjs 'pw'` |
| `BASE_URL` | Public https origin (share links + WebAuthn). `https://gallery.example.com` |
| `DATA_DIR` | Runtime data root (Docker volume, default `/data`) |
| `PORT` | HTTP port (default `3200`; TLS terminated upstream) |
| `NEXT_PUBLIC_SITE_NAME` | Site name in headers/titles. Default `Albm` |
| `RP_ID` | Optional WebAuthn RP ID override (defaults to host of `BASE_URL`) |
| `DISABLE_UPDATE_CHECK` | `1` to disable the daily GitHub release check |

All photos and the SQLite DB live under `DATA_DIR`; nothing there is served statically — every image byte goes through an auth-checked handler.

```
DATA_DIR/
  gallery.db
  backups/gallery-<timestamp>.db     # pre-migration snapshots
  photos/<galleryId>/{originals,web,thumb,print}/…
```

**Back up `DATA_DIR`** — it is your galleries and database.

External publish (Lightroom / Capture One / curl): create an upload token in **Settings → Upload tokens**, then see [`docs/EXPORT.md`](docs/EXPORT.md).

## Updating

- **Docker:** `docker compose pull && docker compose up -d`. Migrations apply on boot after backing up the DB.
- The admin panel shows a badge when a newer release exists (opt out with `DISABLE_UPDATE_CHECK=1`).

### Monitoring

`GET /api/health` returns `{ ok: true }` when the database is readable (no auth, no extra metadata). Point Uptime Kuma, Home Assistant, or any HTTP monitor at `https://your-domain/api/health` — expect 200 when healthy, 500 when the DB is unavailable. The Docker image `HEALTHCHECK` uses the same endpoint.

## Bare-metal (without Docker)

```bash
npm ci && npm run build
cp -r .next/static .next/standalone/.next/static
SESSION_SECRET=… BASE_URL=… DATA_DIR=/var/lib/gallery/data node .next/standalone/server.js
```

Templates in [`deploy/`](deploy): a `systemd` unit and an `update.sh` helper. Native modules (`sharp`, `better-sqlite3`) must be built for the host platform (`npm rebuild`). On older toolchains that cannot compile `better-sqlite3` v12 (needs C++20), pin **`better-sqlite3@11.10.0`** (already pinned in this repo).

When setting `ADMIN_PASSWORD_HASH` in a shell or `.env` file, escape `$` in the bcrypt hash (e.g. wrap in single quotes) — otherwise `$2b$…` can be mangled by the shell or env loader.

## Development

```bash
npm ci
cp .env.example .env      # set SESSION_SECRET
npm run dev               # http://localhost:3200
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

E2E (Playwright; boots a throwaway data dir via the suite setup):

```bash
npm run test:e2e:install   # once
npm run test:e2e
```

CI runs typecheck, lint, build, and `test:e2e` on PRs.

## Stack

Next.js 15 (App Router, standalone) · SQLite + Drizzle + better-sqlite3 (WAL, migrations at boot) · sharp (in-process queue) · Tailwind · iron-session · `@simplewebauthn` · archiver · Playwright (E2E). Optional ML/OCR: `tesseract.js`, `@vladmandic/face-api` + `@tensorflow/tfjs-backend-wasm`. Only required native modules: `sharp`, `better-sqlite3`.

## License

[AGPL-3.0-only](LICENSE) — Copyright (C) 2026 Kristian Buriasco. A modified version run as a network service must make its source available (AGPL network clause).

---

**Albm** is maintained by [Kristian Buriasco](https://github.com/Kristian-Buriasco) — sport and event photographer based in Leuven, Belgium.
