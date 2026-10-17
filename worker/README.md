# Albm analysis worker

Runs slow analysis for an Albm gallery off the server: bib/jersey numbers (`bibs`) and alt text (`alt`).
Zero npm dependencies, Node >= 18.

    node worker/albm-worker.mjs --url https://gallery.example --token <worker token> --tasks bibs,alt

Environment fallbacks: `ALBM_URL`, `ALBM_WORKER_TOKEN`. Options: `--gallery <id>`, `--limit <1..50>` (default 10),
`--loop` (poll every 30 s when idle), `--redo` (re-offer finished and exhausted photos), `--dry-run`, `--allow-cloud`.

## Create a token

Albm -> Settings -> Sharing -> Worker tokens -> create one. The token is shown once. Worker tokens can only read
photos and post analysis results; they cannot upload, replace or delete photos.

## Engines

- **bibs**: Apple Vision, macOS only. Build the helper once:

      bash worker/build-vision.sh

  This writes `worker/bin/vision-bibs`. Three tiled OCR passes with 30% overlap. The first call after boot takes
  about 60 s (model compile); later calls take about 3-5 s per photo.
- **alt, Ollama (default)**: install Ollama and pull the model once:

      ollama pull qwen2.5vl:3b

  Env: `OLLAMA_HOST` (default `http://127.0.0.1:11434`), `ALT_MODEL` (default `qwen2.5vl:3b`).
- **alt, Anthropic (optional)**: `ALT_ENGINE=anthropic ANTHROPIC_API_KEY=... node worker/albm-worker.mjs ... --allow-cloud`.
  **Privacy:** this sends every photo to a third party (Anthropic). It refuses to run without `--allow-cloud` or
  `ALT_ALLOW_CLOUD=1`. Model: `ALT_ANTHROPIC_MODEL` (default `claude-haiku-5-5`).

Alt text language: `ALT_LANG` (default English).

## Running in the background

- Keep the Mac awake and run the loop: `caffeinate -i node worker/albm-worker.mjs --url ... --token ... --loop`
- Or a launchd agent that runs the same command with `KeepAlive` and the URL/token in its environment.

## Behaviour

- Each photo is downloaded to a temp file, analysed, then deleted. A failing photo posts an `error` item (max 200 chars)
  and the run continues. Results are posted in batches of up to 20.
- Exit codes: `0` success, `1` the server rejected the token (401) or a fatal engine problem (for example the Ollama
  model is missing, so the photo is not marked as failed), `2` bad arguments.
- `--dry-run` looks at one batch and posts nothing. It does not lease anything on the server, so a real run right after still sees the same photos.

## Tests

    node --test tests/unit/worker.test.mjs

The tests use a mock Albm server and fake engines (`WORKER_FAKE_ENGINES=1`), so they run on any OS.
