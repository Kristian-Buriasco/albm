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
| `413` | File over 50 MB (100 MB for RAW) |
| `415` | Not JPEG/PNG/RAW, or unreadable image |
| `429` | Rate limit (300 uploads / 15 min per token+IP) |

## curl example

```bash
curl -X POST "https://your-site.example/api/publish/GALLERY_ID/photos" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/photo.jpg"
```

## Lightroom

Use **File → Export** with a post-processing action or a plugin that POSTs to the URL above. Map the export filename to the `file` field. No official plugin is bundled — any tool that can HTTP POST multipart works.

## Capture One

Use **Publish Services** or a third-party publish script targeting the same endpoint and headers.

## Notes

- The gallery must already exist; tokens cannot create galleries.
- JPEG, PNG, and camera RAW (DNG/CR2/CR3/NEF/ARW/…) are accepted; RAW is decoded server-side (install `dcraw` on the host for full RAW support beyond embedded previews) and delivered to clients as JPEG. Filenames are sanitized and deduplicated by content hash.
- Token values are never logged server-side.
