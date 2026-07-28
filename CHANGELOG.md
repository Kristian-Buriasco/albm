# Changelog

All notable changes to Albm are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use
[Semantic Versioning](https://semver.org/).

## [1.16.0] — 2026-07-28

### Changed
- **Custom-styled dropdowns everywhere.** Every native `<select>` across the
  public site and admin panel (contact form, gallery settings, admin
  filters, language switcher, folder assignment, watermark position, etc.)
  now goes through a shared `Select` wrapper that strips the OS chevron and
  draws Albm's own, instead of the raw browser control.
- **API docs restyled to match Albm.** `/docs/api` (Scalar) now uses the
  site's own palette (paper/ink/muted/accent, light and dark) instead of
  Scalar's default blue theme.

## [1.15.1] — 2026-07-28

### Fixed
- **Admin gallery page mobile pass**: the per-photo action bar (Alt text, Cover,
  Delete) was `opacity-0` with only a `group-hover` reveal — completely
  unreachable on touch devices, not just hidden until hover. Now visible by
  default, hover-fade preserved on mouse. Bumped the photo select-toggle button
  to a real touch target. The gallery tab bar (Photos/Settings/Insights/
  Comments/Collaborators) had no overflow handling and would blow out the page
  width on a phone — now scrolls horizontally instead. Also caught two more
  <16px inputs left over from the previous mobile pass (client-gallery welcome
  modal, magic-link modal) that triggered iOS Safari's zoom-on-focus.

## [1.15.0] — 2026-07-28

### Fixed
- **Mobile usability pass** across public and admin surfaces:
  - Portfolio grid's like button was `hidden` below the `sm` breakpoint (real bug,
    not just hover-gated) — invisible on every touch device. Now always visible,
    dimmed until liked, with the desktop hover-fade preserved at `sm+`.
  - Lightbox toolbar icons (slideshow, select, download, close) and the multi-size
    download links had touch targets around 28px, well under the ~44px guideline —
    bumped padding on mobile, unchanged on desktop.
  - Admin panel header had ~9 nav links in one unwrapped row with no mobile
    fallback — would overflow on any phone width. Extracted into `AdminNav`, a
    collapsible hamburger menu below `sm`, unchanged inline nav at `sm+`.
  - Public site header (name + nav) had no mobile headroom — tightened gaps/padding
    responsively and let an overlong custom site name truncate instead of forcing
    nav off-screen.
  - Contact form fields and the client-gallery password gate used <16px font-size,
    which triggers iOS Safari's auto-zoom on focus — bumped both to 16px (`text-base`).

## [1.14.0] — 2026-07-27

