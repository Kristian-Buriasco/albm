# Database backup

Albm backs up its SQLite database (`$DATA_DIR/gallery.db`) to the same S3-compatible bucket as the
derivatives, encrypted, once a night. Tools: `scripts/backup-db-to-r2.mjs` (backup),
`scripts/restore-db-from-r2.mjs` (list, restore, verify), `scripts/db-backup-lib.mjs` (shared code).

## What is backed up

- **The database only.** Photos (originals) and derivatives are not in this backup. They have their
  own copies in the bucket (see `docs/OBJECT-STORAGE.md`) and on disk.
- **Not included:** small config files such as `watermark.png`, and the launchd secrets (the
  `EnvironmentVariables` in the app's and the backup's plists). Keep copies of those separately,
  in a password manager or another safe place, or a restore will not bring them back.
- The database is copied with SQLite's online backup API, so the app can keep running. The copy is
  checked with `PRAGMA integrity_check` before anything is uploaded. A failed check stops the run.

## Format and encryption

1. Snapshot: `db.backup()` into a temp file (the live file is never copied directly).
2. `integrity_check` on the snapshot must return `ok`.
3. gzip (streaming).
4. Encrypt (streaming, chunked AES-256-GCM, no dependencies):

   | Part | Content |
   |---|---|
   | header | 8 bytes magic `ALBMBK01` + 8 random bytes (IV prefix) |
   | chunk *i* | `u32` big-endian ciphertext length (at most 1 MiB), ciphertext, 16-byte GCM tag |

   - Chunks hold up to 1 MiB of plaintext each. The IV of chunk *i* is the 8-byte IV prefix plus
     `u32` counter *i*.
   - The AAD of chunk *i* is the `u32` index *i* plus one byte `isLast` (1 for the final chunk). The
     final chunk is the one that ends at the end of the file. So a file cut at a chunk boundary, a
     reordered file, a file with extra bytes at the end, or any changed byte fails authentication.
     A file with no final chunk never decrypts.
5. Upload: one PUT up to 16 MiB, multipart above that (16 MiB parts, each retried 3 times, aborted on
   failure). Then a HEAD check that the size matches.
6. `<BACKUP_PREFIX>latest.json` is written last:
   `{ "key", "size", "sha256" (of the encrypted file), "createdAt", "dbBytes" }`. It holds no secrets.

Object key: `<BACKUP_PREFIX>YYYY/MM/gallery-<ISO timestamp, : and . replaced by ->.db.gz.enc`, for
example `db-backups/2026/10/gallery-2026-10-17T03-30-00-123Z.db.gz.enc`.

## The encryption key: read this

**If you lose `BACKUP_ENCRYPTION_KEY`, every backup in the bucket is unrecoverable.** There is no
recovery path and no key escrow. Keep one copy in a password manager. Do not store it in the bucket,
in the repository, or in a file the backup can reach. Using the same key for a long time is fine.
Changing it means new backups use the new key while old ones need the old key, so keep old keys too
until the old backups have expired.

Generate a key (64 hex characters = 32 bytes):

```sh
openssl rand -hex 32
```

## Configuration

Same variables as the app's object storage, plus the backup key:

| Variable | Required | Purpose |
|---|---|---|
| `DATA_DIR` | no (default `./data`) | The database is `$DATA_DIR/gallery.db` |
| `S3_ENDPOINT` | yes (not for `--dry-run`) | Account endpoint, e.g. `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | yes | Bucket name |
| `S3_REGION` | no (default `auto`) | `auto` for R2 |
| `S3_ACCESS_KEY_ID` | yes | Access key of an API token scoped to the bucket |
| `S3_SECRET_ACCESS_KEY` | yes | Secret of that token |
| `BACKUP_ENCRYPTION_KEY` | **yes, always** | 64 hex characters. The tools refuse to run without it. It is never logged. |
| `BACKUP_PREFIX` | no (default `db-backups/`) | Folder inside the bucket |

Run from the repo root. The variables must be in the environment: put `STORAGE`-style values (`S3_ENDPOINT`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_KEY`, `DATA_DIR`) in a file such as `~/albm-backup.env`
(mode 600) and pass it with `--env-file`. A dev `.env` usually does not have them. Example:

```sh
node --env-file=$HOME/albm-backup.env scripts/backup-db-to-r2.mjs --dry-run   # snapshot, check, encrypt; no upload, no network
node --env-file=$HOME/albm-backup.env scripts/backup-db-to-r2.mjs             # the real backup
```

`--dry-run` does not need the S3 variables. It prints the sizes and leaves nothing behind. Temp
files go to the OS temp directory and are always removed.

The backup opens the database read-only. The user that runs it must be able to read the database
directory and write `gallery.db-shm` / `gallery.db-wal` (WAL mode), so run it as the same user as the
app (`admin` on the mini).

