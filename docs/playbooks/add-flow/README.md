# Add a New Flow — End-to-End Playbook

> The single procedure for wiring a new **Flow** (outcome flow) into Cubric Vision. This
> README is the orientation hub + the master checklist; the deep reference is split across
> the section files below. **Read this file first, then the section for the step you're on.**
>
> Enforced by the `/mpi-add-flow` skill. A handoff assumes this playbook — it does not replace it.
>
> A Flow is an OVERLAY, not a workspace: a dev-gated **Flow Library** lists flows; opening one
> shows a **Flow overlay** that collects inputs and runs a workflow through the EXISTING
> generation queue — the result lands as normal gallery card(s). Workspaces stay
> **Landing / Gallery / History**; never call the Flow Library or a Flow a workspace.
>
> **Flows are NOT version-bumped** as such, but a NEW operation IS registered in the op
> registries (`appVersionIntroduced` = current APP_VERSION). Reusing an existing flow op
> touches no registry.
>
> **Cross-cutting reference:** skim [../common/README.md](../common/README.md) first —
> the hard rules, raw→API sync, op registration, inject-title guard, and output-capture
> naming law are shared with the add-model playbook and have their canonical detail there.
> This playbook's inline notes override the shared files where they diverge (notably: flow
> workflows route through a case-insensitive middleware, so the all-lowercase law does NOT
> apply here).

Worked example throughout: **Video Stitch** (MPI-259) — a NO-MODEL video utility (loads
up to 2 video paths + an optional audio track, stitches side-by-side, saves). **SDXL 4K**
(multi-model, polymorphic image I/O, multi-output) and **Image Regen** (first flow, single
model, image-in→image-out) are the other worked examples.

## Sections — read on demand, not all at once

> **Read THIS hub in full; open a section file only when you reach its step.** The table
> routes each topic to its file. A media-free flow never needs `02`'s slot machinery; a
> no-model flow skips the model-guard notes.

| File | Covers |
|---|---|
| [01-descriptor-and-ops.md](01-descriptor-and-ops.md) | The `FlowDef` in `flowsRegistry.js`; the op in **4 files**; no-model vs multi-model flows; DECLARED `fields`, a step's `param` bind, and why no BESPOKE component (every field still mounts a Primitive) |
| [any-of-models.md](any-of-models.md) | Model SLOTS — a flow declares a role and the user picks which model fills it (MPI-590/599). The resolver helpers, `modelParams` (what carries the pick into the graph), why the picker offers models the user has not installed, and why `modelFamily` is the wrong field |
| [blending-into-a-photo.md](blending-into-a-photo.md) | **Any flow that puts a generated thing into the user's own photo** (MPI-567, MPI-596) — why relighting cannot happen inside a crop, why every localised crop/stitch leaves a visible rectangle whatever the model, the whole-image-relight → composite-back route that fixes it, how to MEASURE the rectangle, and the generic blend prompt with its conditional shadow physics |
| [02-media-io.md](02-media-io.md) | Polymorphic media slots; **path-reading input nodes** (MpiLoadImageFromPath / MpiString-video / MpiLoadAudio); injection routing; self-gating outputs; multi-output capture; the **audio-slot mediaType + filter traps** |
| [03-storage-and-reuse.md](03-storage-and-reuse.md) | Flow input files → **`.preview-assets`** store (not the gallery); sidecar `flowId`/`flowInputs`; reuse routing |
| [04-overlay-and-shell.md](04-overlay-and-shell.md) | `MpiBaseFlow` / `MpiFlowLibrary`; a Ready tile skipping the drawer; install progress; Ctrl+Enter runs the open flow; overlay z-order + the spared status bar; dev-gate |
| [ui/result-pane.md](ui/result-pane.md) | The result pane: `result.compare`, the video player every single-video result gets, and surviving close -> reopen |
| [05-verify.md](05-verify.md) | Definition of Done — inject test, node --check, live run (video/audio/multi-output), reuse |
| [06-preview-image.md](06-preview-image.md) | The flow's graphics — the 4/5 tile still + the wide autoplaying hero clip; which device to use for which kind of change; the ffmpeg/`sharp` recipes and their silent traps. **Run `/mpi-flow-graphics`**, which enforces it |