### Added
- **Custom GA4 events**: `photo_like`, `photo_download`, `bib_search`, `gallery_view`,
  `selection_add`, `contact_submit`, `testimonial_submit`. New Settings → Analytics
  checkbox (off by default) — a deliberate second opt-in on top of GA being configured
  at all. Every event still respects Consent Mode v2 and the visitor's actual cookie
  choice (checked directly, not just left to GA's internal handling) — nothing fires
  pre-consent. Client-gallery events use the gallery's opaque ID as their identifier,
  never a title, slug, or linked Client name — portfolio galleries (already public) use
  the title.

## [1.13.0] — 2026-07-27

### Added
- **Custom gallery URLs.** Set a memorable slug (`/g/jane-wedding-2026` instead of
  `/g/RT2wThgTFXsshF`) — optionally at creation, or anytime after from a gallery's
  Settings tab. Renaming an already-shared URL redirects the old one to the new one
  (307 for client galleries, 308 for portfolio) rather than breaking it. New
  `gallery_slug_history` table backs the redirect.

## [1.12.1] — 2026-07-27

### Fixed
- **Google couldn't verify the analytics tag was installed.** The pasted GA snippet only
  rendered in `<head>` after a visitor accepted the cookie-consent banner — Google's
  install checker fetches the page cold, with no cookies, so it always saw zero script
  tags. Implemented Google Consent Mode v2: the tag now always loads (so it's
  detectable, and real visits register), but starts with `analytics_storage: denied`
  by default and only flips to `granted` once the visitor actually accepts analytics
  cookies — no change in what data is collected or when, just whether the tag's
  *presence* is visible to an unauthenticated crawler.

## [1.12.0] — 2026-07-26

### Added
- **Interactive API reference** at `/docs/api` (linked from the admin nav) — every route
  with a real standalone use case: all Admin API routes, the client-facing gallery API,
  and the Publish API. Built on a hand-written OpenAPI 3.1 spec
  (`docs/openapi.yaml`, also served at `/openapi.yaml` for Postman/Insomnia import) and
  a self-hosted (no CDN) Scalar UI with a working "try it" console — publish routes take
  a pasted bearer token, admin/client routes use whatever session cookie the browser
  already has, same as calling the API directly.

## [1.11.1] — 2026-07-26

### Fixed
- The app icon was a literal blank solid-color square (no mark at all). Added a real
  (if temporary) monogram favicon/app icon — `src/app/icon.png`, `src/app/apple-icon.png`
  (Next's auto favicon convention), and regenerated the PWA manifest icons
  (`public/icon-192.png`, `icon-512.png`) to match. Placeholder pending a proper
  logomark design.

## [1.11.0] — 2026-07-26

### Added
- **Clients**: a real cross-gallery Client record (name, email, phone, notes, tags) —
  the CRM entity that was completely missing before. New owner-only **Clients** admin
  page (search, tag filter, create/edit/delete), a "Client" picker on a gallery's
  Settings tab (optional, set after creation — one client can span many galleries over
  time), and a "Convert to client" button on each Inquiries row. Deleting a Client never
  deletes or orphans its galleries — they just become unlinked. New `clients` +
  `client_tags` tables, `galleries.client_id` column.

## [1.10.6] — 2026-07-26

### Added
- Audit logging for section create/rename/delete and bulk photo-move actions
  (`section.create`, `section.rename`, `section.delete`, `photos.move`). These previously
  left no trace at all — investigating a report of photos appearing in a different section
  than expected turned up the gap; deploys themselves never touch `data/` (verified: only
  `drizzle`, `node_modules`, `package.json`, `public`, `server.js`, `src`, `.next` are
  swapped), and no code path was found that reassigns sections automatically, but there
  was no way to check history if it does happen again. Now there is.

## [1.10.5] — 2026-07-26

### Added
- Clients can delete their own named selection lists (Lists chip bar → ×). Photos stay in
  the gallery; only the list and its selections are removed. Scoped to the visitor who
  created it — one client can't delete another's list. New `DELETE
  /api/g/[slug]/selections/lists/[listId]`.

## [1.10.4] — 2026-07-25

### Fixed
- Client's "Feature this gallery?" prompt (added in 1.10.3) never showed up. It was gated
  on `hasVisitor`, which only turns true *after* the page mounts and posts to the visitor
  API — so it was always `false` during the server render that decides whether to show
  the prompt. The consent endpoint doesn't need a visitor record anyway; the prompt now
  shows purely off `featuredConsent === 'requested'`.

## [1.10.3] — 2026-07-25

### Added
- **Client galleries can appear in Featured Work — with consent.** Turning on "Show in
  Featured Work" for a client gallery no longer publishes it immediately: the client sees
  an opt-in prompt on their own gallery page (agree/decline) before it shows on the
  homepage. New `featured_consent` column (`none|requested|granted|declined`).
- **Change a gallery's type** (Client ↔ Portfolio) from its Settings tab, with a
  confirmation explaining what that flips (password/PIN gating vs. public listing).
- Gallery creation dialog now explains what Client vs. Portfolio means, and notes the
  type can be changed later.

### Fixed
- Featured-work grid linked client-type galleries to `/portfolio/...` (404) instead of
  `/g/...`.
- Kiosk toggle (Settings → Live event wall) could show a stale on/off state after saving
  any *other* setting on the same page — it copied its initial value into local state
  once instead of staying controlled by the gallery's live `kioskEnabled`.

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

[1.16.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.16.0
[1.15.1]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.15.1
[1.15.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.15.0
[1.14.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.14.0
[1.13.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.13.0
[1.12.1]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.12.1
[1.12.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.12.0
[1.11.1]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.11.1
[1.11.0]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.11.0
[1.10.6]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.10.6
[1.10.5]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.10.5
[1.10.4]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.10.4
[1.10.3]: https://github.com/Kristian-Buriasco/albm/releases/tag/v1.10.3
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
