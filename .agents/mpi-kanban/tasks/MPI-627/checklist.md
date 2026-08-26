# MPI-627 Checklist

- [x] Diagnose to the actual root — `ffprobe` says `removeBackground_004.png` is `rgba`;
      the old thumb args produce `yuvj444p` and the rendered thumb is the ORIGINAL photo,
      shadow and backdrop intact. Not a white fill, not the wrong history entry.
- [x] Image thumbs encode as alpha-carrying WebP; `extractImageThumb` returns the path it
      actually wrote (`services/ffmpegThumb.js`)
- [x] Sweep every consumer — 5 `extractImageThumb` call sites, the add-to-gallery thumb
      copy, the GC, both delete paths, the same-id replace guard (`routes/projects.js`)
- [x] Existing projects heal: the load-time backfill replaces a legacy `.thumb.jpg` off an
      alpha-capable source and deletes the stale file
- [x] Live session survives the heal — `_backfillImageThumbs` patches on a CHANGED
      thumbPath, not a missing one (`js/services/projectService.js`)
- [x] Regression test + mutation check (`tests/image-thumb-alpha.test.cjs`)
- [x] `npm test` 742 pass / 0 fail; eslint clean on all four changed files
- [x] Migration verified against a COPY of the user's own project: 5 cut-outs healed,
      3 opaque jpg sources untouched, second run patched 0
- [x] Docs synced — `docs/gallery.md`, `docs/project-integrity.md`
- [x] **User confirmed in the running app**, 2026-08-26 after a full restart: "fix worked.
      The consistent colour is now not confusing anymore." Gun, cup and the `pal8` Google
      logo all render on the gallery surface
