# MPI-689 — validation

## Root cause (proven, not guessed)

`extractVideoThumb` wrote `scale=256:-2` JPG. MPI-633 moved IMAGES onto a 512/1280 WebP
ladder precisely because a card paints ~775-1250 device px; the video poster was never
moved with them. Hover looks right because that path mounts the 720p proxy — the poster
is the only thing left at 256. And it is not a brief flash: `_releaseMedia('generation')`
demotes every video card back to its poster for the whole of a generation, which is the
state in the user's screenshot (`GENERATING • 1/2` in the status bar).

## Machine evidence

| check | result |
|---|---|
| `npm run lint` / `lint:components` | clean |
| `npm test` | 884/884 |
| `node --test tests/gallery-renditions.test.cjs` | 9/9 — includes the new video-poster case |
| `playwright.desktop.config.js gallery-renditions.spec.js` | **6/6**, incl. the new video case and the pre-existing fling + demote specs |

### Real ffmpeg, real clips (`New H3 Tests/Media`, into a scratch dir)

    i2v_001.mp4 768x1344
      thumbPath    smoke0.thumb.webp       512x896    45.4 KB
      thumbPathLg  smoke0.thumb.1280.webp  768x1344   84.8 KB   (capped at source)
      proxyPath    smoke0.proxy.mp4        412x720   266.7 KB   (unchanged)

### The backfill, driven through the REAL route

Scratch project, 1920x1080 clip, sidecar carrying a legacy 256px `.thumb.jpg`. Mounted
`routes/projects.js` on a bare express app and POSTed `/backfill-media-derivatives`:

- `patched: 1`; sidecar now carries `thumbPath` (512x288), `thumbPathLg` (1280x720), `proxyPath`
- the stale `vid1.thumb.jpg` is **deleted**
- **second pass patched: 0** — it converges, so a project does not re-encode on every load

## Outstanding — user judgement only

Does it look right in the running app. Needs a full app restart (the routes changed) and
one project load to fire the backfill over existing clips.
