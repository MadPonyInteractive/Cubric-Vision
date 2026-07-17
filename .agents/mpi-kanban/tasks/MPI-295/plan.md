# MPI-295 — Unify prompt-box media roles (collection model)

> Compact plan. Root cause is fully traced for the round-trip symptom; the reuse
> symptom is inferred and is **step 1** of execution (confirm before patching).
> Read this whole file + the task.json before starting. Fresh session: also read
> `.claude/rules/comfy_injection.md` § "Media slot completeness".

## The bug (repro'd — project "Test Chips", 2026-07-17)

krea2Edit with **two** reference images:
1. **Round-trip:** add woman → add man → edit → go to project page → return = **only chip #2 (man) survives.** Chip #1 evicted.
2. **Reuse:** card carries 2 images → Reuse Prompt = **only 1 chip loads.**

The edit gen itself is correct (both characters render) — so the SAVE of both
images works. The corruption is in **roles**, and it breaks restore + reuse.

## Root cause (single defect)

`routes/projects.js` `_snapshotRoleForMediaItem` (~L617) hardcodes roles **by index**:

```js
if (item?.role === 'startFrame' || item?.role === 'endFrame') return item.role;
if (index === 0 && !usedRoles.has('startFrame')) return 'startFrame';   // chip 0 → startFrame
if (index === 1 && !usedRoles.has('endFrame'))   return 'endFrame';     // chip 1 → endFrame
return null;
```