Two folders sit alongside the numbered sections:

| Folder | Holds |
|---|---|
| [ui/](ui/README.md) | **PORTABLE** flow UI/UX — the frame, its declared fields and step gizmos (box gizmo, baseline rules). Read before any flow UI work; promote generalisable decisions INTO it |
| [existing-flows/](existing-flows/) | **SPECIFIC** — one file per flow: its shape, decisions, and dead ends. Read the relevant one before touching that flow |

The **cross-cutting workflow machinery** (the MpiNodes pack, the injector target list, the
`Input_*`/`Output_*` title law) is shared with the model system and lives in
[../../workflow-authoring/README.md](../../workflow-authoring/README.md). Read it when you
author the graph or add a new injectable node.

## 0. Decide the flow's SHAPE first

Three forks decide everything downstream:

1. **Model or no model.** `requiredModels` on the `FlowDef`:
   - **No model** (Video Stitch) — `requiredModels: []`. Always available, no install gate.
     A pure utility (stitch/resize/mux) that runs on VHS/Mpi nodes with no diffusion.
   - **Single/multi model** — list MODEL ids. Availability = every id installed; the Flow
     Library Install button drives each model's own dep download. See [01](01-descriptor-and-ops.md).
   - **Choosable slot** — a `{ label, models }` entry means the user picks which model fills
     that role, from a labelled dropdown in the slide-over, installed or not. A flow may have
     several, resolved independently. It needs `modelParams` too, or the pick reaches nothing.
     See [any-of-models.md](any-of-models.md).
2. **Inputs.** Flows are input-agnostic: a prompt, image(s), video(s), audio, a gizmo, or
   **nothing** (just Run). Declared in `inputSchema` — media slots in `inputSchema.media`,
   other controls DECLARED in `fields` (never a JS component). Media is NEVER a hard requirement in v1, but
   a flow that declares slots and gets none (and no prompt) is empty-run-guarded. See [02](02-media-io.md).
3. **Output type.** `mediaType` on the `FlowDef` (`'image'|'video'|'audio'`) — the OUTPUT type,
   always required. Multi-output = N results of ONE mediaType (mixed image+video in one run is
   explicitly NOT supported). See [02](02-media-io.md).
   - **`'audio'` (MPI-573, first shipped by Voice Changer in MPI-607)** — the graph titles its
     SaveAudio node `Output_Audio`, which is the SAME title a video's soundtrack side-channel
     uses; the declared `mediaType` is the only thing telling the two apart. `generationService`
     promotes that side-channel to the run's primary output when, and only when, the op declares
     audio. See [existing-flows/voice-changer.md](existing-flows/voice-changer.md).

## 0a. Author & prove the workflow in the LOCAL ComfyUI FIRST

The raw→API sync procedure (author locally first, `sync-raw-workflows.mjs`, the
`validate-injection-rules.mjs` gate, `raw/` writable but LiteGraph-only, staged output) is
**[shared] — canonical in [../common/workflow-authoring-entry.md](../common/workflow-authoring-entry.md).**
Flow-specific notes:

- Drop the raw graph in `comfy_workflows/raw/<Name>.json` (a **bare** name → a direct
  runtime file — the flow case; a `_template` suffix would route to a generator).
- Filenames route through a case-insensitive middleware (`routes/workflowStatic.js`), so
  the all-lowercase model law does NOT apply — keep whatever case the user exported.
- **All flow-touched input/output nodes are path-reading** (see [02](02-media-io.md)) and
  self-gate on empty input. The in-app engine run is the second gate — a workflow that works
  in the browser but not in the app is a FLOW-SIDE bug (injection/routing), not a workflow bug
  (MPI-259 audio).

## The traps that actually bite (all detailed in the section files)

