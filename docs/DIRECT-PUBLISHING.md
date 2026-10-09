# Direct publishing guide

Two ways to get photos into an Albm gallery without using the admin upload page:

| | **Lightroom Classic** | **Canon R5 Mark II (FTP)** |
|---|---|---|
| Best for | Edited selects, delivery sets, fixing a photo later | **Live** galleries while you are still shooting |
| When photos appear | When you press **Publish** | Seconds after each frame (once processed) |
| Edits and replacements | Yes — republishing replaces a photo, removing it deletes it | No — it only adds new files |
| Needs | Lightroom Classic + the Albm plugin | A laptop on the same network as the camera, running the FTP bridge |
| Uploads | Your edited JPEGs | The camera's own JPEGs |

You can use both on the same gallery: stream the day live from the camera, then publish the edited selects from Lightroom later. Identical files are recognised and never added twice.

---

## 0. One-time preparation in Albm (both routes)

1. **Create the gallery** (or pick one): admin → **New gallery**.
2. **Decide who can see it *before* you start uploading.** If it should be private, set the password or PIN in the gallery's **Settings** tab first.
3. **Optional — go live automatically.** In the gallery's settings turn on **Auto-publish on upload (live)**. The gallery then publishes itself when the first photo arrives (otherwise it stays a draft until you switch **Published** on). Do this only after step 2.
4. **Create an upload token** — admin → **Settings → Sharing → Upload tokens → create**. Name it after the person or device (e.g. "Kristian R5", "Ruben laptop") and **copy it straight away — it is shown only once.**
   - A token is a password for uploading. Give each photographer and each camera their own, so you can revoke one without affecting the others.
   - A token can add, replace and delete photos in **any** gallery, not just one. Treat it like a password.
5. **Note the gallery ID.** Open the gallery in the admin; the address looks like `…/admin/galleries/AbC123…` — the last part is the ID (needed for the camera route; Lightroom lists galleries by name).

**Limits to know:** JPEG or PNG, up to **50 MB per file**; roughly **1,500 uploads per 15 minutes per token** (bursts beyond that are retried automatically); the same content is never added twice.

---

## Part A — Lightroom Classic

Uses the plugin in [`integrations/lightroom/albm.lrplugin`](../integrations/lightroom/).

### A1. Install the plugin (once)

1. Copy the whole `albm.lrplugin` folder somewhere permanent. Keep the `.lrplugin` ending.
2. Lightroom Classic → **File → Plug-in Manager… → Add** → choose that folder.
3. It should appear as **Albm — installed and running**.

### A2. Connect it to your gallery (once per gallery)

1. **Library** module → left panel → **Publish Services → +** → *Go to Publishing Manager…* (or right-click **Albm → Edit Settings…**).
2. Choose **Albm** and fill in:
   - **Base URL** — `https://gallery.kristianburiasco.it`
   - **Upload token** — the token from step 0.4
3. Click **Test Connection & Load Galleries**. It should report how many galleries it found.
4. Pick the **destination gallery** from the dropdown.
5. Set your usual export options (size, sharpening, …). The plugin always exports **JPEG**.
6. **Save.**

> **One Publish Service = one gallery.** To publish to several galleries, add a second Albm Publish Service for each.

### A3. Publish

1. Drag photos onto the Albm service (or its collection).
2. Click **Publish**. A progress bar shows each upload.
3. Changed a published photo? It shows as *modified* — press **Publish** again and just that photo is replaced.
4. Removed a photo from the collection (or deleted the collection)? Publishing **deletes it from the Albm gallery**. There is no "unpublish but keep". If you only want to stop syncing a photo, leave it in the collection.

### A4. Good to know

- A photo that fails (bad token, too big, no network) is flagged and listed at the end; the rest of the batch still goes through.
- A "duplicate" message means Albm already has that exact file — it counts as success.
- Replacing a photo gives it a new internal ID. The plugin tracks that for you.

---

## Part B — Canon EOS R5 Mark II → Albm (live, over FTP)

The camera speaks FTP; Albm takes uploads over HTTPS. The small **FTP bridge** in [`tools/ftp-ingest`](../tools/ftp-ingest/) sits in between on a laptop:

