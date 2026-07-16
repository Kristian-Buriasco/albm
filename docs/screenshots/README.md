# Screenshots

PNG captures for the top-level `README.md` (≈1440×900 viewport, light theme):

| File | What to capture |
|---|---|
| `portfolio.png` | Public homepage (`/`) |
| `client-gallery.png` | Client proofing grid (`/g/[slug]`) |
| `client-lightbox.png` | Lightbox with favorites / slideshow controls |
| `contact.png` | Contact page with Instagram / WhatsApp |
| `admin.png` | Admin dashboard (`/admin`) — stats + galleries |
| `admin-gallery.png` | Gallery detail — sections, tags, bulk select |
| `security.png` | Settings → Security (passkeys + recovery) |
| `audit.png` | Audit log (`/admin/audit`) |
| `event-page.png` | Public event page (`/g/[slug]/event`) |

## Capturing a consistent set

```bash
# Kill anything on :3200 first
lsof -ti:3200 | xargs kill -9 2>/dev/null

npm ci && npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true

rm -rf demo-data && mkdir demo-data
HASH=$(node scripts/hash-password.mjs demo123)
SESSION_SECRET=$(openssl rand -hex 32) \
ADMIN_PASSWORD_HASH="$HASH" \
DATA_DIR=./demo-data \
BASE_URL=http://localhost:3200 \
PORT=3200 \
node .next/standalone/server.js &

# Wait for healthy, then seed + capture
curl -sf http://localhost:3200/api/health
DEMO_PASSWORD=demo123 node scripts/seed-demo.mjs
DEMO_PASSWORD=demo123 node scripts/capture-screenshots.mjs
```

Seed images are sharp-generated named gradient JPEGs (not demo1/2/3). Do not commit `demo-data/`, `.env`, or `.next/`.