| trap | where |
|---|---|
| **An audio slot's mediaType is `MEDIA_TYPE.AUDIO`**, NOT `MEDIA_TYPE.VIDEO`. Wrong type → the role-first match fails → `Input_audio` never injected → output keeps the source's own audio. (The enum HAS an AUDIO member since MPI-573; older notes saying it must be the bare string `'audio'` predate that and describe the same value) | [02](02-media-io.md) |
| **`filterMediaInputsForModel` drops every `'audio'` slot** unless the model has `capabilities.audio`. A no-model Flow (`model:null`) would lose its audio slot — the filter now keeps ALL slots when there's no model | [02](02-media-io.md) |
| Flow input nodes read a **filesystem PATH** (MpiLoadImageFromPath `.string`, MpiString-video `.string`, MpiLoadAudio `.string`), NOT a ComfyUI input-dir upload name. The injector routes them through the path-resolve branch by **title pattern** (`/^input_(video\|audio\|image)(_\d+)?$/i`) + class | [02](02-media-io.md) |
| Capture is **prefix-match** (`Output_Image*` / `Output_video*`) so numbered siblings qualify; `output_audio` + `output_preview` stay EXACT | [02](02-media-io.md) |
| Outputs **self-gate in the workflow** (empty path → ExecutionBlocker) → capture-what-ran drops them → NO flow-side `outputSchema`. Placeholder count is ONE (real 1..N land on complete) | [02](02-media-io.md) |
| Flow input files go to **`Media/.preview-assets/`** (content-addressed, deduped), NOT the gallery. Durable so Reuse resolves them; gallery stays clean | [03](03-storage-and-reuse.md) |
| Reuse needs `flowId`+`flowInputs` on BOTH the sidecar AND the live in-memory item — the sidecar for restart, the live item for same-session reuse | [03](03-storage-and-reuse.md) |
| Ctrl+Enter must run the OPEN flow, not the PromptBox behind it. Both handlers fire (bind is all-handlers) → the PromptBox's own `generation.run` bails while `.mpi-base-flow` is live | [04](04-overlay-and-shell.md) |
| A modal opened over an open flow (error dialog) gets a z-floor above `--main-overlay-z` or its backdrop renders UNDER the flow overlay | [04](04-overlay-and-shell.md) |
| The `main-area` Flow overlay spares `#shell-info-bar` but stashing `#tool-container` collapses the sticky bar to the top — pin it `absolute; bottom:0` while `.main-area--overlay` is set | [04](04-overlay-and-shell.md) |
| **A value a flow does not DECLARE must not carry its `Input_*` title.** `_buildParams` emits **`Input_Positive`, `Input_Negative` and `Input_Negative_Audio`** on every run (`Input_Negative: negative \|\| ''`, etc.) whatever the flow declares, so any of those three titles on a node the flow leaves undeclared is silently overwritten with an empty string. Head Swap and Outpaint bake their instruction and leave the prompt node untitled; Scribble bakes its negative and titles that node `negative prompt`. **Draw It In shipped the negative half of this bug** — node 19 held a baked negative, the FlowDef declared no `negative` field, and every render it ever made ran with an empty negative, with nothing failing and nothing logged (found MPI-620). Do NOT instead teach the app to skip an empty value — nearly every other graph relies on that empty string to wipe a leftover authoring prompt | [existing-flows/outpaint.md](existing-flows/outpaint.md) |
| `operation_registry.json` is a hand-maintained superset — **never regenerate** (strips `universal` flags) | [01](01-descriptor-and-ops.md) |
| `preview` is **ONE field feeding THREE placements** — tile and detail thumb crop it `4/5 cover`, the in-flow hero shows it at natural aspect. Art composed for the hero gets centre-cropped in the grid with no warning | [06](06-preview-image.md) |

## Hard rules

The two universal hard rules (never hand-edit a workflow JSON; a covered-but-asked
question is a failure) are canonical in [../common/hard-rules.md](../common/hard-rules.md).
Flow-specific additions:

- **All flow-touched input/output nodes are path-reading + self-gating.** Don't reintroduce
  input-dir `LoadImage`/`LoadAudio` — they can't self-gate and need upload-name injection.