```
R5 Mark II ──FTP──▶ laptop (ftp-ingest) ──HTTPS──▶ Albm gallery
```

Every frame is saved on the laptop first and then uploaded with automatic retries, so a dropped connection never loses a photo.

### B1. What you need on the day

- The camera and a laptop **on the same network**. The most reliable setup is your **phone's hotspot or a travel router** that you control. Venue Wi-Fi often blocks devices from seeing each other ("client isolation") and will not work.
- The laptop needs **Node.js 20 or newer**, and a copy of the Albm repository (or just the `tools/ftp-ingest` folder).
- Internet for the laptop (the hotspot's mobile data is enough — a JPEG is a few MB).
- **Do not** expose FTP to the internet. Keep it on the local network; FTP is not encrypted.

### B2. Set up the bridge (do this at home, before the shoot)

```bash
cd tools/ftp-ingest
cp config.example.json config.json
chmod 600 config.json        # it holds tokens and passwords
```

Edit `config.json`:

```json
{
  "albmUrl": "https://gallery.kristianburiasco.it",
  "listen": { "port": 2121, "pasvHost": null },
  "spoolDir": "./spool",
  "users": [
    {
      "name": "r5-kristian",
      "password": "a-long-random-password-for-the-camera",
      "galleryId": "THE-GALLERY-ID",
      "token": "THE-UPLOAD-TOKEN"
    }
  ]
}
```

- **`users`** — one entry per camera. The camera logs in with `name` + `password`; photos go to that user's `galleryId` using its `token`. For two cameras, add two entries (each with its own token, if you want).
- **`pasvHost`** — leave `null` to auto-detect the laptop's address on the network. Set it only if the camera cannot connect.
- **Port.** `2121` works without special rights. If your camera only accepts the standard FTP port **21**, set `"port": 21` and start the bridge with `sudo`.

Start it:

```bash
node ftp-ingest.mjs config.json
# on a laptop, keep it awake while it runs:
caffeinate -i node ftp-ingest.mjs config.json
```

You should see `listening on 0.0.0.0:2121 …`. Leave this window open all day.

### B3. Set up the camera

Menu names differ slightly between firmware versions — look for the **network / wireless communication** settings, then the **FTP transfer** connection. What to enter:

| Setting | Value |
|---|---|
| Connect to | the **same Wi-Fi network** as the laptop (your hotspot / travel router) |
| FTP server address | the laptop's IP on that network (the bridge prints it when it starts, or check the laptop's network settings) |
| Port | `2121` (or `21` if you changed it) |
| **Passive mode** | **On** |
| Login / user name | the `name` from `config.json` (e.g. `r5-kristian`) |
| Password | the `password` from `config.json` |
| Destination folder | leave empty or `/` (folders are ignored) |
| Secure connection (FTPS / SFTP) | **Off** — the bridge speaks plain FTP, so keep it on your own network |
| **Auto transfer after each shot** | **On** |
| Image type to send | **JPEG only**, if the camera offers a choice (RAW files are ignored by the bridge anyway) |

Then use the camera's *test connection* option. In the bridge window you should see `login r5-kristian from 192.168…`.

### B4. Choose a sensible JPEG size

The server processes each photo into thumbnails and web sizes, and **the Mac mini is not fast**. In a test it took about **10 seconds per 24-megapixel photo** (a demanding image), and the R5 Mark II's 45-megapixel files take longer. A busy day at full size builds a backlog — photos stay *processing* and are not visible to guests until done.

- Set the camera's **JPEG size to Medium or Small-1** (roughly 11–20 MP; check the exact figures in your camera's menu) for the live feed. Upload time and processing time drop a lot, and it is plenty for a gallery.
- Keep RAW (or Large JPEG) on the memory card as your master and deliver the finals later from Lightroom (Part A).

### B5. On the day

1. Start the hotspot/router, connect laptop and camera to it.
2. Run the bridge. Check the camera test connection.
3. Take a test frame. In the bridge window you will see:
   ```
   received   r5-kristian/IMG_0001.JPG
   uploaded   r5-kristian/IMG_0001.JPG
   ```
   Then open the gallery in the admin: the photo shows *processing*, then appears.
