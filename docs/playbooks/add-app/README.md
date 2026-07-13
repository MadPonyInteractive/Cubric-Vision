# Add a New App — End-to-End Playbook

> The single procedure for wiring a new **App** (outcome app) into Cubric Vision. This
> README is the orientation hub + the master checklist; the deep reference is split across
> the section files below. **Read this file first, then the section for the step you're on.**
>
> Enforced by the `/mpi-add-app` skill. A handoff assumes this playbook — it does not replace it.
>
> An App is an OVERLAY, not a workspace: a dev-gated **App Library** lists apps; opening one
> shows an **App overlay** that collects inputs and runs a workflow through the EXISTING
> generation queue — the result lands as normal gallery card(s). Workspaces stay
> **Landing / Gallery / History**; never call the App Library or an App a workspace.
>
> **Apps are NOT version-bumped** as such, but a NEW operation IS registered in the op
> registries (`appVersionIntroduced` = current APP_VERSION). Reusing an existing app op
> touches no registry.

Worked example throughout: **Video Stitch** (MPI-259) — a NO-MODEL video utility (loads
up to 2 video paths + an optional audio track, stitches side-by-side, saves). **SDXL 4K**
(multi-model, polymorphic image I/O, multi-output) and **Image Regen** (first app, single
model, image-in→image-out) are the other worked examples.

## Sections — read on demand, not all at once

> **Read THIS hub in full; open a section file only when you reach its step.** The table
> routes each topic to its file. A media-free app never needs `02`'s slot machinery; a
> no-model app skips the model-guard notes.

| File | Covers |
|---|---|
| [01-descriptor-and-ops.md](01-descriptor-and-ops.md) | The `AppDef` in `appsRegistry.js`; the op in **4 files**; no-model vs multi-model apps; the uiComponent (optional) |
| [02-media-io.md](02-media-io.md) | Polymorphic media slots; **path-reading input nodes** (MpiLoadImageFromPath / MpiString-video / MpiLoadAudioFromPath); injection routing; self-gating outputs; multi-output capture; the **audio-slot mediaType + filter traps** |
| [03-storage-and-reuse.md](03-storage-and-reuse.md) | App input files → **`.preview-assets`** store (not the gallery); sidecar `appId`/`appInputs`; reuse routing |
| [04-overlay-and-shell.md](04-overlay-and-shell.md) | `MpiBaseApp` / `MpiAppLibrary`; install progress; Ctrl+Enter runs the open app; overlay z-order + the spared status bar; dev-gate |
| [05-verify.md](05-verify.md) | Definition of Done — inject test, node --check, live run (video/audio/multi-output), reuse |

The **cross-cutting workflow machinery** (the MpiNodes pack, the injector target list, the
`Input_*`/`Output_*` title law) is shared with the model system and lives in
[../../workflow-authoring/README.md](../../workflow-authoring/README.md). Read it when you
author the graph or add a new injectable node.

## 0. Decide the app's SHAPE first

Three forks decide everything downstream:

1. **Model or no model.** `requiredModels` on the `AppDef`:
   - **No model** (Video Stitch) — `requiredModels: []`. Always available, no install gate.
     A pure utility (stitch/resize/mux) that runs on VHS/Mpi nodes with no diffusion.
   - **Single/multi model** — list MODEL ids. Availability = every id installed; the App
     Library Install button drives each model's own dep download. See [01](01-descriptor-and-ops.md).
2. **Inputs.** Apps are input-agnostic: a prompt, image(s), video(s), audio, a gizmo, or
   **nothing** (just Run). Declared in `inputSchema` — media slots in `inputSchema.media`,
   other controls via the app's `uiComponent`. Media is NEVER a hard requirement in v1, but
   an app that declares slots and gets none (and no prompt) is empty-run-guarded. See [02](02-media-io.md).
3. **Output type.** `mediaType` on the `AppDef` (`'image'|'video'`) — the OUTPUT type, always
   required. Multi-output = N results of ONE mediaType (mixed image+video in one run is
   explicitly NOT supported). See [02](02-media-io.md).

## 0a. Author & prove the workflow in the LOCAL ComfyUI FIRST

Build and prove the ComfyUI graph in standalone local ComfyUI before any app wiring. **All
app-touched input/output nodes are path-reading** (see [02](02-media-io.md)) and self-gate on
empty input. The in-app engine run is the second gate — a workflow that works in the browser
but not the app is an APP-SIDE bug (injection/routing), not a workflow bug (MPI-259 audio).

## The traps that actually bite (all detailed in the section files)

