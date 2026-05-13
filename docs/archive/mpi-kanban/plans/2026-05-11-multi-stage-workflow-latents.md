# Multi-stage workflow latents

## Goal

Make multi-stage video preview cards durable and reusable for both text-to-video
and image-to-video workflows. A preview run saves the stage-1 latent into the
project, and Continue reloads that latent to create a new final video card
without replacing the preview. Image-to-video previews also save durable copies
of their injected start/end images so cold fallback is not dependent on user-
deletable source references.

LTX is future work: this plan must not add LTX-specific model registration or
workflow steps. The implementation should keep the generic latent-backed
multi-stage contract compatible with future LTX workflows.

## Decisions

- Continue creates a new final card. The preview card remains reusable until
  the user discards it.
- Project files are the source of truth for preview support assets. ComfyUI
  `input/` copies are temporary.
- Text-to-video stores only the latent and frozen params. Image-to-video stores
  the latent, frozen params, and project-owned start/end image snapshots.
- WAN high-stage LoRAs are baked into the saved latent. WAN Continue uses the
  user's current low-stage LoRA settings so one preview can branch into several
  final looks.
- Only show a missing-assets warning/badge when required latent/snapshot assets
  are actually missing. No "ready" badge.
- Discard deletes only the preview card and its support assets. Final cards
  produced from that preview are independent and remain in history.

## Proposed Data Contract

Preview sidecars should keep the current `stage: 'preview'` and `frozenParams`
fields, then add project-owned support asset metadata. Exact names can be
adjusted during implementation, but the shape should express these concepts:

```js
{
  stage: 'preview',
  frozenParams: {
    seed,
    prompt,
    negative,
    dims: { w, h },
    injectionParams,
    mediaItems: [
      {
        role: 'startFrame' | 'endFrame',
        mediaType: 'image',
        url: '<project-owned snapshot url>',
        originalUrl: '<original promptbox/history url>'
      }
    ]
  },
  previewAssets: {
    latent: {
      projectPath: '<project-relative or absolute path to .latent>',
      engineInputName: '<uuid>.latent',
      status: 'available' | 'missing'
    },
    snapshots: [
      {
        role: 'startFrame' | 'endFrame',
        projectPath: '<project-owned snapshot path>',
        mediaType: 'image',
        status: 'available' | 'missing'
      }
    ]
  }
}
```

T2V preview cards have no image snapshots. I2V preview cards must snapshot the
actual media injected into `Start_Frame` and, when present, `End_Frame`. If the
user supplied only one image, preserve the existing role/fallback behavior but
store the durable snapshot for the image that was actually used.

## Implementation Notes

- Existing relevant files:
  - `js/services/commandExecutor.js` builds title-keyed params. It already
    injects `Preview_Only` for `_ms` ops; it must also support
    `Is_Continue` and `LoadLatent`. It must also prepare workflow input
    defaults before every `_ms` submission because ComfyUI validates the
    `LoadLatent` node even when the non-continue branch is used.
  - `js/services/comfyController.js` title injection must support the
    `LoadLatent.inputs.latent` field.
  - `js/services/generationService.js` currently writes preview `stage` and
    `frozenParams`; it is the right place to thread preview asset metadata into
    `saveGeneration`.
  - `routes/projects.js` owns project file persistence and atomic project JSON
    writes; it should own copying/moving saved latents and snapshot assets into
    project storage.
  - `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` currently handles
    preview Continue/Discard UI decisions. It should request Continue/Discard
    behavior, but not directly own filesystem deletion.
  - `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` renders preview
    cards and should only show a missing-assets warning when validation says
    support assets are missing.
- Do not edit workflow JSON in this plan. The current WAN workflow files already
  contain the required node titles, but workflow authoring remains user-owned.
- Multi-stage workflow JSON files keep a default `LoadLatent` value. The repo
  must provide that default latent at `comfy_workflows/input/ComfyUI_00001_.latent`,
  and the app must copy it into `engine/ComfyUI_windows_portable/ComfyUI/input/`
  before every `_ms` run. This is required for normal full, preview, and
  Continue submissions because the workflow can fail validation when the
  default latent is absent.
