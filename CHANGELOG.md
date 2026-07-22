# Changelog

All notable changes to Albm are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use
[Semantic Versioning](https://semver.org/).

## [1.10.2] — 2026-07-23

### Fixed
- **Uploads over ~10 MB failed and retried endlessly.** Next.js middleware ran on the
  upload route and buffered the request body under Next 15.5's default 10 MB middleware
  limit, truncating larger photos so the multipart parse failed (`Expected multipart form
  data`) and the client retried the same file. The middleware matcher now excludes `/api`
  (it only did page-level work anyway), so upload bodies reach the route handler intact and
  its own 50 MB limit applies.

### Added
- **Lightroom publish**: a bundled Lightroom Classic **Publish Service plugin**
  (`integrations/lightroom/`) — map a Lightroom collection to an Albm gallery and
  Publish, with full add / modify / delete sync. New token-authed API endpoints back it:
  `GET /api/publish/galleries` (list), `PUT /api/publish/{galleryId}/photos/{photoId}`
  (replace an edited photo in place), and `DELETE …/{photoId}` (remove). Replace/delete
  are audit-logged (`publish.replace` / `publish.delete`).
  - **Security note:** upload tokens can now replace and delete photos (not just add) in
    any gallery — treat them like passwords; revoke leaked ones in Settings → Sharing.
- **Contact page → inquiry funnel**: the contact page now has a real booking form
  (name, email, event type, date, message) instead of a static link list. Submissions
  are stored as **leads** in a new admin **Inquiries** inbox (filter new/read/archived,
  reply via mailto, unread badge in the nav). Spam-guarded with a honeypot + rate limit
  (5 / 15 min per IP) — no external CAPTCHA. New `inquiries` table.
- **Optional email notifications** (`src/lib/mailer.ts`, nodemailer): when SMTP is
  configured, each new inquiry emails you; without SMTP the lead is still stored and
  everything else works (graceful no-op, same pattern as the optional geo DB).
- **SMTP settings** in the admin Settings page (host/port/user/password/from/to) — no
  plist edits needed. Falls back to `SMTP_*` env vars if those are set instead.

## [1.10.0] — 2026-07-20

Combined release covering three roadmap themes: storage, live events, and marketing.

### Added
- **Storage & integrity**: a **Maintenance** admin page — derivative-integrity scan (finds
  `ready` photos missing thumb/md/web — plus working/print for RAW — and one-click regenerates
  them) and volume/storage usage. Per-gallery **storage usage bar** with an optional **soft
  quota** (`storage_quota_bytes`): warns at ≥80% / over, never blocks uploads.
- **Live event wall / kiosk**: per-gallery **kiosk mode** — a fullscreen, auto-rotating,
  chrome-free wall of the newest uploads that polls live during an event. Shareable public link
  (+ QR); respects the gallery's existing password/PIN/expiry gating. New `kiosk_enabled` /
  `kiosk_token` columns.
- **Client testimonials** (moderated): after a gallery is **delivered**, clients get a
  rating + quote prompt; submissions stay **pending** until you approve them in a new
  **Testimonials** admin page, then appear in a public "What clients say" section. New
  `testimonials` table.
- **Per-gallery SEO**: custom `meta_title` / `meta_description` and a `noindex` toggle wired
  into the gallery's public metadata + robots (portfolio-facing).



### Added
- **Session security**: 48-hour idle timeout (on top of the 7-day absolute cap); active-sessions
  list now shows device + coarse location; per-session revoke and "log out everywhere" (existing).
- **Login visibility**: each admin sign-in is audit-logged with device + location; a login from a
  new device/location is flagged (`admin.login.new`).
- **Audit log**: filter by actor and time range, plus CSV export.
- **Location analytics**: optional, self-hosted IP→coarse-location via a local MaxMind-DB-format
  database at `$DATA_DIR/GeoLite2-City.mmdb`; no external calls at lookup time, no raw IPs stored —
  only coarse strings. Absent DB → "Unknown". Powers viewer **Top locations** and admin login location.
- `scripts/fetch-geoip.mjs` — fetches a free, no-key database (DB-IP City Lite, CC-BY) into place.
- **Insights** gains **peak viewing hours**, **top locations**, and **traffic sources** (referrers).

### Notes
- Location data appears once a database is present: run
  `DATA_DIR=/opt/sites/gallery/data node scripts/fetch-geoip.mjs` (re-run monthly to refresh), or
  drop your own MaxMind GeoLite2-City.mmdb there. Everything else works without it.
- IP geolocation by [DB-IP](https://db-ip.com) (CC-BY 4.0).

## [1.8.0] — 2026-07-18

### Added
- **Delivery lifecycle** (admin-only): per-gallery state `proofing → retouching → delivered`
  with a timeline of milestones (created, first view, first selection, state changes, notes).
  New `gallery_events` table + `galleries.delivery_state` column.
- **Engagement analytics**: per-gallery **Insights** tab — 30-day view trend, unique visitors,
  viewers→selectors conversion, and a per-photo views/downloads/likes table. Admin home gains
  totals tiles (views, unique visitors, downloads, selections).
- Owner **admin quick-link** on the public homepage (already present on gallery/portfolio pages).

## [1.7.1] — 2026-07-18

### Fixed
- Mobile client-gallery toolbar redesigned — primary action visible, the rest in a collapsible
  menu (replaces the cramped horizontal scroll).
- Public gallery routes now return a proper **HTTP 404** for missing galleries (removed the
  `loading.tsx` Suspense boundary that was flushing a 200 shell before `notFound()`).

## [1.7.0] — 2026-07-17

### Added
- **Responsive image pipeline**: new 1280px `md` derivative, `srcset`/`sizes` on grids, lightbox
  and hero; immutable long-cache for versioned image URLs; on-demand lazy generation + a backfill
  script for existing photos.
- Branded **404 / error / global-error** pages and loading skeletons.
- **Premium client experience**: branded locked-gallery gate (blur-placeholder cover), cookie→
  welcome overlay sequencing, admin gallery-list thumbnails, homepage hero empty-state.
- Polished admin **login** page.

## [1.6.0] — 2026-07-17

### Changed
- Admin **settings** reorganized into tabs (General · Security · Gallery defaults · Sharing).
- Gallery admin reorganized into tabs (Photos · Settings · Comments · Collaborators).

## [1.5.0] — 2026-07-16

### Added
- **Per-gallery collaborators** — invite/onboard via passkey, scoped upload/organize
  capabilities, owner-only management, audit actor tracking.

## [1.4.0] — 2026-07-16

### Added
- **Event self-service** — bib-number OCR search, batch face search, public event page
  (all-WASM ML, no native build).

## [1.3.0] — 2026-07-16

### Added
- **Delivery/download**: multi-resolution downloads, RAW original delivery, forensic watermark.
- Server-side admin sessions (revocable) and cookie-consent handling.

### Fixed
- Default download is lossless (surgical GPS-only strip) instead of a lossy re-encode.

## [1.2.x] — 2026-07-15

### Changed
- Project renamed to **Albm**.

### Added
- Selectable album-preview / cover-photo pickers, shift-click range selection, and a batch of
  quality-of-life admin improvements.

## [1.1.x] and earlier

- Initial self-hosted portfolio + client-proofing platform: password/PIN galleries, favorites,
  downloads, watermarks, sections, comments, EXIF (GPS excluded), event pages, PWA, passkey admin.

[1.10.2]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.10.2
[1.10.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.10.0
[1.9.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.9.0
[1.8.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.8.0
[1.7.1]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.7.1
[1.7.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.7.0
[1.6.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.6.0
[1.5.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.5.0
[1.4.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.4.0
[1.3.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.3.0
