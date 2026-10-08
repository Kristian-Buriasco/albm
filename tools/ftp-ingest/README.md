# albm ftp-ingest

Send photos from a camera (Canon R5 Mk II, or anything with an FTP-transfer
mode) straight into an Albm gallery **while you shoot**.

```
camera --FTP--> ftp-ingest (laptop/mini) --HTTPS /api/publish--> Albm gallery
```

Zero dependencies, Node 20+. Each frame is spooled to disk first, then uploaded
with retries, so a flaky venue connection or an Albm restart never loses a photo.

## 1. Set up Albm

1. Create (or pick) the gallery. Copy its **ID** from the admin URL
   (`/admin/galleries/<ID>`).
2. Settings → Sharing → **Upload tokens** → create one token **per camera/photographer**
   and copy it (shown once).
3. Optional: turn on the gallery's *auto-publish on upload* so it goes live with the first frame.

## 2. Configure

```bash
cp config.example.json config.json
chmod 600 config.json          # it contains tokens and FTP passwords
```

| Field | Meaning |
|---|---|
| `albmUrl` | `https://gallery.kristianburiasco.it` (laptop on site) or `http://127.0.0.1:3200` (running on the mini itself) |
| `listen.port` | FTP port the camera connects to (default `2121`; ports below 1024 need root) |
| `listen.pasvHost` | The IP the **camera** should reach this machine on. Leave `null` to auto-detect the LAN IP |
| `listen.pasvMin/Max` | Passive data ports (default 50000–50100) — allow these on any firewall |
| `users[]` | One entry per camera: FTP `name` + `password`, the target `galleryId`, and its Albm upload `token` |
| `extensions` | Accepted types (default JPEG/PNG). Other files (e.g. `.CR3`) are accepted by FTP but ignored, so the camera never errors |
| `concurrency` | Parallel uploads to Albm (default 2) |
| `keepUploaded` | Keep a copy of uploaded files in `spool/<user>/uploaded/` (default off) |

## 3. Run

```bash
node ftp-ingest.mjs config.json
# laptop: keep it awake and the lid open
caffeinate -i node ftp-ingest.mjs config.json
```

You'll see one line per frame (`received` → `uploaded`) and a status line every minute.
`Ctrl-C` is safe: anything not yet sent stays in the spool and is re-sent on the next start.

## 4. Camera

In the camera's network menu create an **FTP transfer** connection (menu names vary
by firmware):

- Server/host: the machine's IP (`pasvHost`), port `2121`
- **Passive mode: on**
- User / password: the `users[]` entry for this camera
- Destination folder: leave blank or `/` (folders are ignored)
- Turn on **auto-transfer after each shot** (JPEG only is simplest — RAW files are ignored)

The camera must be on the **same network** as the machine running ftp-ingest.

## Network layouts

- **Recommended — laptop on site.** Camera and laptop join the same hotspot/travel
  router/venue Wi-Fi; ftp-ingest on the laptop uploads over HTTPS to your public
  gallery. Plain-text FTP never leaves the room, and tokens only travel over TLS.
- **Ingest on the mini.** Only if the camera can reach the mini over a trusted network
  (home LAN or a VPN). **Do not port-forward FTP to the internet** — it is unencrypted.
- Venue Wi-Fi often has *client isolation* (devices can't see each other) — use your own
  hotspot or travel router, or an Ethernet adapter on the camera.

## Behaviour worth knowing

- A dropped connection mid-file is detected (JPEG must end with its EOI marker, PNG with
  IEND): the partial file is discarded and the camera is told `426` so it resends.
- Duplicates (same content) are recognised by Albm and counted, not re-added.
- `401` from Albm (revoked/wrong token) pauses that camera and keeps its files; fix the
  token and restart. `413/415/404` go to `spool/<user>/failed/<id>/REASON.txt`.
- Albm allows ~1500 uploads / 15 min per token; bursts beyond that are retried automatically.
- Each camera = its own FTP user + token, so you can revoke one without touching the others.

## Tests

```bash
npm run test:ftp-ingest      # from the repo root
```
