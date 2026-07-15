# Screenshots

Put these PNGs here, then uncomment the image table in the top-level `README.md`:

| File | What to capture |
|---|---|
| `portfolio.png` | Public homepage / portfolio (`/`) |
| `client-gallery.png` | A client gallery grid or lightbox with the proofing controls |
| `admin.png` | Admin dashboard (`/admin`) — stats + galleries |
| `security.png` | Admin → Settings → Security (passkeys + recovery codes) |

## Capturing a consistent set

Run the app locally with a little demo content:

```bash
npm ci && npm run build
SESSION_SECRET=$(openssl rand -hex 32) \
ADMIN_PASSWORD_HASH="$(node scripts/hash-password.mjs demo1234)" \
DATA_DIR=./demo-data node .next/standalone/server.js
```

Create a portfolio gallery and a client gallery, upload a few photos, then
screenshot at ~1440px wide (browser zoom 100%, light theme) for a uniform look.
PNG, roughly 1600×1000 or the full page.
