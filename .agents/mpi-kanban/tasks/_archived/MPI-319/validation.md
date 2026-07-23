# MPI-319 Validation

## Automated (done)
- `extractImageThumb`: 4096x4096 PNG -> 512x512 JPG (58KB -> 3.3KB). PASS.
- No-upscale guard: 200x200 source stays 200x200 (not blown to 512). PASS.
- `node --check` on all 7 modified files. PASS.

## Manual (pending — needs running app)
1. Open a project with 100+ image entries (ideally some 4K). Scroll fast up/down.
   EXPECT: smooth; no freeze. Compare against pre-fix jank.
2. Generate a new image. Card should show the thumb (check .meta/<id>.thumb.jpg
   exists on disk). Open it in the viewer -> full-res.
3. Import an image via drag-drop into the gallery. Thumb generated, card sharp.
4. Snapshot / add-to-gallery an image -> thumb present.
5. Pre-existing project (images with no .thumb.jpg): open it. Thumbs backfill in
   the background; cards swap from full-res to thumb without a reload. Verify
   .thumb.jpg files appear in .meta/ and sidecars gain thumbPath.
6. Preview->final replace on an image: verify the final card's thumb isn't
   deleted by the replace-cleanup (the isVideo-gate fix).
7. Delete an image card -> its .thumb.jpg is GC'd (existing cleanup covers it).

## Remote/RunPod
Remote image gens save via the same /save-generation route -> covered by the
server edit. No separate remote thumb path.
