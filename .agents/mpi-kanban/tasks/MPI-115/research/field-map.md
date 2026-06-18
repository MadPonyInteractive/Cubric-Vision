# MPI-115 — Sidecar field map (investigation result)

Investigated 2026-06-18 (RunPod branch; verified master has identical code).
Source: 3 read-only Explore passes over writers, readers, integrity doc.

## Writers (7 sites)

| ID | File | Route/Fn |
|---|---|---|
| W1 | `routes/projects.js` | `POST /project/save-generation` (~1406) — canonical, full sidecar |
| W2 | `routes/projects.js` | `POST /project-media/:id/upload` (~1090) — imported |
| W3 | `routes/projects.js` | `POST /project/crop-media` (~1805) — image crop |
| W4 | `routes/videoConcat.js` | `_writeOutputSidecar` (~109) — combine/extend |
| W5 | `routes/videoCrop.js` | `POST /api/video/crop` (~129) |
| W6 | `routes/videoReverse.js` | `POST /api/video/reverse` (~112) |
| W7 | `js/managers/projectReconciler.js` | `_constructSyntheticItem` (155–183) — **in-memory only, no disk write** |

Also: `probe-videos` route patches `fps/duration/frameCount/hasAudio/videoMeta/pixelDimensions` onto sidecars missing them. `update-meta` route = shallow merge of arbitrary `updates`.

`generationSettings` built in `js/services/generationService.js` ~630–639:
```
{ operation, modelId, injectionParams (full clone), mediaItems, previewOnly, modelSettings? }
```
`modelSettings` = `_clonePlain(getModelSettings(project, modelId))` = `{ loras, upscaleModel, operations }`.

## Duplicate classification (CORRECTED vs brief)

| Field pair | Verdict | Canonical home | Evidence |
|---|---|---|---|
| `ratioLabel` (top) vs `injectionParams.Ratio_Label` | **ACCIDENTAL** | `injectionParams.Ratio_Label` (readers prefer it; `ratioLabel` is fallback-only). `ratioLabel` NOT in integrity doc. | promptReuse.js:137,209 cascade |
| `pixelDimensions` (top) vs `injectionParams.Width/Height` | **DELIBERATE** — different audiences | both kept | UI (gallery/history) reads ONLY `pixelDimensions`; reuse reads `injectionParams.W/H`. integrity doc:109 documents `pixelDimensions` as first-class |
| `fps/duration/frameCount/hasAudio` (top) vs `videoMeta.{...}` | **top = canonical, videoMeta = redundant** | TOP-LEVEL | integrity doc:131–140 documents top-level as canonical probed-once; videoMeta:136 = "optional, future enrichment". Brief had this BACKWARDS. |
| `mediaItems` vs `previewAssets.snapshots` | **DELIBERATE** | both | integrity doc:120–126 — snapshots = durable project-owned; mediaItems = gen-input refs |
| `seed` (top) vs `injectionParams.Seed` | top canonical | top-level `seed` | `injectionParams.Seed` only written during reuse |

## Dead / missing fields (the real bugs)

1. **`generationSettings.modelSettings.operations`** — written (generationService.js:638), **NEVER read**. promptReuse only reads `loras`+`upscaleModel` (promptReuse.js:328–334). Dead weight.
2. **`project.shared.video` UI state** (qualityTier / duration / motion / previewStage / previewStage) — **NEVER captured in any sidecar**. Lives only in project.json. Reuse reverse-derives tier from `injectionParams.Width/Height` (promptReuse.js:206–244, `_ratioSettingsFromParams`). Fragile: every new control needs bespoke reverse-derive code.
3. **Quality-source disagreement** (the headline bug): `injectionParams.Width/Height` = ground truth (what generated). `project.shared.video.ratioSelector.qualityTier` = stale last-UI-selection. Currently reuse is CORRECT only because it ignores the stale tier and reverse-derives from W/H. But the two values disagreeing in one item is the smell.

## Readers — who reads which copy

- Gallery grid (`MpiGalleryGrid.js`): `filePath, type, thumbPath, name, duration, pixelDimensions, generationMs, stage, operation, modelId, uploaded`. Dims ONLY from `pixelDimensions`.
- History list (`MpiHistoryList.js`): `pixelDimensions, type, duration (?? videoMeta.duration), fps (?? videoMeta.fps), thumbPath, filePath, displayName, operation, extendedFrom, uploaded`. ONLY reader that falls back to videoMeta.
- `MpiGroupHistoryBlock.js`: `fps, duration, frameCount, hasAudio` — top-level only.
- Reuse (`promptReuse.js`): `generationSettings` (or `frozenParams` fallback) → `injectionParams.*`, `mediaItems`, `previewAssets.snapshots`, `modelSettings.{loras,upscaleModel}`, top-level `seed/ratioLabel/pixelDimensions` as fallbacks.
- Server routes: `validate-preview-assets`, DELETE cleanup, GC, findRecentProjectThumbnail read `filePath/thumbPath/stage/operation/createdAt/previewAssets/frozenParams`.

## Parity mandate (integrity doc:148–149)

Adding/changing a sidecar field MUST update in equal measure:
(a) `createImageItem`/`createVideoItem` in `js/models/projectModel.js`
(b) every fresh-item site
(c) every writer route (save-generation, crop-media, upload — and the video routes)
(d) `projectReconciler._constructSyntheticItem`

## SCHEMA_VERSION

`js/migrations/projectMigrations.js` `SCHEMA_VERSION = 2`. Migrations gate on `project.schemaVersion` ONLY — there is no per-sidecar version mechanism today. A sidecar normalization migration must iterate `.meta/*.json` within `migrateProject`.
