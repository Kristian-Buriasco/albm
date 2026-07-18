# Changelog

All notable changes to Albm are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use
[Semantic Versioning](https://semver.org/).

## [1.9.0] — 2026-07-18

### Added
- **Session security**: 48-hour idle timeout (on top of the 7-day absolute cap); active-sessions
  list now shows device + coarse location; per-session revoke and "log out everywhere" (existing).
- **Login visibility**: each admin sign-in is audit-logged with device + location; a login from a
  new device/location is flagged (`admin.login.new`).
- **Audit log**: filter by actor and time range, plus CSV export.
- **Location analytics**: optional, self-hosted IP→coarse-location via a local MaxMind
  GeoLite2-City DB (`$DATA_DIR/GeoLite2-City.mmdb`); no external calls, no raw IPs stored — only
  coarse strings. Absent DB → "Unknown". Powers viewer **Top locations** and admin login location.
- **Insights** gains **peak viewing hours**, **top locations**, and **traffic sources** (referrers).

### Notes
- City/location data only appears once you place a GeoLite2-City DB at `$DATA_DIR/GeoLite2-City.mmdb`
  (free from MaxMind). Everything else works without it.

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

[1.9.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.9.0
[1.8.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.8.0
[1.7.1]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.7.1
[1.7.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.7.0
[1.6.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.6.0
[1.5.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.5.0
[1.4.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.4.0
[1.3.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.3.0
