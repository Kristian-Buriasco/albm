# Object storage for derivatives

Optional. Albm can keep its generated image derivatives (`thumb`, `md`, `web`, all WebP) in an
S3-compatible bucket instead of only on local disk. Cloudflare R2 is the first target; B2, MinIO,
IONOS and AWS use the same settings.

## What it does and does not do

- **Does:** after a photo is processed, uploads its three derivatives to the bucket. Reads go
  through the app, which tries local disk first and falls back to the bucket.
- **Does not:** move originals. Originals stay on local disk and are never uploaded.
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

## Rollback

Set `STORAGE_BACKEND=local` and restart. The app serves from local disk again. Anything still
local keeps working; anything pruned locally must be fetched back first with `--to local`.
Originals were never moved, so they are unaffected.

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

- Direct browser uploads of originals (uploads still go through the app's disk).
- Per-gallery backend choice (one backend for the whole install).
- Settings-page UI. Configuration is environment variables only.