- Dev-gate (`APP_CONFIG.dev_mode = BUILD_HASH === 'dev'`) stays until **≥4 flows** exist (user
  decision). A staged (non-dev) build hides both entry points automatically.

## Checklist (copy per flow)

- [ ] **READ THIS PLAYBOOK FIRST.** A handoff assumes it, does not replace it.
- [ ] Decide shape: model / no-model; inputs (media/prompt/gizmo/none); output mediaType — this file
- [ ] Author + prove the workflow in LOCAL ComfyUI. All input/output nodes path-reading + `Input_*`/`Output_*` titled — [02](02-media-io.md)
- [ ] Register the op in **4 files**: `commandRegistry.js` (`universal:true`, mediaType, mediaInputs with `Input_*` titles + correct per-slot mediaType — **audio = `'audio'`**), `universal_workflows.js`, `operationRegistry.js`, `operation_registry.json` (hand-maintained superset) — [01](01-descriptor-and-ops.md)
- [ ] Add the `FlowDef` in `flowsRegistry.js` (`requiredModels` = MODEL ids, `{ label, models }` slots, or `[]`; `inputSchema.media` slot groups; `mediaType`) — [01](01-descriptor-and-ops.md)
- [ ] Media roles in `inputSchema.media[].roles` MATCH the op's `mediaInputs` keys — [02](02-media-io.md)
- [ ] Controls: declare `fields: [...]` on the FlowDef (MPI-531/MPI-572) — the SAME `fields` a step declares, placed on the run slide — the frame renders them, `Input_*` ids route into `injectionParams`. **There is no BESPOKE component surface** (MPI-572 deleted the per-Flow `uiComponent` Organism, which a third-party Flow can never ship) — but every declared field MOUNTS an app Primitive (MPI-582), so a Flow is nothing but components. If a control is not expressible, add a PRIMITIVE plus the FIELD TYPE, never a bare input — [ui/carousel-frame.md](ui/carousel-frame.md) § `fields` is the ONE control surface
- [ ] Does the flow IMPROVE media the user supplied? Declare `result: { compare: '<input role>' }` for the shared before/after surface. Omit when a comparison says nothing (same pixels, or an output that is not the same footage) — [ui/result-pane.md](ui/result-pane.md)
- [ ] Nothing to do for a VIDEO result's player: a single video result mounts MpiVideoViewer + MpiVideoControlBar automatically, with compare (when declared) as a toggle on top — [ui/result-pane.md](ui/result-pane.md) § every video result gets the real player
- [ ] Add a case to `tests/inject-params-titles.test.cjs` (assert every `Input_*`/`Output_*` title exists) — [05](05-verify.md)
- [ ] Verify: inject test green, `node --check`, live run (each media type + multi-output), reuse across restart — [05](05-verify.md)
- [ ] `preview` image: its OWN 4/5 webp under `comfy_workflows/display/`, named for the flow — never a reused model preview, never shared with another flow — [06](06-preview-image.md)
- [ ] NO app version bump for the Flow itself; a NEW op sets `appVersionIntroduced` in both op registries
- [ ] **Announce it: add the flow to BOTH the roster list and its own entry in `docs/releases/UNRELEASED.md`.** The roster enumerates the Library, so a missing name makes an existing entry WRONG. This is the closing agent's debt, not the next session's — `.agents/mpi-kanban/close-out.md` § A NEW FLOW (Scribble shipped with neither, and the notes still said seven flows)

## Files (the flow subsystem)

- `js/data/flowsRegistry.js` — registry + availability
- `js/services/flowService.js` — `submitFlowGeneration`, `openFlowFromReuse`
- `js/components/Compounds/LandingPages/MpiFlowLibrary/` — the picker overlay
- `js/components/Organisms/MpiBaseFlow/` — the Flow frame (renders media slots, Run, result pane)
- `comfy_workflows/flow_*.json` — flow workflows (resolved case-insensitively)
- `state.s_flowInputs` — session-only per-flow input snapshot