This is an **i2v leftover** (MPI-227 wired snapshotting for i2v's start/end frames).
`materializeGenerationFrameSnapshots` (~L630) calls it for *every* image-input op and
**writes the forced role back into `mediaItems[index]`** (L665-667), overwriting
krea2Edit's real slot roles.

**Live-verified in the sidecar** `Media/.meta/af83dcbf-...json`: both reference images
present but tagged `role:"startFrame"` / `role:"endFrame"` — should be
`inputImage` / `inputImage2` (krea2Edit's `mediaInputs` slot keys, commandRegistry L168/172).

### Why each symptom follows

- **Round-trip:** chips persist to `state.promptMedia` with the bad frame roles. On
  restore, `MpiPromptBox._withAssignedRoles` (L211) does an **explicit role match**
  against the op's slot keys (`inputImage`/`inputImage2`). The chips carry
  `startFrame`/`endFrame` → explicit match fails → positional fallback + the at-cap
  eviction (`injectMedia` L316-357, "evict LAST chip") drops chip 1.
- **Reuse:** `promptReuse.js _mediaItemsFromPreviewAssets` (L68) filters
  `role === 'startFrame' || 'endFrame'` then `_mergeReuseMedia` (L162) — the
  role collision collapses the pair. (CONFIRM exact drop point — step 1.)

## Direction (user decision, 2026-07-17)

Move to a **collection** model, not enumerated `image1/image2/imageN` slots:
- Prompt-box media = an **`images: [...]` list** (ordered). Each item optionally carries a
  semantic tag only where injection needs it (`inputImage`, `startFrame`, or none).
  Positional index = array order.
- **Rationale:** video will soon take **>2** images used in different generation areas, so
  `startFrame`/`endFrame` semantic names don't scale. Two systems fight today (positional
  "which slot" vs semantic "what the frame means") — unify the **positional** part.
- **Do NOT** rename i2v's `startFrame`/`endFrame` slot KEYS in this pass — that's a bigger
  semantic migration, do it when multi-image video actually lands. This pass only stops the
  **generic plumbing** from special-casing those two strings.

## Core principle of the fix

**The generic snapshot / restore / reuse infrastructure must be role-AGNOSTIC.**
It persists whatever role the chip already has (assigned from the op's `mediaInputs`
`slot.key`) and never invents `startFrame`/`endFrame`. Those strings survive only as
i2v's own slot keys — special-cased nowhere in the generic plumbing.

## Phases

### Phase 0 — confirm + decide shape (no code)
- [ ] Trace the **reuse** symptom to certainty (round-trip is done). Where exactly does the
      2nd image drop: `_mediaItemsFromPreviewAssets` filter, `_mergeReuseMedia`, or the
      inject loop in `MpiGalleryBlock` (~L1221)?
- [ ] Decide the collection data-shape: `images: [{ url, role?, source?, ... }]`. How does
      `commandExecutor._buildParams` map **array order → `Input_Image` / `Input_Image_2`**
      titles? (Today it's per-slot via `mediaInputs`. Collection needs an order→title map.)
- [ ] **Migration decision:** existing sidecars carry mis-tagged `startFrame`/`endFrame` on
      edit/i2i cards. Pick (a) one-time migration rewriting to the op's slot keys, or
      (b) role-agnostic restore/reuse tolerant of any role (old sidecars still restore).
      Prefer **fix-at-source + light migration**.

### Phase 1 — kill the special-casing (source fix)
- [ ] `routes/projects.js`: drop the index→frame-role hardcode in `_snapshotRoleForMediaItem`;
      persist the chip's actual `item.role`. Remove the `role !== 'startFrame' && !== 'endFrame'`
      gate at L569 (materializePreviewAssets) and any other frame-role gate — snapshot ALL
      declared image inputs regardless of role.
- [ ] `promptReuse.js`: `_mediaItemsFromPreviewAssets` — drop the `startFrame/endFrame` role
      filter; return all image snapshots. Audit `_mergeReuseMedia` for role assumptions.
- [ ] `generationService.js`: audit the L923 `startFrame/endFrame` filter.

### Phase 2 — restore/reuse role-agnostic + verify
- [ ] `MpiPromptBox._withAssignedRoles` / restore loop: make restore replay chips under the
      **correct op** (set op before injecting) so cap/role logic uses krea2Edit's slots, not
      the default op's. (The round-trip eviction also stems from restore running under the
      wrong op cap — verify this is covered by the role fix or needs its own guard.)
- [ ] Migration (if chosen): rewrite existing sidecar roles.

### Phase 3 — verify (real app, not just tests)
- [ ] Repro the exact "Test Chips" flow: 2-image krea2Edit → round-trip → **both chips**.
- [ ] Reuse from the 2-image card → **both chips** load; reuse from a 1-image card → 1 chip.
- [ ] i2v start/end-frame flow still works (no regression on the video path).
- [ ] Read the new sidecar — roles should be `inputImage`/`inputImage2`, NOT frame roles.

## Files (blast radius)

| File | What |
|---|---|
| `routes/projects.js` | `_snapshotRoleForMediaItem` L617, `materializeGenerationFrameSnapshots` L630, snapshot gate L569, `validate-preview-assets` L1254+ |
| `js/utils/promptReuse.js` | `_mediaItemsFromPreviewAssets` L68 (role filter), `_mergeReuseMedia` L162, `_previewAssetMediaItems` |
| `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` | `_withAssignedRoles` L211, `_saveMedia` L116, restore loop L1517, `injectMedia` cap/eviction L316-357 |
| `js/services/generationService.js` | `frozenMediaItems` L887, snapshot role filter L923, `_opScopedMediaItems` L136 |
| `js/data/commandRegistry.js` | `krea2Edit.mediaInputs` L167 (reference), `i2v` frame slots |
| `.claude/rules/comfy_injection.md` | media-slot completeness / `filterMediaInputsForModel` — update if the collection model changes the contract |

## Related
- MPI-292 (2-image edit, shipped), MPI-227 (content-addressed preview-assets), MPI-225 (op-scoped media items).
- Memory: [[feedback_media_injection_path_to_string]], [[feedback_read_devtools_before_theorizing]].
- Repro data: sidecar `Documents/Cubric Vision/Projects/Test Chips/Media/.meta/af83dcbf-329d-4291-8209-1d8b4d566770.json`.