- Normal full runs (`Preview_Only=false`, `Is_Continue=false`) must not keep
  saved latents. Only preview stage-1 runs should produce durable project
  latents.
- Branching Continue must not pass `replaceItemId`; final output should add a
  new card/group entry while the preview source remains available.
- Temporary engine-input latent copies are runtime cache only. They can be
  recreated from the project latent and should be removed after the Continue job
  completes, errors, or is cancelled.
- Cold fallback is secondary: if the project latent is missing but all required
  frozen params and snapshots exist, rerun stage 1 using the stored snapshots.
  If required snapshots are missing, block with a clear warning.

## To-dos

### 1. [x] Persist preview support assets

Add the project-owned asset contract for multi-stage preview cards. Preview-only
T2V saves the latent under the project. Preview-only I2V saves the latent plus
durable snapshots of any injected start/end images. Sidecars record the support
asset metadata and preserve the existing frozen prompt, seed, dimensions, media
role, and control snapshot needed for fallback.

Do not implement LTX-specific registration or require LTX workflow files. Keep
the contract generic for any `_ms` workflow with `SaveLatent`, `LoadLatent`,
`Is_Continue`, `Preview`, and `Output` nodes.

Implementation scope:
- Add a preflight for every `_ms` workflow submission that copies required
  default workflow input assets from `comfy_workflows/input/` into the current
  ComfyUI engine `input/` folder. Today the required default is
  `ComfyUI_00001_.latent`, used by `LoadLatent` when ComfyUI validates the
  workflow.
- Detect the latent emitted by the preview-stage `SaveLatent` run.
- Move/copy that latent out of ComfyUI `output/` into project-owned preview
  storage, e.g. `Media/.latents/<previewUuid>.latent`.
- For I2V, resolve the exact media items after role assignment and media-slot
  fallback, then copy those images into project-owned preview snapshot storage,
  e.g. `Media/.preview-assets/<previewUuid>/start.png` and `end.png`.
- Store sidecar metadata for both the original references and the project-owned
  support assets.
- Keep normal full video runs clean: no durable latent/snapshot metadata should
  be written when `previewOnly !== true`.

**Verify:** Delete or move `engine/ComfyUI_windows_portable/ComfyUI/input/ComfyUI_00001_.latent`, then run WAN `t2v_ms` with preview enabled and confirm the workflow starts and the default latent is restored in the engine input folder. Confirm the preview sidecar references a project-owned latent. Run WAN `i2v_ms` with one image and then with start/end images; confirm the sidecar references the project-owned latent and project-owned image snapshots with the correct `startFrame` / `endFrame` roles.

### 2. [x] Branch Continue from saved latents

