# Contributing

Thanks for your interest in Albm. This file is for anyone who changes the code: the owner, collaborators with
write access, and outside contributors.

## Dev setup

```bash
npm ci
cp .env.example .env         # fill SESSION_SECRET at least
npm run dev                  # http://localhost:3200
```

On first run with no `ADMIN_PASSWORD_HASH`, a temporary admin password is
printed to the console — use it at `/admin/login`. Needs Node 22.

Useful environment variables for development: `DATA_DIR` (where the SQLite DB and photos live; use a throwaway
folder, never a copy of real client galleries), `BASE_URL`, `NEXT_PUBLIC_SITE_NAME`, `DISABLE_UPDATE_CHECK=1`.
Object storage (`S3_*`) and the web updater (`UPDATER_*`) are optional; see `docs/OBJECT-STORAGE.md` and `docs/UPDATER.md`.

## Working on a change

1. Branch from `master`: `feat/<short-name>` or `fix/<short-name>`.
2. Make the change, with a test when it adds logic (see Tests).
3. Run the checks below.
4. Open a pull request into `master`. CI must be green before it is merged.
5. Commit messages: a short imperative summary, conventional prefix (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`).

Do not push straight to `master` and do not rewrite its history. Never commit `.env`, real photos, database files,
passwords, tokens or keys; if a secret was committed, rotate it, because removing it from git does not make it safe.

## Checks (run before opening a PR)

```bash
npm run typecheck
npm run lint
npm run build
```

CI runs these on every PR, plus the end-to-end suite.

## Tests

```bash
npm run test:unit            # fast, no server (tests/unit)
npm run build && npm run test:e2e   # Playwright, boots its own server on port 3200
```

- The e2e suite needs a production build first and **no dev server running on port 3200**.
- First time: `npm run test:e2e:install` downloads Playwright's Chromium. If that is not available, run the suite
  against an installed Chrome with a small config that sets `use.channel = 'chrome'`.
- Specs live in `e2e/` (`batchN.spec.ts`, each covering one feature area). Add a new `batchN.spec.ts` or extend the
  one for the area you touch. Helpers (login, create gallery, invite collaborator) are in `e2e/helpers/`.
- Browser-less API tests are fast; prefer them when the behaviour is server-side.
- A test that fails once and passes on rerun is a flake: say so in the PR instead of ignoring it, and fix it if you can.
- `npm run build` can fail in CI with a Google Fonts download error from `next/font`. That is a known network flake;
  rerun the failed job.

## Database & migrations

- SQLite via Drizzle ORM. Schema lives in `src/db/schema.ts`.
- After changing the schema, generate a migration:
  ```bash
  npm run db:generate
  ```
  Commit the generated files in `drizzle/`. Migrations apply automatically at
  boot; an existing database is backed up to `DATA_DIR/backups/` first, and a
  failed migration aborts startup rather than serving a half-migrated DB.
- Migrations only go forward. A deploy can roll the code back, but not the schema, so make changes additive
  (new columns/tables) and avoid renames or drops in one step.

## Where things are

| Path | What |
|---|---|
| `src/app/` | Pages and API routes (Next.js App Router). `src/app/api/admin/*` is owner-only, `src/app/api/collab/*` is collaborator onboarding |
| `src/lib/` | Server logic: settings, auth/session, passkeys, object storage, galleries, version/updater |
| `src/components/` | Shared UI. Server components by default |
| `src/db/schema.ts`, `drizzle/` | Database schema and migrations |
| `e2e/`, `tests/unit/` | Playwright and unit tests |
| `scripts/` | Operational scripts that run inside the image (backup, migrate derivatives) |
| `deploy/` | Bare-metal service files and the host-side web updater (`deploy/updater`) |
| `docs/` | Feature docs and `openapi.yaml` (keep it in step with API changes) |
| `worker/`, `tools/` | Analysis worker and FTP ingest, separate processes |

## Conventions

- TypeScript, App Router, server components by default; `'use client'` only
  where needed.
- Keep the security bar: server-side length caps + rate limiting on public
  writes, existence-404 (not 403) for unpublished galleries, never render
  user input as HTML, no new outbound network calls.
- Self-contained only — no external CDN/font/script requests from pages.
- Owner-only routes call `requireOwner()`; gallery-scoped routes use `requireGalleryCapability()`. New admin
  routes get an audit-log entry (`logAdmin`) when they change state.
- Anything that reads runtime config in a route or page must not be statically prerendered (use
  `export const dynamic = 'force-dynamic'` or read per request), or the build bakes in the wrong value.
- User-visible text goes through `src/lib/i18n.ts` and needs all languages there.
- Match the code around you: naming, comment density, idiom.

## Working in parallel

Several people may branch from `master` at once. To keep merges small:

- Rebase onto the latest `master` before you open the PR (`git fetch origin && git rebase origin/master`).
- **Do not bump the version or edit `CHANGELOG.md` in a feature PR** unless a maintainer asks; the maintainer does that at release time. Those files conflict constantly.
- If two branches both add a database migration they will collide on the number. Whoever merges second deletes their
  migration file and its entry in `drizzle/meta/_journal.json`, rebases, and runs `npm run db:generate` again.
- Tell the others when you touch shared layout files (`src/app/layout.tsx`, `src/app/page.tsx`, `src/components/SiteHeader.tsx`,
  `SiteFooter.tsx`, `SettingsForm.tsx`).

## Releases (maintainers)

Releases are cut from `master`. The image is built by CI from the tag, so do not build or push images by hand.

1. Bump the version in **`package.json`, `package-lock.json` (the top two `version` lines), `docs/openapi.yaml` and
   `public/openapi.yaml`** *before* tagging. The version is baked into the image at build time.
2. Add a `## [x.y.z] — YYYY-MM-DD` section to `CHANGELOG.md` (Added / Changed / Fixed).
3. Commit, push `master`, then `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The Release workflow builds amd64 and arm64 in parallel (about 5 minutes), publishes
   `ghcr.io/kristian-buriasco/albm:X.Y.Z` and `:latest`, and creates the GitHub Release.

## Deploying (maintainers)

Production runs the pinned image tag from a Docker Compose file; pin a release tag, never `latest`. Update staging
first, check it, then production. Where the web updater is installed, use the **Update** button in the admin
(`docs/UPDATER.md`); it backs up the database, swaps the tag, and rolls back if the new version is not healthy.
Otherwise change the tag in `compose.yaml`, `docker compose pull && docker compose up -d`, and check `/api/health`.

## Scope

This is a focused single-admin app. Please open an issue to discuss larger
features (multi-tenant, plugins, etc.) before building them.
