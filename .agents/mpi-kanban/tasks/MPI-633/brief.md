# MPI-633 — Gallery renditions: size-matched image thumbs and a video proxy

Raised from MPI-631, which fixed *retention* (the gallery no longer holds every decoder it
has ever created). This card fixes *per-asset cost and quality*, which MPI-631 deliberately
did not touch.

## Two asymmetries

**1. Images got thumbnails. Videos never did.**
MPI-319 gave images a 512px WebP because decoding full-res PNGs in cards was ~179× heavier
than thumbs. A video card *does* get a 256px JPG poster — but `_promoteVideo` **throws it
away** and mounts the full-resolution master. A decoder works at the clip's native
resolution regardless of how small the card is, so a 3000×1280 clip in a ~300px card
decodes roughly 100× the pixels the card ever shows. Measured consequence: with MPI-631's
scroll-out demote in place, the resting 738 MB is dominated by the two 3000×1280 clips at
the top of the test project.

**2. One thumb size serves every card size.**
`ITEMS_PER_ROW_TARGET` ([MpiGalleryGrid.js:405](../../../../js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js)) targets **2 cards per row** at slider level 4, so on a wide window a card paints at ~950-1250px from a 512px source — a 2× upscale, and it looks it. [ffmpegThumb.js:9](../../../../services/ffmpegThumb.js) still claims 512 is *"sharp enough at the biggest gallery card"*; that was true for whatever window it was measured in and is false on a 2560-wide one. Fabio's words: users are pushed into the History workspace just to see their own asset at a decent size.

## The design

Pick the **smallest rendition whose pixels meet or exceed the card's rendered box**, falling
back to the original. Standard `srcset` behaviour.

### Why not cap the max card size (Fabio's first proposal, considered and rejected)

The screen's pixel count is fixed. Two huge cards or six small ones fill the same monitor,
so a size-matched rendition keeps memory roughly flat across the whole slider *and* fixes
quality:

| slider level | cards/row | ~visible | rendition | ~texture total |
|---|---|---|---|---|
| 1 | 6 | ~40 | 512px | ~24 MB |
| 4 | 2 | ~6 | 1280px | ~22 MB |

A cap trades away a feature users have, to work around a derivative that is the actual
fixable part — and by Fabio's own observation it makes memory *worse*, because it forces
more cards on screen at once. The table above is arithmetic, not measurement; the
acceptance criterion asks for it to be verified rather than assumed.

### Key off the RENDERED BOX, not items-per-row (Fabio)

His own objection to "just use three per row": with justified rows, three **portrait**
cards per row are narrow but **tall**. A column count therefore does not tell you how many
pixels the card paints — the tier has to be chosen from the rendered box (max of width and
height), which the grid already computes for layout.

### Never generate above the source

Most assets in the test project are **1280×800**. A "1280px tier" for those is the original
file, so the ladder must clamp to the source and let a big card simply use `filePath`.
Generating an upscaled derivative would cost disk and quality for nothing.

### Video proxy

720p, or 480p — Fabio: either is fine for gallery hover. Full-res master stays in the
viewer, exactly as images already work.

## What already exists to build on

- `services/ffmpegThumb.js` — `extractImageThumb` **already takes a `width` option**, and
  video posters already come from here. Bundled ffmpeg via `ffmpegBinary.js`, so no new
  dependency.
- The MPI-319 backfill pattern: `POST /backfill-image-thumbs`, fired fire-and-forget on
  project load, patching live items and rebuilding the grid.
- Sidecar GC: renditions must live and die with the sidecar like the current thumbs.

## Traps carried over from the existing thumb work

- **WebP, never JPG** (MPI-627). JPG has no alpha, and flattening a background-removed PNG
  hands back the *original image whole* — backdrop and drop shadow included — so the card
  disagrees with the viewer. The symptom is not a white background, which is what makes it
  hard to recognise.
- The backfill patches on `item.thumbPath !== thumbs[id]`, not on a missing thumbPath, so an
  item holding a deleted URL does not 404 its card until the next project load.
- `extractImageThumb` **returns the path it actually wrote** — callers must use the return
  value, not the path they passed.

## Costs to state plainly before building

Disk per asset, a one-off encode per asset, and a backfill pass for existing projects. None
is free; MPI-319 paid the same and the pattern is there to copy.

## Measure first

Everything above about video decode cost is reasoned from the mechanism, not sampled. Two
measurements belong before the build, and both are acceptance criteria:

1. Per-video decode cost against resolution — so the proxy size is chosen on evidence.
2. Gallery VRAM at the largest card size vs the smallest — the flatness the table claims.

Method that worked for MPI-631: `Get-Counter '\GPU Process Memory(*)\Dedicated Usage'`
summed over the Vision PIDs on a 3 s interval, engine off so the app is measured alone.
Scripts in that session's scratchpad (`gpuwatch.ps1`).
