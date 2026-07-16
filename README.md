<div align="center">

# Albm

**Self-hosted photography portfolio and client proofing — a Pic-Time replacement you own.**

One Next.js app: a public portfolio, private client galleries at unguessable URLs, photo proofing, passkey admin login, and safe self-hosted upgrades. SQLite and local files. No external services.

[![Release](https://img.shields.io/github/v/release/Kristian-Buriasco/Albm?color=111)](https://github.com/Kristian-Buriasco/Albm/releases)
[![CI](https://github.com/Kristian-Buriasco/Albm/actions/workflows/ci.yml/badge.svg)](https://github.com/Kristian-Buriasco/Albm/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Container: GHCR](https://img.shields.io/badge/ghcr.io-albm-2496ED?logo=docker&logoColor=white)](https://github.com/Kristian-Buriasco/Albm/pkgs/container/albm)

</div>

---

## Screenshots

| | |
|---|---|
| **Albm public portfolio** | **Client gallery** (proofing) |
| ![Albm portfolio homepage](docs/screenshots/portfolio.png) | ![Albm client gallery with proofing controls](docs/screenshots/client-gallery.png) |
| **Admin dashboard** | **Security** (passkeys + recovery) |
| ![Albm admin dashboard with stats](docs/screenshots/admin.png) | ![Albm admin security settings](docs/screenshots/security.png) |

## Features

### Public portfolio

- Homepage with **Featured Work** and **More Work** grids; per-card shoot location
- Editable hero, about, contact, and footer copy from the admin panel
- Portfolio lightbox with optional anonymous likes; admin can sort by like count
- Open Graph previews for portfolio galleries when enabled

### Client galleries

- Unguessable slug URLs, optional password, optional auto-expiry
- Sections, folder upload, drag-reorder, and one-shot sort (filename / capture date / upload date)
- Photo tags with filter chips in the gallery and admin
- Always `noindex`; optional link-preview OG card when sharing (cover + title only)

### Proofing and downloads

- Per-visitor favorites (selections), optional selection limits, moderated comments
- Downloads when enabled: single photo, full-gallery ZIP, or favorites-only ZIP — all streamed in store mode (no temp files)

### Images and metadata

- EXIF display on request (**GPS is never stored**)
- Admin-set shoot location with optional map link
- Per-gallery watermark (position, opacity, scale) plus optional gallery-specific PNG

### Admin

- Passkeys (WebAuthn), one-time recovery codes, optional password login
- Stats with inline SVG charts, disk usage, bulk photo actions
- **Show in Featured Work** picker for the homepage
- CSV and filename export for client selections

### Operations

- **Safe upgrades:** database backed up before every migration; a failed migration aborts boot instead of serving a half-migrated DB
- Self-contained UI (no external CDN, fonts, or trackers)
- Optional daily GitHub release check — disable with `DISABLE_UPDATE_CHECK=1` (the app’s only outbound request)

## Roadmap

Phases are ordered by dependency, not calendar. Detailed build specs live in `FIXES-6.md` (near-term) and `FIXES-7.md` (later phases).

**Shipped** — client proofing, portfolio galleries, passkey admin auth, password/6-digit-PIN gates, watermarking, sections, EXIF (GPS excluded), cover/link-preview/focal pickers, shift-select, CSV export, QR share, LQIP blur-up, retina `srcset`, slideshow, swipe nav, storage + most-viewed dashboards, PWA, sitemap/feeds/JSON-LD, EN/NL/IT, Docker + GHCR releases.

**In progress — foundation & product depth** (`FIXES-6.md`)

- Safety net: end-to-end test suite, admin audit log
- Gallery presets, external-publish API (Lightroom / Capture One / curl), folder→sections mapping, admin gallery folders, work-tab search, multiple favorite lists, magic-link client accounts (cross-device favorites)
- Hardening: persistent rate-limit store, admin session management, consent notice

**Planned — delivery & protection** (`FIXES-7.md`, Phase 2)

- Live upload during events (auto-publish), RAW/DNG ingest, invisible forensic watermark, multi-resolution download, GPS strip on download

**Planned — event self-service** (Phase 3)

- Bib-number search, face search (batch), public event page with venue QR

**Later — scale-out** (Phase 4, when needed)

- Object-storage backend, multi-photographer / studio mode

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
| `NEXT_PUBLIC_SITE_NAME` | Site name in headers/titles. Default in `.env.example` is `Albm`; set to **Albm** or your studio name |
| `RP_ID` | Optional WebAuthn RP ID override (defaults to host of `BASE_URL`) |
| `DISABLE_UPDATE_CHECK` | `1` to disable the daily GitHub release check |

All photos and the SQLite DB live under `DATA_DIR`; nothing there is served statically — every image byte goes through an auth-checked handler.

```
DATA_DIR/
  gallery.db
  backups/gallery-<timestamp>.db     # pre-migration snapshots
  photos/<galleryId>/{originals,web,thumb}/…
```

**Back up `DATA_DIR`** — it is your galleries and database.

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

## Stack

Next.js 15 (App Router, standalone) · SQLite + Drizzle + better-sqlite3 (WAL, migrations at boot) · sharp (in-process queue) · Tailwind · iron-session · `@simplewebauthn` · archiver. Only native modules: `sharp`, `better-sqlite3`.

## Security

Single-admin, self-hosted. See [SECURITY.md](SECURITY.md) for the model and private vulnerability reporting.

## License

[AGPL-3.0-only](LICENSE) — Copyright (C) 2026 Kristian Buriasco. A modified version run as a network service must make its source available (AGPL network clause).

---

**Albm** is maintained by [Kristian Buriasco](https://github.com/Kristian-Buriasco) — sport and event photographer based in Leuven, Belgium.
