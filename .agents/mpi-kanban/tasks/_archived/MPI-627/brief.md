# MPI-627 — a cut-out card showed the original image

## Symptom

A background-removed image rendered in the gallery grid as the **pre-removal
source**: white studio backdrop, drop-shadow under the coffee cup. The canvas
viewer, on the same item, showed the cut-out correctly. Reported by the user as
"the card displays it with a white background"; the user then spotted the
sharper tell — the shadow — and read it as the grid selecting the wrong history
entry.

## Root cause

Neither reading was the mechanism, and the difference matters for the fix.

Background removal writes its mask into the **alpha channel only** and leaves
the source RGB untouched underneath. The gallery thumb (`extractImageThumb`,
512px, MPI-319) was a **JPG**, and JPG carries no alpha — so the encode did not
paint a white backdrop behind the subject, it **discarded the mask and restored
the original frame whole**. The card was the correct history entry all along; it
was that entry's thumb with its cut-out thrown away.

Proof: `ffprobe` on `removeBackground_004.png` → `rgba`; the same file through
the old thumb args → `yuvj444p`, and the rendered thumb is the original photo.

## Fix

- `services/ffmpegThumb.js` — image thumbs encode with `libwebp -quality 82` and
  land at `.thumb.webp`. `extractImageThumb` now returns the path it **actually
  wrote**; callers must use the return value. `imageThumbPath()` is the one
  place the `.jpg → .webp` swap is spelled. WebP is also *smaller* here (512px:
  30 KB vs 44 KB on a photo).
- `routes/projects.js` — all five image-thumb producers use the returned path;
  the add-to-gallery copy keeps the source thumb's own extension; the GC, the
  two delete paths and the same-id replace guard accept `.jpg` (video, legacy)
  **and** `.webp`; `POST /backfill-image-thumbs` now also **replaces** a legacy
  `.thumb.jpg` whose source is `.png/.webp/.avif/.gif` and deletes the stale jpg
  (a JPG source can never carry alpha, so it keeps its thumb).
- `js/services/projectService.js` — `_backfillImageThumbs` patches on
  `item.thumbPath !== thumbs[id]`, not on a missing thumbPath. Without this an
  item holding the just-deleted jpg URL 404s its card until the next load.

Nothing in CSS changed: `.mpi-group-card__media` already paints `--surface-3`,
so the cut-out composites onto the gallery surface as asked.

## Blast radius swept

`extractImageThumb` has 5 call sites (add-media, save-generation, backfill,
composite-media, apply-paint - NOT crop-media, which makes no thumb at all) — all fixed in one pass. `videoConcat.js`,
`videoCrop.js`, `videoReverse.js` call `extractVideoThumb`, which is unchanged
and still writes JPG. No client code keys off the thumb extension
(`RECENT_THUMBNAIL_EXTENSIONS` already listed `webp`).

## Outstanding

The user's running app holds the OLD server code — the heal lands when the app
is restarted and the project is reopened.