| trap | where |
|---|---|
| **Audio slot mediaType is the string `'audio'`**, NOT `MEDIA_TYPE.VIDEO` (the enum has no AUDIO). Wrong type → the role-first match fails → `Input_audio` never injected → output keeps the source's own audio | [02](02-media-io.md) |
| **`filterMediaInputsForModel` drops every `'audio'` slot** unless the model has `capabilities.audio`. A no-model App (`model:null`) would lose its audio slot — the filter now keeps ALL slots when there's no model | [02](02-media-io.md) |
| App input nodes read a **filesystem PATH** (MpiLoadImageFromPath `.string`, MpiString-video `.string`, MpiLoadAudioFromPath `.string`), NOT a ComfyUI input-dir upload name. The injector routes them through the path-resolve branch by **title pattern** (`/^input_(video\|audio\|image)(_\d+)?$/i`) + class | [02](02-media-io.md) |
| Capture is **prefix-match** (`Output_Image*` / `Output_video*`) so numbered siblings qualify; `output_audio` + `output_preview` stay EXACT | [02](02-media-io.md) |
| Outputs **self-gate in the workflow** (empty path → ExecutionBlocker) → capture-what-ran drops them → NO app-side `outputSchema`. Placeholder count is ONE (real 1..N land on complete) | [02](02-media-io.md) |
| App input files go to **`Media/.preview-assets/`** (content-addressed, deduped), NOT the gallery. Durable so Reuse resolves them; gallery stays clean | [03](03-storage-and-reuse.md) |
| Reuse needs `appId`+`appInputs` on BOTH the sidecar AND the live in-memory item — the sidecar for restart, the live item for same-session reuse | [03](03-storage-and-reuse.md) |
| Ctrl+Enter must run the OPEN app, not the PromptBox behind it. Both handlers fire (bind is all-handlers) → the PromptBox's own `generation.run` bails while `.mpi-base-app` is live | [04](04-overlay-and-shell.md) |
| A modal opened over an open app (error dialog) gets a z-floor above `--app-overlay-z` or its backdrop renders UNDER the app overlay | [04](04-overlay-and-shell.md) |
| The `main-area` App overlay spares `#shell-info-bar` but stashing `#tool-container` collapses the sticky bar to the top — pin it `absolute; bottom:0` while `.main-area--app-overlay` is set | [04](04-overlay-and-shell.md) |
| `operation_registry.json` is a hand-maintained superset — **never regenerate** (strips `universal` flags) | [01](01-descriptor-and-ops.md) |

## Hard rules

- **Never hand-edit a workflow JSON.** Titles/values change in ComfyUI, then re-export.
- **All app-touched input/output nodes are path-reading + self-gating.** Don't reintroduce
  input-dir `LoadImage`/`LoadAudio` — they can't self-gate and need upload-name injection.
- If the user tells you something this playbook already covers, that is a **playbook failure
  or a reading failure** — figure out which, and fix the playbook if it's the former. Do not
  let the knowledge live only in the conversation.
- Dev-gate (`APP_CONFIG.dev_mode = BUILD_HASH === 'dev'`) stays until **≥4 apps** exist (user
  decision). A staged (non-dev) build hides both entry points automatically.

## Checklist (copy per app)

- [ ] **READ THIS PLAYBOOK FIRST.** A handoff assumes it, does not replace it.
- [ ] Decide shape: model / no-model; inputs (media/prompt/gizmo/none); output mediaType — this file
- [ ] Author + prove the workflow in LOCAL ComfyUI. All input/output nodes path-reading + `Input_*`/`Output_*` titled — [02](02-media-io.md)
- [ ] Register the op in **4 files**: `commandRegistry.js` (`universal:true`, mediaType, mediaInputs with `Input_*` titles + correct per-slot mediaType — **audio = `'audio'`**), `universal_workflows.js`, `operationRegistry.js`, `operation_registry.json` (hand-maintained superset) — [01](01-descriptor-and-ops.md)
- [ ] Add the `AppDef` in `appsRegistry.js` (`requiredModels` = MODEL ids or `[]`; `inputSchema.media` slot groups; `mediaType`; `uiComponent` name or omit) — [01](01-descriptor-and-ops.md)
- [ ] Media roles in `inputSchema.media[].roles` MATCH the op's `mediaInputs` keys — [02](02-media-io.md)
- [ ] uiComponent (controls only)? Register CSS in `preloadStyles.js`, props in `types.js`, map NAME→blueprint in the shell `app:open` handler. **Omit for a media-only app** (BaseApp renders slots) — [01](01-descriptor-and-ops.md), [04](04-overlay-and-shell.md)
- [ ] Add a case to `tests/inject-params-titles.test.cjs` (assert every `Input_*`/`Output_*` title exists) — [05](05-verify.md)
- [ ] Verify: inject test green, `node --check`, live run (each media type + multi-output), reuse across restart — [05](05-verify.md)
- [ ] NO app version bump for the app itself; a NEW op sets `appVersionIntroduced` in both op registries

## Files (the app subsystem)

- `js/data/appsRegistry.js` — registry + availability
- `js/services/appService.js` — `submitAppGeneration`, `openAppFromReuse`
- `js/components/Compounds/LandingPages/MpiAppLibrary/` — the picker overlay
- `js/components/Organisms/MpiBaseApp/` — the App frame (renders media slots, Run, result pane)
- `js/components/Organisms/MpiAppImageRegen/` — the first app's controls (reused by SDXL 4K)
- `comfy_workflows/App_*.json` / `app_*.json` — app workflows (case-insensitive resolver)
- `state.s_appInputs` — session-only per-app input snapshot
