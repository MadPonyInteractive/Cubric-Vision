# MPI-689 — Video gallery posters are 256px

## Root cause

`extractVideoThumb` writes `scale=256:-2` JPG (`services/ffmpegThumb.js`). MPI-633 gave
IMAGES a 512/1280 WebP ladder because a card paints ~775-1250 device px; the video poster
was never moved onto it. Hover looks right because that path mounts the 720p proxy — the
poster is the only thing at 256, and it is what shows before promotion and during every
media suspension (a generation in flight demotes every video card back to it, which is
exactly the state in the user's screenshot).

## Steps

- [x] `extractVideoThumb` → WebP at `IMAGE_RENDITION_PX` widths, keeps `atSeconds`
- [x] `writeVideoDerivatives` writes small + large (large owed by any clip wider than the SMALL tier — a video card can never fall through to `filePath`), returns `thumbPathLg`
- [x] 5 call sites pass `sourceWidth`; the three video routes stamp `thumbPathLg`
- [x] Backfill: a video owed the poster ladder re-encodes; stale `.thumb.jpg` deleted; second pass is a no-op
- [x] Grid: video poster mounts through `pickImageRendition(..., { allowSource: false })`, same promote/demote gate as an image card
- [x] `tests/gallery-renditions.test.cjs` + `tests/desktop/gallery-renditions.spec.js` cover the video card
- [x] Verified by eye in the running app — needs an app restart + one project load