## Bucket lifecycle: expire backups after 30 days

Add this rule. The file below holds **all four** rules. The update replaces the whole rule set, so
the three existing rules (`abort-incomplete-multipart`, `expire-staging-uploads`, `expire-trash`) must
stay in it. Save it as `lifecycle-db.json`:

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
  },
  {
    "id": "expire-db-backups",
    "enabled": true,
    "conditions": { "prefix": "db-backups/" },
    "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 2592000 } }
  }
]
```

Apply it (replace `<bucket>`):

```sh
cf r2 buckets lifecycle update <bucket> --rules @lifecycle-db.json --force
```

If `BACKUP_PREFIX` is changed, change the `prefix` of `expire-db-backups` to match. Note: if backups
stop for 30 days, `latest.json` expires with them, and `--verify` then fails with "no latest.json".
That is the alarm you want.

## Scheduling on the Mac mini (launchd)

The daily backup is a LaunchDaemon. Template and install steps:
`deploy/com.gallery.backup.plist.example`. It runs every day at 03:30 and logs to
`/var/log/gallery-backup.log`. Fill in every `YOUR_...` value, then:

```sh
sudo cp deploy/com.gallery.backup.plist.example /Library/LaunchDaemons/com.gallery.backup.plist
sudo chown root:wheel /Library/LaunchDaemons/com.gallery.backup.plist
sudo chmod 600 /Library/LaunchDaemons/com.gallery.backup.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.gallery.backup.plist
```

Optional weekly verify (Sunday 04:00): a second LaunchDaemon, `com.gallery.backup-verify`, with the
same `EnvironmentVariables` and `UserName`, that runs
`node /opt/sites/gallery/scripts/restore-db-from-r2.mjs --verify`. Its exit code is 0 only when the
latest backup downloads, decrypts, passes `integrity_check`, and matches its sha256. Give it a
`StartCalendarInterval` with `Weekday` 0, `Hour` 4, `Minute` 0, and its own log file. Install it the
same way.

Run one backup by hand before every deploy:

```sh
node --env-file=$HOME/albm-backup.env scripts/backup-db-to-r2.mjs
```

## Restore

List backups, newest first:

```sh
node --env-file=$HOME/albm-backup.env scripts/restore-db-from-r2.mjs --list
```

Restore the latest backup to a **new** file (the tool refuses to overwrite an existing file or the
live database):

```sh
node --env-file=$HOME/albm-backup.env scripts/restore-db-from-r2.mjs --latest --out /tmp/restored.db
# or a specific backup:
node --env-file=$HOME/albm-backup.env scripts/restore-db-from-r2.mjs --key db-backups/2026/10/gallery-<...>.db.gz.enc --out /tmp/restored.db
```

The tool downloads the file, checks its size (and its sha256 for `--latest`), decrypts it, gunzips it,
runs `PRAGMA integrity_check`, and prints the galleries and photos row counts. Check the numbers
against what you expect, then put the file in place. The tool refuses to write over
`$DATA_DIR/gallery.db`. It prints these steps instead:

1. Stop the app: `sudo launchctl bootout system/com.gallery`.
2. Move the current database aside, keeping it:
   `mv "$DATA_DIR/gallery.db" "$DATA_DIR/gallery.db.before-restore"`, and the same for `-wal` and `-shm`
   if they exist.
3. Copy the restored file into place: `cp /tmp/restored.db "$DATA_DIR/gallery.db"`.
4. Remove stale `-wal` and `-shm` files next to it (they belong to the old database):
   `rm -f "$DATA_DIR/gallery.db-wal" "$DATA_DIR/gallery.db-shm"`.
5. Start the app: `sudo launchctl bootstrap system /Library/LaunchDaemons/com.gallery.plist`.

A restore brings back the database only. The photos and derivatives come from their own storage
(see `docs/OBJECT-STORAGE.md`). Keep the `*.before-restore` files until you have checked the app.

Exit codes: 0 success, 1 failure (the message says why), 2 bad arguments.

## Quarterly restore drill

Do this four times a year, on the mini, and write down the date and result:

- [ ] `--list` shows a backup from the last 24 hours, with a plausible size.
- [ ] `--verify` exits 0 (`verify ok: ...` with the galleries and photos counts).
- [ ] `--latest --out /tmp/drill.db` works. Open it with `sqlite3 /tmp/drill.db 'PRAGMA integrity_check;'`
      (expect `ok`) and compare the counts with the live database.
- [ ] Decrypt with the key from the password manager, not from the plist, so the copy in the
      password manager is proven to work.
- [ ] The launchd jobs are loaded (`sudo launchctl print system/com.gallery.backup`) and the last exit
      code is 0.
- [ ] Delete `/tmp/drill.db` after the drill.
