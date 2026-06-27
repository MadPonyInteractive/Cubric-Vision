# MPI-115 — Plan: Scope B (full control-state snapshot) + clean schema + migration

Decision (Fabio 2026-06-18): **Scope B**. Image AND video. No live users → migration
rewrites existing on-disk sidecars HARD to the clean shape (no compat cruft kept).
Ship on RunPod, then patch master. File must be CLEAN: zero unused / repeated entries.

## Design — one source of truth per field

### Keep (deliberate, distinct audiences)
- `pixelDimensions` (top) — UI render reads ONLY this. Keep.
- `injectionParams.Width/Height` — ground-truth gen params. Keep (inside generationSettings).
- top-level `fps/duration/frameCount/hasAudio` — CANONICAL per integrity doc:131–140. Keep.
- `mediaItems` vs `previewAssets.snapshots` — gen-input refs vs durable project snapshots. Keep both.

### Remove (accidental / dead / redundant)
1. top-level `ratioLabel` — dup of `injectionParams.Ratio_Label` (readers already cascade). DELETE.
2. `videoMeta` — exact dup of top-level canonical fields. DELETE (top-level is the source).
3. `generationSettings.modelSettings.operations` — written, never read, op state now in controlState. DELETE from snapshot.

### Add — `generationSettings.controlState` (THE Scope-B change)
Snapshot the exact 3 apply-buckets at gen time so reuse reads them DIRECTLY
(no reverse-derivation). Mirrors `applyPromptReuseSettings` input 1:1:
```
generationSettings.controlState = {
  shared:  { ...getSharedSettings(project, mediaType) },   // ratioSelector{selectedRatio,qualityTier,orientation}, batch, duration, motionIntensity, previewStage
  op:      { ...getOpSettings(project, modelId, operation) }, // denoise, useGrid, upscaleFactor (per-op)
  model:   { loras, upscaleModel },                          // model-wide (already in modelSettings; move here, drop operations)
}
```
- Image models: `shared` has no duration/motion/previewStage (component-gated) — snapshot whatever bucket holds, apply path is already component-aware.
- Empty sub-objects omitted (clean file). If a bucket is `{}`, don't write the key.

`generationSettings` final shape:
```
{ operation, modelId, injectionParams, mediaItems, previewOnly, controlState }
```
(`modelSettings` removed — its loras/upscaleModel fold into controlState.model; operations dropped.)

## Reuse rewrite (promptReuse.js)
- `buildPromptReuseSettings`: if `payload.generationSettings.controlState` present →
  return `{ sharedUpdates: controlState.shared, opUpdates: controlState.op, modelUpdates: controlState.model }`
  DIRECTLY (clamp/sanitize defensively, but no reverse-derive).
- Keep the existing reverse-derive (`_ratioSettingsFromParams` + param-walk) ONLY as the
  legacy fallback for sidecars lacking controlState (i.e. nothing — migration backfills all
  on-disk; but keep fallback for safety/robustness). Mark it `// legacy: pre-controlState sidecars`.
- Reading `modelSettings.loras/upscaleModel` → read `controlState.model` instead (with legacy fallback to old `modelSettings`).

## Migration (SCHEMA_VERSION 2 → 3)
`js/migrations/projectMigrations.js` add `migrateV2toV3(project, projectRoot)`:
- Iterate `Media/.meta/*.json`. For each sidecar:
  - delete top-level `ratioLabel`, delete `videoMeta`.
  - if `generationSettings` present: delete `generationSettings.modelSettings`; synthesize
    `generationSettings.controlState` by reverse-deriving from `injectionParams` (reuse the
    SAME derivation logic from promptReuse — extract to a shared helper so migration + legacy
    fallback share one code path). Backfill `model` from old `modelSettings.{loras,upscaleModel}`.
  - rewrite sidecar via `updateProjectJson`-style atomic write (use existing sidecar write util).
- Bump `SCHEMA_VERSION = 3`.
- Update `docs/project-integrity.md` (remove ratioLabel/videoMeta from field list, document controlState).

## Parity mandate sites (integrity doc:148–149) — update in equal measure
- (a) `js/data/projectModel.js` createImageItem/createVideoItem — drop ratioLabel/videoMeta defaults if any.
- (b) fresh-item sites in generationService.js (build loop ~640) — stop setting videoMeta; build controlState.
- (c) writer routes: save-generation (W1), upload (W2), crop-media (W3), videoConcat (W4), videoCrop (W5), videoReverse (W6) — stop writing videoMeta + top-level ratioLabel.
- (d) `js/managers/projectReconciler.js` _constructSyntheticItem — already minimal; confirm no ratioLabel/videoMeta.

## Verify
1. Generate image → inspect new sidecar: no videoMeta, no ratioLabel, has controlState.shared+op+model.
2. Generate video → same + controlState.shared has duration/motion.
3. Reuse Prompt on each → PromptBox shows exact recalled settings (no nav refresh needed; MPI-112 fix in place).
4. Open an OLD project (race-tests) → migration runs, sidecars rewritten, reuse still works.
5. Grep: no remaining reads of `videoMeta` / top-level `ratioLabel` / `modelSettings.operations`.

## Master patch
After RunPod verified + committed: cherry-pick / re-apply same diff to master (identical code confirmed present). Migration ships there too.
