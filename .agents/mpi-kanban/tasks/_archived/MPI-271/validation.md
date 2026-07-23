# MPI-271 Validation

## What shipped (P4 + P5)
Migrated all live-latent consumers off legacy `generation:preview` onto the MPI-269
`preview:frame` bus + `getLastPreview` seeding, then retired the legacy emit path.

Consumers migrated (contract named 2; **3** existed — GroupHistory was drift):
1. `MpiBaseApp.js` app pane — `preview:frame` + `byPromptId` tempId match; seeds from
   `getLastPreview` on run-start (fixes app-pane-blank-through-gaps bug).
2. `MpiGalleryBlock.js` placeholder card — `preview:frame` + first-running match; seeds on
   `generation:started`.
3. `MpiGroupHistoryBlock.js` viewer — `preview:frame`; mount-seed still reads
   `entry.latestPreviewUrl` (now bus-fed).

P5 retirement:
- `activeGenerations.setPreview` **deleted** (emit + field-write). The `preview:frame` bus
  listener is now the **sole writer** of `latestPreviewUrl` / `placeholderGroup.latestPreviewUrl`,
  keeping the 3 non-subscriber reads alive (queue thumbnail, GH mount-seed, gallery-grid re-mount).
- `exec.onPreview` kept but slimmed to only re-emit `generation-queue:changed`.
- `generation:preview-reset` (MPI-167 stage-clip drop) untouched — unrelated to the bus.
- events.js doc: dropped `generation:preview`, added `preview:frame`. appService comment fixed.
- docs/preview-bus.md § Legacy path → "retired (MPI-271)".

## Float-window + LTX — DECISION: leave as still frame (no clip loop)
User reported the OS floating latent window (MPI-270) shows LTX as a frozen frame (LTX latents
loop as a clip in the gallery card). A clip-loop port was tried (forward preview-reset over IPC
+ accumulate/loop in float-latent.html) but REVERTED at user request: not worth the extra IPC
surface + timer machinery to watch LTX motion in a minimized window. Float stays STILL-only;
LTX shows a single live latent there. Documented as a `ponytail:` comment in float-latent.html.
Only float-latent.html carries a (comment-only) diff; bridge/main.js/cjs are back to baseline.

## Automated checks — PASSED
- `eslint` on all 6 touched files → clean.
- grep for `activeGenerations.setPreview` / `callbacks.onPreview` / `Events.on('generation:preview'` → 0 dangling refs.

## Needs USER verification (user-ux + remote — NOT closed)
Verify mode: user-ux. Live latent watching + remote path can't be auto-verified.
- [ ] LOCAL gallery gen: placeholder card shows live latents, holds through frame gaps.
- [ ] LOCAL app-pane gen (open an App overlay): result pane shows latents, holds through gaps (the bug this fixes).
- [ ] LOCAL group-history gen: viewer shows latents; reopen-mid-gen rehydrates from latestPreviewUrl.
- [ ] Queue-panel thumbnail still refreshes as latents land.
- [ ] **REMOTE-connected gen** shows latents (feedback_runpod_not_local_engine_proof — local test does NOT cover remote WSS proxy path).
- [ ] (open flag) next real LTX/VHS gen: previews still show (SOI+size fallback, unchanged here).
- [ ] FLOAT WINDOW: minimize during a gen → shows the live latent. LTX = single still by design (see decision above). Non-LTX = live single latent.
