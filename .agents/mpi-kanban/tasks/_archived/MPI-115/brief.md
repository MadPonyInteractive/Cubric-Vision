# MPI-115 — Sidecar schema redesign

Surfaced during MPI-112 (reuse-prompt bugs). The `.meta/<uuid>.json` sidecars
are a mess: duplicated fields, some with disagreeing values. This card is the
proper root cleanup. **Investigate before implementing.** Patch master too.

## Evidence (race-tests project, i2v_ms_008 sidecar 2026-06-18)

Duplicated / overlapping fields in ONE sidecar:

| Field | Location A | Location B | Notes |
|---|---|---|---|
| ratio label | top-level `ratioLabel` | `generationSettings.injectionParams.Ratio_Label` | exact dup |
| dimensions | top-level `pixelDimensions {w,h}` | `injectionParams.Width/Height` | dup |
| fps/duration/frameCount/hasAudio | top-level | `videoMeta.{...}` | exact dup (4 fields) |
| start-frame media | `generationSettings.mediaItems[]` | `previewAssets.snapshots[]` | same file, 2 shapes |
| seed | top-level `seed` | (flows through generationSettings) | dup |

**Worse — contradictory values in one item:**
- `project.shared.video.ratioSelector.qualityTier = "very_low"` (176x320)
- `injectionParams.Width/Height = 368x640` = **low** tier

The two quality sources disagree. `injectionParams` W/H is ground truth (it's
what actually generated); the `ratioSelector` bucket is the last UI selection,
stale per-item.

**Empty bucket:** `generationSettings.modelSettings.operations` is ALWAYS `{}`.
Per-op control state was never written there. Shared controls (ratio/quality/
duration/motion/previewStage) live in `project.shared.video` — and that bucket
is NEVER captured in the sidecar at all. Reuse therefore can't read UI state
directly; it reverse-derives from injectionParams (works, but fragile + needed
per-setting code).

## Likely cause

Regressed when the combined image/video model was split into two video models.
That change skipped re-implementing the sidecar's per-op / shared settings
persistence. (Fabio: "the agent that separated the models did not re-implement
this." Original plan was per-op settings saved in the sidecar `operations` map.)

## Required: investigate first

Before touching anything, produce a field map:
1. Every sidecar field → its WRITER(s): `routes/projects.js` save-generation,
   crop-media, upload; `videoConcat.js` extend; `projectReconciler`
   `_constructSyntheticItem`; `projectModel.js` createImageItem/createVideoItem.
2. Every field → its READER(s): gallery grid, history list/block, reuse
   (`promptReuse.js`), versioning/migration.
3. Classify each duplicate: DELIBERATE (integrity doc says videoMeta = raw
   probe for enrichment; previewAssets = durable project-owned snapshots) vs
   ACCIDENTAL (ratioLabel twice, videoMeta exact-dup of top-level).

## Then design

- ONE source of truth per field. Decide canonical home (top-level vs
  generationSettings vs videoMeta vs previewAssets).
- Consider snapshotting the full PromptBox control STATE (shared + op buckets)
  into the sidecar at gen time so reuse applies it DIRECTLY (future-proof — any
  new control rides along, no reverse-derivation). This was the intended design.
- Bump `SCHEMA_VERSION` + write a migration (`js/migrations/projectMigrations.js`)
  to normalize existing sidecars. Update `docs/project-integrity.md`.
- Honor the sidecar / in-memory parity mandate (integrity doc): update
  createImageItem/createVideoItem, every fresh-item site, every writer route,
  and `_constructSyntheticItem` in equal measure.

## Master patch

No users yet (Fabio 2026-06-18) → land on RunPod branch AND patch master so the
released line isn't shipping the messy schema.

## Done in MPI-112 (do NOT redo here)

The live-UI reuse lag was fixed in MPI-112: reuse settings were written AFTER
the controls mounted, so the PromptBox showed stale ratio/quality/duration until
next nav. Fixed by `el.refreshControls()` re-mount after applyPromptReuseSettings
(history + gallery blocks). That's the correctness fix; THIS card is the schema
cleanup underneath it.
