# Object storage for derivatives

Optional. Albm can keep its generated image derivatives (`thumb`, `md`, `web`, all WebP) in an
S3-compatible bucket instead of only on local disk. Cloudflare R2 is the first target; B2, MinIO,
IONOS and AWS use the same settings.

## What it does and does not do

- **Does:** after a photo is processed, uploads its three derivatives to the bucket. Reads go
  through the app, which tries local disk first and falls back to the bucket.
- **Does not:** move originals by default. With `S3_ORIGINALS=1` they are also copied to the bucket
  (see Originals below). Local copies are kept either way.
- **Does not:** expose the bucket. It stays private; the app proxies every image, so the existing
  `/img` access checks still decide who sees what.
- **Off by default.** Without `STORAGE_BACKEND=s3` the app behaves as before.

Bucket key layout: `<S3_KEY_PREFIX><galleryId>/<variant>/<stem>.webp`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_BACKEND` | `local` | `s3` turns the bucket on. Anything else is local only. |
| `S3_ENDPOINT` | | Account endpoint, e.g. `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | | Bucket name |
| `S3_REGION` | `auto` | `auto` for R2; the real region for AWS/IONOS/B2 |
| `S3_ACCESS_KEY_ID` | | Access key of an API token scoped to the bucket |
| `S3_SECRET_ACCESS_KEY` | | Secret of that token |
| `S3_KEY_PREFIX` | empty | Optional folder inside the bucket, e.g. `albm/` |
| `S3_KEEP_LOCAL` | `1` | `0` deletes local derivatives after a successful upload |
| `S3_GALLERIES` | (all) | Comma-separated gallery ids. When set, only these galleries are uploaded to the bucket (derivatives and direct uploads); everything else stays local. Reads stay global, so anything already in the bucket is still served. |
| `S3_ORIGINALS` | `0` | `1` also copies every original into the bucket. Needs `STORAGE_BACKEND=s3`. See Originals. |

If `STORAGE_BACKEND=s3` but any of the endpoint, bucket or key variables is missing, the app logs
a warning once and uses local disk.

## Cloudflare R2 setup

1. In the Cloudflare dashboard, open **R2 Object Storage** and enable it (a payment method on the
   account is required even for the free tier).
2. **Create bucket** (e.g. `albm-derivatives`). Keep it private: no public access, no custom domain.
3. **Manage R2 API Tokens** > **Create API token**. Permission: **Object Read & Write**. Scope it to
   the single bucket. Copy the Access Key ID and Secret Access Key (shown once).
4. Your endpoint is `https://<account-id>.r2.cloudflarestorage.com`, with the account ID shown on
   the R2 overview page.
5. Set the variables in `.env`. On the Mac mini, which runs the app under launchd, put them in the
   `EnvironmentVariables` dict of the `com.gallery` plist, then reload the job
   (`launchctl bootout` and `launchctl bootstrap` again). A plain `kickstart` does not re-read
   the environment.

## Migration

The script is `scripts/migrate-derivatives.mjs`. It is idempotent and resumable: objects already
in the bucket with the same size are skipped, so it is safe to re-run after an interruption. It
handles one file at a time to stay within the 2 GB of RAM on the mini.

```sh
# 1. Dry run: lists what would move, no uploads. Add --gallery <id> to limit it to one gallery.
node --env-file=.env scripts/migrate-derivatives.mjs --to s3 --dry-run

# 2. Upload. Local files are kept.
node --env-file=.env scripts/migrate-derivatives.mjs --to s3

# 3. Switch the app: STORAGE_BACKEND=s3 in .env (or the launchd plist), then restart it.

# 4. Optional: free local disk. --prune deletes each local file only after its upload is
#    verified by HEAD size. Run it after step 3, not before.
node --env-file=.env scripts/migrate-derivatives.mjs --to s3 --prune
```

The script exits non-zero if any file failed. Re-run it to retry only the failures.

To pull everything back to local disk (for example before leaving the bucket):

```sh
node --env-file=.env scripts/migrate-derivatives.mjs --to local [--gallery <id>] [--dry-run]
```

Downloads go to a temp file that is then renamed, so a partial download never looks complete.

## Deleting and recovery

- Deleting a photo or a gallery does not delete its derivatives from the bucket. They are moved
  to `trash/<original key>` (a server-side copy, then a delete of the original) and kept there for
  30 days. A lifecycle rule then removes them.
