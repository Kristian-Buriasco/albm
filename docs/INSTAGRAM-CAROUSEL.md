# Instagram carousel

Gallery admin > **Instagram** tab. Picks up to 10 photos and exports them as 1080×1350 JPEGs (Instagram's 4:5) in a zip, with a draft caption when AI ranking is used. Post from your phone; there is no direct posting (Meta's API needs app review and a business account).

## How it picks

1. Local pass, no network: blown-out or crushed frames (over 35% pure white/black, or an average brightness far from mid-grey) are dropped, near-duplicates (bursts) collapse to the sharpest frame; the rest is thinned to at most 40 candidates, evenly spread over the shoot, sharpest per slice.
2. Without AI, the picks are the sharpest frame per even slice of the shoot.
3. With AI (opt-in per click): small previews (768 px) of the candidates go to Anthropic in one request; the model returns the order and a caption. Model: `CAROUSEL_MODEL` (default `claude-sonnet-5-5`). Roughly 40 images per run, a few cents.

Set `ANTHROPIC_API_KEY` in the server environment to enable AI. **Privacy:** the photos leave your server; the checkbox is off by default and every AI run is written to the audit log. Do not use it on client galleries without their consent.

## Export

`crop` fills the frame (focus follows the main subject); `pad` keeps the whole photo on a blurred copy of itself. Slides are rendered from the web derivative, so they are as sharp as the gallery's largest size.

## Options

- **Photos:** 2 to 10.
- **Choose:** *spread* (best per slice of the shoot), *top rated* (best overall, skipping lookalikes) or *one per section* (best of each section, topped up with the best of the rest). Results are always in shoot order.
- **Ranking:** *local* (private, instant) or *Claude* (see above; section labels are passed along for one-per-section).

## Local AI scoring (optional)

A vision model on your own machine rates each photo once (1-10); scores are saved on the photo and the picker uses them with sharpness as the tie-break. It runs through the analysis worker, which pulls jobs from the server, so the Mac needs no inbound access:

    ollama pull qwen2.5vl:7b
    node worker/albm-worker.mjs --url https://gallery.example --token <worker token> --tasks score --gallery <gallery id>

About 13 s per photo on Apple silicon with the 7b model, so about 14 minutes for 63 photos; the admin tab shows scored/left. Measured on one real shoot: a small model rates most usable photos alike and mainly flags bad exposure, so it moves the picks only a little. A bigger `SCORE_MODEL` ranks better. `score` is not part of the default `--tasks`.
