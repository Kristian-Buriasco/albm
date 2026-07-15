# Screenshots

PNG captures for the top-level `README.md`:

| File | What to capture |
|---|---|
| `portfolio.png` | Albm public homepage (`/`) |
| `client-gallery.png` | A client gallery grid or lightbox with proofing controls |
| `admin.png` | Admin dashboard (`/admin`) — stats + galleries |
| `security.png` | Admin → Settings → Security (passkeys + recovery codes) |

## Capturing a consistent set

Run the app locally with demo content, then screenshot at ~1440px wide (browser zoom 100%, light theme):

```bash
npm ci && npm run build
cp -r .next/static .next/standalone/.next/static
HASH=$(node scripts/hash-password.mjs demo1234)
SESSION_SECRET=$(openssl rand -hex 32) \
ADMIN_PASSWORD_HASH="$HASH" \
DATA_DIR=./demo-data node .next/standalone/server.js
```

Create a portfolio gallery and a client gallery, upload a few photos, then capture PNGs (~1600×1000 or full page). Set `localStorage.theme = 'light'` for a consistent light theme.
