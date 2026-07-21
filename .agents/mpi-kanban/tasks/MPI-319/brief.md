# MPI-319 — Gallery jank on 100+ image/video entries

## Symptom
Gallery workspace stutters/freezes when scrolling a project with 100+ entries,
worse with 4K images/videos.

## Root cause (confirmed)
Gallery IMAGE cards rendered the **full-resolution original** (`selected.filePath`)
directly into `<img>`. Only VIDEOS had a thumbnail (256px JPG via `ffmpegThumb`).
So scrolling 100+ 4K PNGs forced the browser to decode ~100 full-res buffers
(a 4096x4096 RGBA decode is ~64MB each) — the source of the scroll jank.
Image `<img>` src was also set eagerly on render (no lazy gate like videos have).

## Fix
Generate a 512px JPG gallery thumb for images too, mirroring the video path.
Gallery renders the thumb; full-res only opens in the viewer (reads `filePath`).
512px chosen: sharp at the biggest gallery card (2 items/row), ~50x cheaper to
decode than a raw 4K PNG.

Backfill route generates missing thumbs for pre-existing images on project load,
fire-and-forget; cards fall back to full-res until it lands.

## Status
Code complete + ffmpeg extractor unit-verified (4K->512, no-upscale). Pending:
live in-app scroll test on a real 100+ image project + RunPod/remote gen parity
(remote gens save via the same save-generation route, so covered by the server edit).