4. Shoot. A status line prints every minute (`received … · uploaded … · waiting …`). **`waiting` should stay near 0.** If it grows, the network or the server is the bottleneck.
5. At the end, let `waiting` reach 0 before closing the laptop. Press **Ctrl-C** to stop; anything not yet sent is kept and is sent next time you start the bridge.

### B6. Several photographers

- **Each person with their own camera and laptop** — each runs the bridge with their own user and token. Photo credits ("Photos: …") come from who uploaded through the Albm admin or a collaborator login; photos sent by the bridge or by Lightroom tokens are credited to the site owner.
- **Invite collaborators for the admin side** (organising, sections, tags, deleting): gallery → **Collaborators** tab → enter their email and a **display name** (used for photo credits) → **Invite**. Albm does not send an email: copy the invite link and send it to them yourself (valid 7 days). They open it and register a passkey on their phone or laptop.
- **One laptop for several cameras:** add one `users` entry per camera in the same `config.json`.

---

## Shoot-day checklist

**Days before**
- [ ] Gallery created; password/PIN set if private; *Auto-publish on upload (live)* on if you want it live from frame 1.
- [ ] Upload token created for each camera/photographer and saved somewhere safe.
- [ ] Bridge installed and tested at home with the camera (take 5 frames; see them appear).
- [ ] Camera: JPEG size Medium/S1, Passive mode on, auto-transfer on, FTP user/password saved.
- [ ] Hotspot/router tested; laptop and camera both join it.
- [ ] Collaborators invited and signed in at least once.
- [ ] Quit other heavy programs on the Mac mini (it is a small machine).

**At the venue**
- [ ] Connect camera and laptop to *your* network.
- [ ] Start the bridge, test the camera connection, shoot one test frame.
- [ ] Watch `waiting` in the bridge window.
- [ ] Check the live gallery on a phone (and the **Live event wall** link if you use it).

**After**
- [ ] Wait for `waiting 0`, then stop the bridge.
- [ ] **Revoke the upload tokens** you created (Settings → Sharing → Upload tokens) and delete `config.json` from borrowed laptops.
- [ ] Publish edited selects from Lightroom if you are delivering finals.

---

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Camera cannot connect to the FTP server | Camera and laptop are not on the same network (client isolation on venue Wi-Fi → use your own hotspot/router). Check the laptop's address, port, and that **Passive mode** is on. A firewall may be blocking the bridge — allow it, plus ports 50000–50100. |
| Camera connects but login fails | User name/password differ from `config.json`. The bridge logs `login failed from …`. After 10 bad tries from one address it pauses logins for a while. |
| `received` shows but never `uploaded` | The bridge logs a reason: `retry … (network error)` = no internet; `HTTP 401` = the token is wrong or revoked (**fix the token and restart** — the photos are kept); `HTTP 413/415` = file too large or not a JPEG/PNG (kept in `spool/<user>/failed/`). |
| The camera shows a transfer error on some frames | The bridge answers `426` for a frame that arrived incomplete (dropped connection) so the camera resends it. Occasional ones are normal. |
| Photos sit on *processing* in the gallery | The server is catching up (about 10 s per large photo). Use a smaller JPEG size, or wait. Guests only see photos once they are ready. |
| RAW files do not show up | By design: the bridge and the admin uploader take JPEG/PNG only. Deliver RAW outside Albm. |
| Lightroom: "Test Connection" fails | Wrong Base URL (no `/admin`, https), wrong token, or no internet. |
| Lightroom: photo shows an error after publishing | The message is listed at the end of the batch: usually token revoked, file over 50 MB, or rate limit — publish again. |
| Same photo uploaded twice | It will not be duplicated: Albm compares file contents. |
| The gallery shows the wrong name as the photographer | Credits come from who uploaded each photo and the collaborator's display name (Collaborators tab). Uploads from the bridge and from Lightroom tokens are credited to the site owner. |

---

## Security notes

- Upload tokens and the FTP password are secrets. Keep `config.json` private (`chmod 600`), never commit it, and revoke tokens after the event.
- FTP is unencrypted: use it only on a network you control (your hotspot or router), never across the public internet, and never port-forward it.
- Anyone with a token can add, replace and delete photos in any gallery — give tokens only to people you trust, one per person or device.