- With `S3_ORIGINALS=1`, deleting a photo or gallery moves its originals to `trash/` the same way.
- The lifecycle rule must exist on the bucket. Save this as `lifecycle.json`:

  ```json
  [
    {
      "id": "abort-incomplete-multipart",
      "enabled": true,
      "conditions": { "prefix": "" },
      "abortMultipartUploadsTransition": { "condition": { "type": "Age", "maxAge": 86400 } }
    },
    {
      "id": "expire-staging-uploads",
      "enabled": true,
      "conditions": { "prefix": "incoming/" },
      "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 86400 } }
    },
    {
      "id": "expire-trash",
      "enabled": true,
      "conditions": { "prefix": "trash/" },
      "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 2592000 } }
    }
  ]
  ```

  Optional, not enabled by default: a fourth rule with `storageClassTransitions` to `InfrequentAccess` after
  60 days (about $0.005/GB cheaper to store, but it has no free tier and reads cost about $0.01/GB), which
  only pays off past roughly 200 GB stored.

  (The `incoming/` rule only matches while `S3_KEY_PREFIX` is empty; `trash/` always matches because
  the trash key is `trash/` plus the full original key.)

  Apply it with `cf r2 buckets lifecycle update <bucket> --rules @lifecycle.json --force`. The
  update replaces the whole rule set, so keep all three rules in the file.

- To restore a deleted gallery's derivatives (within the 30 days):

  ```sh
  node --env-file=.env scripts/migrate-derivatives.mjs --restore-trash <galleryId> --dry-run
  node --env-file=.env scripts/migrate-derivatives.mjs --restore-trash <galleryId>
  ```

  Each object is copied back to its original key and its trash copy is deleted only after the copy
  succeeds. Keys already in place are skipped. Re-running is safe. The script exits non-zero if any
  object failed.

> **Warning:** a restore only brings back the derivative images. The database rows and the
> originals are not recoverable from the bucket. They come from your database backups. A restored
> gallery without its rows will not show up in the app.

## Originals (stage 1: mirror and restore)

Originals can also be kept in the bucket. It is opt-in: set `S3_ORIGINALS=1` (default off). It
needs `STORAGE_BACKEND=s3`, and the gallery must be in `S3_GALLERIES` when that is set.

What it does:

- **Mirror:** after a new original is written to disk, a copy goes to
  `<S3_KEY_PREFIX><galleryId>/originals/<filename>` in the background. The upload does not wait
  for it, and a failed copy does not fail the upload.
- **Direct uploads:** the browser stages the file in the bucket, and the app copies it to the
  originals key inside the bucket. The mini's uplink is not used. If that copy fails, the app
  uploads from local disk instead.
- **Local copies are kept.** Nothing is pruned.
- **Restore on read:** if a local original is missing, the app fetches it back from the bucket.
- **Delete:** deleting a photo or gallery moves its originals to `trash/`, like the derivatives.
  The 30-day lifecycle rule removes them.

To migrate originals that already exist on disk:

```sh
# Dry run. Add --gallery <id> to limit it to one gallery.
node --env-file=.env scripts/migrate-derivatives.mjs --to s3 --originals --dry-run

# Upload. Local originals are kept. Objects already in the bucket at the same size are skipped.
node --env-file=.env scripts/migrate-derivatives.mjs --to s3 --originals

# Download originals that are missing locally (for example after a disk failure).
node --env-file=.env scripts/migrate-derivatives.mjs --restore-originals [--gallery <id>] [--dry-run]
```

Files up to 16 MiB go up in one request. Larger files use multipart upload in 16 MiB parts, and
each part is retried up to three times. Files are handled one at a time, and each upload is checked
by HEAD size. The script exits non-zero if any file failed. Restores stream to a temp file and
rename it, so a partial download never looks complete.

Cost: Cloudflare R2 Standard storage is about $0.015 per GB-month after the first 10 GB, and
downloads have no egress fee. Check the current price on Cloudflare's R2 pricing page before you
rely on this. Originals are much larger than derivatives: 10,000 photos of about 10 MB each is
roughly 100 GB, or about $1.35 a month. Per-request charges are small.

## Rollback

Set `STORAGE_BACKEND=local` and restart. The app serves from local disk again. Anything still
local keeps working; anything pruned locally must be fetched back first with `--to local`.
Local originals are kept, so they are unaffected.

Use `S3_KEEP_LOCAL=0` only when you are happy to depend on the bucket for every image.

## Caching

- Derivatives are sent with `Cache-Control: public, max-age=31536000, immutable`. URLs carry a
  `?v=` stamp, so a changed image gets a new URL.
- Private galleries are sent with `Cache-Control: private` and must never be cached at the edge.
- For public portfolio images, add a Cloudflare **Cache Rule** for `/img/*` set to *Eligible for
  cache* with the edge TTL taken from the origin. Add a bypass rule for requests that carry a
  session cookie, so logged-in or password-unlocked views are never cached at the edge.
- Check the result with `curl -sI` on a public image: a `cf-cache-status: HIT` on the second request
  means the edge is caching it.

## Not included yet

- Pruning local originals. Local copies are always kept.
- Presigned downloads straight from the bucket. Originals are still served through the app.
- Per-gallery backend choice (one backend for the whole install).
- Settings-page UI. Configuration is environment variables only.
