# Analysis worker

The analysis worker runs slow, AI-heavy photo work on a faster computer than the server. Albm finds the photos that
need work, the worker downloads the 2048px copy, runs an engine locally and posts the results back. The server stays
web-only.

## What it is and why

Albm usually runs on a 2-core Mac mini. OCR and vision models are slow there, and the built-in tesseract OCR is weak on
sports photos (it reports junk digits on almost every photo). The worker moves that work to a faster machine (an
M-series Mac first, a VPS later) and uses better engines.

Version 1 does two things:

- **Bib and jersey numbers** with Apple Vision, run over overlapping zoomed tiles of the photo. They are stored as bib
  numbers, so the existing bib search finds them.
- **Alt text** with a local Ollama model or the Claude API. It is stored as the photo's alt text.

Both are also embedded in JPEG downloads: bib numbers and tags as `dc:subject` keywords, alt text as `dc:description`,
so Lightroom, Photo Mechanic and Finder can search them. Face embeddings are not part of version 1.

## Privacy rules

- Faces stay on machines you own. Photos go to a third party only if you turn that on.
- Ollama runs entirely on your machine.
- The Claude API alt-text engine (`ALT_ENGINE=anthropic`) sends each photo to Anthropic. It is off by default and needs
  `ANTHROPIC_API_KEY` plus an explicit `--allow-cloud` (or `ALT_ALLOW_CLOUD=1`). Use it for public portfolio galleries, not client galleries.
- A worker token can read the 2048px copy of a photo and write analysis results. It cannot upload, replace or delete
  photos, and it cannot reach the admin area.

## Setup

1. **Create a worker token**: Settings, Sharing, "Worker tokens". Copy it; it is shown once.
2. **Get the `worker/` folder** onto the worker machine. It has no npm dependencies; Node 18 or newer.
3. **macOS only, for bibs:** `bash worker/build-vision.sh` (writes `worker/bin/vision-bibs`).
4. **For alt text with the default engine:** `ollama pull qwen2.5vl:3b` (override with `ALT_MODEL`; set `OLLAMA_HOST`
   if Ollama is not on `http://127.0.0.1:11434`).
5. **First run:**
   ```sh
   node worker/albm-worker.mjs --url https://gallery.example.com --token <worker token> --tasks bibs,alt
   ```
   The first Vision call after a boot takes about 60 seconds (the model compiles once); later photos take about 4
   seconds each on an M1 Pro. Add `--loop` to keep running: it sleeps 30 seconds when there is no work.

Flags: `--gallery <id>`, `--limit <n>` (default 10), `--redo`, `--dry-run`, `--allow-cloud`. `ALBM_URL` and
`ALBM_WORKER_TOKEN` replace `--url` and `--token`.

## How results behave

- Alt text written by a human is never overwritten. Clearing the field makes the photo eligible again.
- Bib results replace the built-in OCR numbers for that photo.
- Results are versioned per engine. A photo is offered again only when the engine version goes up, or with `--redo`.
- A failing photo is retried up to three attempts, then left alone unless you pass `--redo`.
- Set `BUILTIN_BIB_OCR=0` on the server to switch the built-in tesseract OCR off, so the worker is the only source of
  bib numbers. Do this before relying on the worker for bib search; the built-in OCR creates false numbers.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `BUILTIN_BIB_OCR=0` | on | Server. Disables the built-in tesseract bib OCR. |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Worker. Where Ollama runs. |
| `ALT_MODEL` | `qwen2.5vl:3b` | Worker. Ollama model used for alt text. |
| `ALT_ENGINE` | `ollama` | Worker. `ollama` (local) or `anthropic` (Claude API). |
| `ANTHROPIC_API_KEY`, `ALT_ANTHROPIC_MODEL`, `--allow-cloud` / `ALT_ALLOW_CLOUD=1` | unset | Worker. Needed for `ALT_ENGINE=anthropic`; photos leave your machine. |
| `ALT_LANG` | English | Worker. Language of the alt text. |

## Honest limits

- In crowded team shots only part of the visible numbers are found (about half in the test photo). The engine is tuned
  to miss a number rather than invent one, so false numbers are rare.
- Large race bibs work much better than small jersey numbers on distant players.
- Alt text is one sentence about the scene and action. It does not name people and can miss details.
- Bib OCR runs on macOS only. Alt text runs anywhere Node runs.

## Troubleshooting

- **401:** wrong or revoked token. Create a new one.
- **`vision-bibs` not found:** run `bash worker/build-vision.sh` (the worker exits at startup if it is missing).
- **Run stops with a model or authentication error:** missing Ollama model (`ollama pull <model>`) or a bad API key stop the
  whole run on purpose, so photos do not burn their three attempts.
- **Alt text empty or a connection error:** check `ollama serve` and `ollama list`, and `OLLAMA_HOST`.
- **Nothing offered:** photos must be processed (`ready`), and bib search must be on for the gallery. Use `--dry-run` to
  see what would happen and `--redo` to re-run photos that are already done.
- **Server slow:** run the worker on another machine; on the mini it would share the two cores with the web app.

## API summary

All `/api/worker/*` endpoints need `Authorization: Bearer <worker token>`.

| Method and path | Purpose |
|---|---|
| `GET /api/worker/jobs?task=alt\|bibs&limit=10&gallery=&minVersion=1&redo=0` | Lease up to 50 photos that need a task. Leases last 15 minutes. |
| `GET /api/worker/image/[photoId]?variant=web\|md` | Stream the derivative (WebP). |
| `POST /api/worker/results` | `{ task, engine, version, results: [...] }`, up to 50 items. |
| `GET /api/worker/status?gallery=` | Done, pending, leased and error counts per task. |

Admin (owner session): `GET`, `POST {name}` and `DELETE ?id=` on `/api/admin/worker-tokens`.
