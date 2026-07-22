# Albm Lightroom Classic Publish Plugin

A Lightroom Classic **Publish Service** plugin that publishes photos from a
Lightroom collection directly into an [Albm](https://gallery.example.com)
gallery, with full add / modify / delete sync — publish once, then keep
Lightroom and Albm in sync just like Flickr/SmugMug publish services work.

The plugin lives at [`albm.lrplugin/`](./albm.lrplugin/).

## Install

1. Copy the whole `albm.lrplugin` folder anywhere on disk (keep the
   `.lrplugin` extension on the folder — Lightroom uses it to recognize the
   folder as a plugin bundle).
2. In Lightroom Classic: **File → Plug-in Manager… → Add** (bottom-left
   button), then select the copied `albm.lrplugin` folder.
3. Confirm it shows as **Albm**, status "installed and running", in the
   Plug-in Manager list.

## Create an upload token in Albm

1. In your Albm admin, go to **Settings → Sharing**.
2. Create a new upload token and copy it — this is the credential the
   plugin authenticates with (`Authorization: Bearer <token>` on every
   request). Treat it like a password.

## Set up the Publish Service

1. In Lightroom's **Library** module, left panel, click the **+** next to
   *Publish Services* → **Go to Publishing Manager…**, or if Albm already
   appears, right-click it → **Edit Settings…**.
2. Under **Publish Service**, choose **Albm** from the dropdown if
   prompted.
3. Fill in:
   - **Base URL** — your Albm instance's URL, e.g.
     `https://gallery.example.com` (no trailing slash needed).
   - **Upload token** — the token created above.
4. Click **Test Connection & Load Galleries**. On success it reports how
   many galleries were found and populates the **Gallery** dropdown.
5. Pick the destination gallery from the dropdown.
6. Adjust the standard Lightroom export settings (image sizing, sharpening,
   watermark, etc.) as desired — the plugin forces the output format to
   JPEG regardless of what's selected, since that's what Albm's upload
   endpoints expect.
7. Click **Save**.

## Publish photos

1. Drag photos from any collection onto the new **Albm** publish service
   (or its default published collection) in the left panel, same as any
   other publish service.
2. Click **Publish** (top of the published collection). The plugin uploads
   each new photo and shows progress in the standard Lightroom progress
   bar.
3. Edit a photo already published and revisit the collection — Lightroom
   marks it "modified"; hitting **Publish** again re-uploads just that
   photo as a *replace*, not a duplicate new upload.
4. Remove a photo from the published collection (or delete the collection)
   and publish — the plugin deletes the corresponding photo from the Albm
   gallery.

## Known behavior / gotchas

- **Replacing a photo changes its remote id.** Albm's replace endpoint
  (`PUT /api/publish/{galleryId}/photos/{photoId}`) always returns a *new*
  photo id for the replacement content. The plugin handles this
  automatically — it re-records the new id against the Lightroom rendition
  — but it's worth knowing if you're ever cross-referencing ids manually
  (e.g. in Albm's admin logs or database).
- **Deleting from the collection deletes on the server.** Removing a photo
  from the Albm published collection in Lightroom (or deleting the
  collection outright) issues a real `DELETE` against your Albm gallery.
  There's no "unpublish but keep the file" option — if you just want to
  stop syncing a photo without deleting it from Albm, don't remove it from
  the published collection.
- **Duplicate content is treated as success, not an error.** If Albm
  detects the exported JPEG bytes are identical to a photo already in the
  gallery, both the upload and replace endpoints can return
  `{"duplicate":true}` instead of a fresh id. The plugin treats this as a
  successful publish. On a *replace*, the previously-recorded remote id is
  kept as-is (nothing new to record). This is a normal outcome of Albm's
  content-hash dedup and not a bug.
- **A vanished remote photo triggers a fresh upload.** If a replace target
  no longer exists on the server (e.g. someone deleted it directly in the
  Albm admin), the plugin automatically falls back to a plain upload so
  the photo ends up published either way.
- **One Publish Service = one Albm gallery.** The gallery is chosen once
  in the settings dialog. To publish to multiple Albm galleries from
  Lightroom, set up multiple Albm Publish Service instances (Publishing
  Manager → duplicate/add another), each pointed at a different gallery.
- **Failures don't abort the whole batch.** If one photo fails to upload
  (bad token, oversized file, rate limit, etc.), the rest of the batch
  still publishes; the failed photo is flagged in the Publish panel with
  an error, and a summary dialog lists every failure after the batch
  finishes.