**Implementation note (2026-05-12):** Pivoted from a single-file workflow with
`Is_Continue` boolean gating to a TWO-file convention. ComfyUI's `/prompt` API
has no runtime node-bypass flag (Issue Comfy-Org/ComfyUI#4028 open since 2024)
— a single branched workflow always executes every node in the static
dependency graph regardless of any `MpiIfElse` gating. Confirmed by user test.

Stage-2 workflows are now authored by toggling the stage-1 KSampler to Bypass
mode in the ComfyUI editor and exporting via Save (API), then saved as
`<name>_stage2.json` next to the base workflow. `commandExecutor._toStage2Filename`
swaps the basename when `payload.isStage2 === true`. `Is_Continue` injection
is dropped everywhere; branch selection is file selection.

New `preview:finish` event on the gallery preview card (replaces preview via
`replaceItemId`); existing `preview:continue` rewired to NOT pass
`replaceItemId` so it branches into a new card. Per-op flag
`commands[op].allowsBranchingContinue` controls whether the Continue button
renders; set true for WAN `t2v_ms`/`i2v_ms`, leave false for LTX (future) and
any future single-LoRA `_ms` ops. Preview card shows a small `xN` badge for
pending+running branching jobs.

Change preview Continue so it creates a new final card instead of replacing the
preview card. Before submission, copy the project latent into the current ComfyUI
`input/` folder, inject `Preview_Only=false`, `Is_Continue=true`, and inject the
`LoadLatent` filename. Keep stage-2 settings live, including WAN low-stage LoRAs.
Clean temporary engine-input latent copies after completion, error, or cancel
without deleting the project-owned source latent.

Implementation scope:
- Add standard injection support for:
  - `Is_Continue` -> boolean input.
  - `LoadLatent` -> `inputs.latent`.
- Continue config should use the preview card's operation/model/prompt context
  but should not set `replaceItemId`.
- Continue should enqueue like current preview Continue jobs, but the resulting
  save path must create a new final item instead of mutating the preview item.
- WAN high-stage LoRAs do not need replaying on latent Continue because they are
  already baked into the latent. WAN low-stage LoRAs remain the user's current
  settings and are injected normally.
- For non-WAN future models, including LTX, the same `Is_Continue` /
  `LoadLatent` contract should work without dual-LoRA assumptions.

**Verify:** Continue the same WAN preview twice with different low-stage LoRA or
stage-2 settings. Confirm two final cards are created, the preview card remains,
and ComfyUI starts from `LoadLatent` / `Is_Continue=true` rather than rerunning
stage 1.

### 3. [x] Missing asset handling and cold fallback

Add validation before Continue. If the project latent exists, use the latent path.
If the latent is missing but frozen params and required saved image snapshots
exist, offer a slower cold fallback that reruns stage 1 from the saved snapshot.
If required support assets are missing, block Continue with a clear warning and
show the preview card's missing-assets badge/warning state.

Discard must delete the preview sidecar/media plus its support latent and saved
image snapshots. It must not delete any final cards previously branched from the
preview.

Implementation scope:
- Add a backend validation route or service helper that checks the preview
  sidecar, project latent, and required snapshot files.
- Gallery UI should request validation before Continue and render a warning
  badge only when validation reports missing required support assets.
- If the latent exists, Continue takes the fast latent path.
- If the latent is missing but fallback is possible, notify the user that stage
  1 will be rerun from saved params/snapshots. The rerun should still branch to
  a new final card and should preserve the preview source card.
- If fallback is impossible, block Continue and keep the preview card so the
  user can choose Discard.
- Discard should call backend/project service cleanup for the preview media,
  sidecar, latent, snapshots, and any stale temporary engine-input latent.

**Verify:** Manually remove a preview latent and confirm Continue offers or uses
the cold fallback when snapshots exist. Manually remove a required snapshot and
confirm Continue is blocked with a clear warning. Discard the preview and confirm
only the preview and its support assets are deleted; final branch cards remain.

**Implementation note (2026-05-12):** Validation route is `GET
/project-media/:projectId/validate-preview-assets?folderPath=...&itemId=...`,
returning `{ canFastPath, canColdFallback, blocked, latent, snapshots, missing,
frozenComplete }`. T2V skips snapshot validation entirely.

Gallery card warning badge implemented via `grid.el.setPreviewAssetsWarning(
groupId, state)` where state is `null` / `{ mode: 'fallback', missing? }` /
`{ mode: 'blocked', missing? }`. Re-applied inside `_rerenderJustified` so
debounced rebuilds don't drop badges. Blocked variant adds a CSS modifier
that hides the Continue/Finish action row; user recovers by deleting.

Cold-fallback branching matches user direction:
- **Continue** with `canColdFallback` reruns stage-1 (`previewOnly: true`,
  `replaceItemId: previewId`) to rebuild the project latent in place. A
  one-shot `gallery:item-updated` listener for that group reads the refreshed
  `previewAssets.latent` and auto-enqueues the stage-2 branch with the new
  filename — two ComfyUI jobs, one user gesture.
- **Finish** with `canColdFallback` enqueues a SINGLE submission: the full
  base `_ms` workflow with `previewOnly: false` + `replaceItemId: previewId`,
  no `isStage2` swap, no `LoadLatent` override. Workflow runs stage-1
  through stage-2 fused (as if user never enabled Preview), result replaces
  the preview card.

Side-fix in same step: preview card selection was over-restricted — bare
click and shift/ctrl/right-click all returned early before reaching the
selection branches. Fixed in `MpiGalleryGrid._makeCard` so only the
bare-click "open-group" emit is suppressed; modifier-clicks now reach
`_rangeSelect`/`_toggleSelect` and right-click reaches the context menu.

Cold-fallback Continue's stage-1 rerun reads the preview's own
already-materialized snapshot files; `copySnapshotSource` gained a same-path
guard so `fs.copy` doesn't error when source path and target path coincide.

WAN dual-LoRA caveat documented in `docs/comfy.md`: cold fallback reruns
stage-1 with **current** LoRA settings (not the `loraSnapshot` recorded at
preview time). Snapshot is informational only.

**Files touched:**
- `routes/projects.js` — new validation route + same-path guard in
  `copySnapshotSource`.
- `js/services/projectService.js` — `validatePreviewAssets(itemId)` wrapper.
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.{js,css}` —
  assets-badge element, `setPreviewAssetsWarning` API, fallback/blocked CSS
  modifiers, render reapply, selection gate fix.
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — validation
  kick on mount + `gallery:item-updated`; cold-fallback routing for Continue
  (stage-1 rerun → auto-chain stage-2) and Finish (single full `_ms` with
  `replaceItemId`).
- `.claude/rules/comfy_injection.md`, `.claude/rules/component-comfy.md`,
  `.claude/rules/component-events.md`, `docs/project-integrity.md`,
  `docs/comfy.md` — documentation sync (step 4).

### 4. [x] Documentation and rules sync

Update the Comfy injection rules, project integrity docs, and component Comfy
docs to describe `Is_Continue`, `LoadLatent`, preview support assets, branching
Continue, missing-assets behavior, and WAN low-LoRA branching. Keep the LTX note
generic: LTX will use the same latent-backed multi-stage contract later, but this
plan does not implement LTX workflows.

Documentation scope:
- `.claude/rules/comfy_injection.md`: add `Is_Continue`, `LoadLatent`, and the
  latent-backed multi-stage authoring contract.
- `.claude/rules/component-comfy.md`: document what Gallery/PromptBox pass into
  multi-stage workflows and that Continue now branches.
- `docs/project-integrity.md`: document preview support assets, sidecar fields,
  branch-final behavior, and Discard cleanup.
- `docs/comfy.md` or the relevant Comfy integration section: document the WAN
  tutorial-facing behavior: high LoRAs are baked into stage-1 latent; low LoRAs
  can be changed before Continue for final-stage variations.
- `.claude/mpi-kanban/kanban.md`: keep the LTX backlog entry as future work only.

**Verify:** Read the updated docs and confirm they state: T2V and I2V are both
supported, Continue branches into new final cards, WAN high LoRAs are baked into
the latent, WAN low LoRAs stay live, and LTX remains future workflow integration.

**Implementation note (2026-05-12):**
- `.claude/rules/comfy_injection.md` — added "Preview support-asset
  validation + cold fallback" section under the LoadLatent injection
  contract; covers fast/fallback/blocked routing and the same-path copy
  guard.
- `.claude/rules/component-comfy.md` — Preview → Continue/Finish block
  extended with the validation kick, fallback branches, blocked badge, and
  preview-card selection rule.
- `.claude/rules/component-events.md` — `MpiGalleryGrid` `preview:continue`
  / `preview:finish` event descriptions rewritten with fast/fallback/blocked
  routing; new public API `el.setPreviewAssetsWarning(groupId, state)`
  documented; preview-stage selection note added.
- `docs/project-integrity.md` — `previewAssets` field gained shape +
  validation report + cold-fallback semantics + delete cleanup contract.
- `docs/comfy.md` — new "WAN multi-stage: baked vs live LoRAs" subsection
  with cold-fallback caveat (current LoRAs replayed, not `loraSnapshot`).
- LTX kanban backlog entry already noted two-file convention + Finish-only
  preview card (step 2); kept generic and not modified in step 4.
