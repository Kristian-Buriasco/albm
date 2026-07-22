# External publish API

Push photos from Lightroom, Capture One, or any HTTP client into an existing gallery.

## Authentication

Create an **upload token** in Admin → Settings → Upload tokens. The raw token is shown once — store it securely.

Send it on every request:

```
Authorization: Bearer <your-token>
```

Tokens only allow photo uploads. They do **not** grant admin access.

## Upload a photo

```
POST /api/publish/{galleryId}/photos
Content-Type: multipart/form-data
Authorization: Bearer <token>

file=<image file>
```

Optional form field:

- `sectionId` — assign the photo to an existing gallery section

### Responses

| Status | Meaning |
|--------|---------|
| `201` | Photo accepted; processing started (`status: processing` → `ready`) |
| `200` | Duplicate content hash; body includes `duplicate: true` and `existingFilename` |
| `401` | Missing, invalid, or revoked token |
| `404` | Gallery not found |
| `413` | File over 50 MB |
| `415` | Not JPEG/PNG or unreadable image |
| `429` | Rate limit (300 uploads / 15 min per token+IP) |

## curl example

```bash
curl -X POST "https://your-site.example/api/publish/GALLERY_ID/photos" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/photo.jpg"
```

## List galleries

```
GET /api/publish/galleries
Authorization: Bearer <token>
```

Returns the galleries a token may publish to (tokens are global, not gallery-scoped):

```json
{ "galleries": [ { "id": "...", "title": "...", "slug": "...", "type": "portfolio" } ] }
```

## Replace a photo (edited re-publish)

```
PUT /api/publish/{galleryId}/photos/{photoId}
Content-Type: multipart/form-data
Authorization: Bearer <token>

file=<image file>
```

Replaces the photo's content in place. **Returns a new `photoId`** (`200`) — update your
stored reference to it. `404` if the photo no longer exists (upload it fresh instead).
Audit-logged as `publish.replace`.

## Delete a photo

```
DELETE /api/publish/{galleryId}/photos/{photoId}
Authorization: Bearer <token>
```

`200 { "ok": true }`. `404` if already gone. Audit-logged as `publish.delete`.

> **Security note:** an upload token can now upload, replace, **and delete** photos in
> any gallery. Treat tokens like passwords; revoke a leaked one in Settings → Sharing.

## Lightroom

A **Publish Service plugin** is bundled under [`integrations/lightroom/`](../integrations/lightroom/) —
install it via Lightroom's Plugin Manager, paste your base URL + upload token, pick a
gallery, and Publish. It maps a Lightroom collection to an Albm gallery with full
add / modify / delete sync using the endpoints above.

Alternatively, use **File → Export** with any post-process action or script that POSTs
to `/api/publish/{galleryId}/photos` — any tool that can HTTP POST multipart works.

## Capture One

Use **Publish Services** or a third-party publish script targeting the same endpoint and headers.

## Notes

- The gallery must already exist; tokens cannot create galleries.
- JPEG and PNG only; filenames are sanitized and deduplicated by content hash.
- Token values are never logged server-side.
