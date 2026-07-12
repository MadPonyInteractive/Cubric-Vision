# Apps — outcome apps (App Library + App overlays)

> **MPI-256.** Higgsfield-style "outcome apps": a dev-gated **App Library** overlay lists
> apps; opening one shows an **App overlay** that collects inputs and runs a workflow
> through the EXISTING generation queue — the result lands as a normal gallery card.
> Apps are OVERLAYS, not workspaces — Landing/Gallery/History remain the only workspaces.

## Naming law

Workspaces stay **Landing / Gallery / History**. "App Library" and "App" are **overlays**.
Never call them workspaces (no `PAGE_*`, no router change).

## The flow

```
Gallery → (dev-gated) radial "Apps" | Landing "Apps" nav → apps:open
  → MpiAppLibrary overlay (grid + availability badges)
    → card → detail slide-over (description + required-models install state + Open/Install)
      → Open → app:open {appId} → MpiAppLibrary closes, MpiBaseApp opens
        → upload image + fill controls → Run → submitAppGeneration → EXISTING queue
          → result lands as a gallery card (also shown in the App's result pane)
```

## Components

| Component | Tier | File | Role |
|---|---|---|---|
| `MpiAppLibrary` | Compound | `js/components/Compounds/LandingPages/MpiAppLibrary/` | Dev-gated picker overlay (clone of MpiModelManager skeleton, stripped to app scope). Body-mode MpiOverlay, tile grid + availability badge, detail slide-over with Open/Install. |
| `MpiBaseApp` | Organism | `js/components/Organisms/MpiBaseApp/` | Shared App frame (COMPOSITION, not inheritance). `main-area` MpiOverlay; header + Back, source-image upload, content slot, Run, result pane (shows live latent + final). |
| `MpiAppImageRegen` | Organism | `js/components/Organisms/MpiAppImageRegen/` | First app's controls-only component (a prompt textarea + `el.getInputs()`), mounted into MpiBaseApp's content slot. |

`MpiBaseApp` and `MpiAppLibrary` both use the **MpiOverlay primitive** (`appendToContainer`),
same as MpiModelManager — they do NOT reimplement the overlay.

## Registry — `js/data/appsRegistry.js`

Single self-contained file (app count is tiny). `APPS` array of `AppDef` + helpers
`listApps` / `getAppById` / `appAvailability`. **Read-only over `state.s_installedModelIds`** —
apps have NO disk-presence concept of their own, so there is deliberately NO install-sync
machinery here (do not cargo-cult it from modelRegistry).

### AppDef contract

```js
{
  id,             // unique
  title,          // card + slide-over
  preview,        // filename under comfy_workflows/display/
  description,    // slide-over copy
  requiredModels, // MODEL ids (NOT dep ids) — drives the availability badge + install list
  operation,      // universal-op key (commandRegistry.js)
  workflow,       // ComfyUI workflow filename (universal_workflows.js)
  uiComponent,    // per-app component NAME (string; shell maps name → blueprint)
  mediaType,      // 'image' | 'video' — the OUTPUT type (always present; see below)
  inputSchema,    // what the uiComponent collects → injected into the workflow (may be empty of media)
}
```

## Flexible inputs (MPI-259)

**Apps are input-agnostic.** An app may take an image, a video, an audio clip, several of
those, a text prompt, a gizmo (mask paint, a slider panel, anything), or **nothing at all** —
just a Run button. There is no hard "source image" requirement. `MpiBaseApp` is a generic HOST:

- It renders the **source-media upload slot ONLY when `inputSchema` declares `mediaItems`**
  (`'mediaItems' in app.inputSchema`, `_appNeedsMedia` in MpiBaseApp). A media-free app (t2i,
  gizmo, mask-paint) shows no upload slot, and Run does not block on an uploaded item.
- All other controls come from the app's **uiComponent** (mounted into BaseApp's content slot),
  which exposes `el.getInputs()` → whatever fields the app collects. BaseApp merges those with any
  uploaded media and hands the lot to `submitAppGeneration`.
- `_buildParams` always injects `Input_Positive` / `Input_Negative` / `Input_Seed` from the config;
  an app that wants none simply omits a prompt control and bakes those nodes' values in the workflow
  (or leaves them empty). Media slots come from the op's `mediaInputs` — an empty array injects none.

**The one constant is OUTPUT.** Every app produces **≥1 image or video** (possibly N — multi-output
is a plan-D follow-up). `mediaType` on the AppDef is the output type and is always required. Output
flows through the existing generation queue and lands as gallery card(s), so BaseApp needs no output
config.

### Polymorphic media slots (MPI-259)

`inputSchema.media` is an array of media-slot GROUPS; BaseApp renders each generically:

```js
inputSchema: {
  positive: 'string',
  media: [
    { type: 'image', mode: 'upto', max: 2, roles: ['image1', 'image2'] },
  ],
}
```

- `type`: `'image' | 'video' | 'audio'`. `mode: 'upto'` = dynamic-until-cap (an empty drop zone
  "Drop up to N…" appears until `max` slots are filled; `'fixed'` is treated as `'upto'` for now).
  `max` = cap. `roles` (length === max) = the role key assigned to the i-th filled item BY POSITION
  (models reference by index; roles re-assign on removal). Each `role` must match a `key` in the op's
  `mediaInputs` so the injector maps the item to its `Input_*` node.
- Each drop zone accepts DROP or click-to-browse (multi-select); over-cap files are dropped +
  `clientLogger.warn`. Filled slots are numbered, show a thumb (image) / filename (video/audio) +
  a remove button. No `media` key → no upload UI (media-free app). Media is NEVER a Run blocker in v1.
- Empty optional slots inject nothing for that title → the workflow's own gating node self-blocks that
  branch (see "Self-gating outputs" below). Audio empties keep the LoadAudio placeholder; image/video
  empties leave an empty path so the path-reading node's `ExecutionBlocker` fires.
- **Image slots use `MpiLoadImageFromPath`** (an MpiNode), NOT the old input-dir `LoadImage`. It reads a
  filesystem PATH from its `string` input. So `_inject` writes the resolved path into `.string`, and the
  injector routes any image param whose target node `class_type === 'MpiLoadImageFromPath'` through the
  media PATH-RESOLVE branch (`_resolveMediaPath` locally, `_uploadRemoteMedia` → Pod-absolute path on
  remote) — the same branch video/audio use — NOT the input-dir upload-name branch. This is class-based:
  legacy `LoadImage` workflows keep the upload-name path until migrated; migrating a node to
  `MpiLoadImageFromPath` auto-flips it with no injector change.
- `_inject` writes the right widget per node class (MpiLoadImageFromPath→`.string`, LoadAudio→`.audio`,
  MpiString-video→`.value`); media-kind is forced by title PATTERN (`/^input_(video|audio|image)(_N)?$/i`)
  so lowercase/numbered slots resolve + upload on remote.

### Self-gating outputs (MPI-259)

Apps do **no app-side output gating**. Every media type self-gates INSIDE the workflow, so the capture
path simply keeps what the run actually emitted (`executed` events) — a gated-off output emits nothing
→ no card. The MpiNodes that do it:

| Node | Gates | How |
|---|---|---|
| `MpiLoadImageFromPath` | image | empty/missing path → `ExecutionBlocker` → its `Output_Image*` branch never runs |
| `MpiBlockIfEmpty` | any | passes a value through, blocks downstream if it is empty |
| `MpiAnyChecker` | any | passes value + a `has_value` boolean to drive `MpiIfElse` |
| `MpiHasAudio` | audio | boolean: does the loaded media carry an audio track |
| `MpiIfElse` | video (+ any) | boolean branch — no `Input_video_2` path → `Output_video_2` never runs |

So App_sdxl_4k's three `Output_Image*` nodes: `Output_Image` always runs, `Output_Image_2` / `Output_Image_3`
run only when their `Input_Image` / `Input_Image_2` path is present. No `outputSchema.when` needed.

### Multi-output (MPI-259)

A multi-output app captures every `Output_<Type>*` node's result as its own gallery card (capture
filter is prefix-match: `Output_Image` / `Output_Image_2` / `Output_video_2` all qualify). **The kept
count is only known at completion.** Outputs self-gate on input presence (see "Self-gating outputs"), so
the app declares NO fixed count — `submitAppGeneration` allocates exactly ONE "Generating…" placeholder
(the engine emits one live latent at a time, so one in-progress card is all that's honest), and the
capture-what-ran path lands the real 1..N cards on `generation:complete`. The in-app result pane shows
ALL that landed. One mediaType per app (no mixed image+video in a single run).

To extend inputs (a new gizmo): add it to the app's uiComponent and declare it in `inputSchema`.

`appAvailability(app)` → `{ available, missing[] }`: available = every `requiredModels` id ∈
`state.s_installedModelIds`. The Install button drives each missing model's OWN dep download
(`getModelDependencies(id)` → `downloadService.start(id, deps)`) — apps declare **models, never deps**
(zero dep duplication).

### Install progress (MPI-259)

The detail footer has three states: **Install models** (missing, idle) → **aggregated % bar + Cancel**
(installing) → **Open** (all installed). The bar is a single aggregate across ALL `requiredModels`:
installs are SERIAL (downloadService serializes the queue), so N models each own **1/N** of the bar —
installed → 1, the one live download → its `job.progress`, queued → 0; overall = mean
(`_installProgress` in MpiAppLibrary). **Cancel = cancel-all** (`_cancelInstall` cancels every
in-flight required model). The bar ticks on `download:progress` via a light `_patchProgress` (updates
width/pct only, no footer rebuild); state transitions (`download:started`/`complete`/`cancelled`)
rebuild the footer so the button swaps Install↔Cancel↔Open. It reuses the Model Library's
`.mpi-tile__prog` bar (MM.css, always preloaded); the App footer stacks column-wise so the bar is a
full-width row above Cancel.

## Run path — `js/services/appService.js`

`submitAppGeneration(app, inputs, callbacks)` is a second producer into the queue, exactly like
the History block's universal tool ops:

- Pre-flight **MODEL guard** (universal ops have none) — missing → `ui:warning`, abort before enqueue.
- Config: `model: {id:null, mediaType}`, **no `getNextGeneration`** (arming the loop would re-fire),
  `forceLocal` only when `state.engineOverride === 'local'`.
- **RUN CLEAN**: app gens inject NO project LoRAs. By construction — commandExecutor gates all
  LoRA/upscale injection on `if (payload.modelId)`, and app gens pass `model.id === null`.
- **placeholderGroup** in opts → the gallery shows a live "Generating…" card (source image as
  input-preview) while the job runs. Returns `{ ...enqueueResult, tempId }` so MpiBaseApp can match
  the job's live latent previews (`generation:preview {id}` → `activeGenerations.get(id).tempId`).

`openAppFromReuse(item)` — Reuse routing (see below).

## Sidecar provenance (Reuse)

App gens add TWO additive top-level fields to the `.meta` sidecar: **`appId`** + **`appInputs`**
(the input snapshot at Run time; media by reference, never base64). Plumbed at the save site
(`generationService` save-generation ~:988) AND on the **live in-memory item** (`baseProps` ~:1005 →
`createImageItem`) — both are required: the sidecar survives restart (reconciler hydrates it on load),
the live item makes Reuse work in the SAME session before any reload. Parity `appId:null`/`appInputs:null`
defaults exist on every non-app item factory + synthetic/upload/crop paths.

## Reuse routing

Reuse on an app card reopens the **App** with its inputs restored, NOT the PromptBox.
`openAppFromReuse(item)` (shared by Gallery + History `_applyPromptReuse`, called at the TOP,
above the `_pb` guard and History's cross-mediaType reject):

- unknown/no `appId` → returns false, normal reuse continues.
- missing required model → `ui:warning` + `apps:open` (route to Library to install).
- else → seed `state.s_appInputs[appId] = item.appInputs` (BEFORE emit) + emit `app:open` **on the
  next tick** (`setTimeout(…,0)`) — the reuse popup's teardown fires a bare `ui:close-all-popups`
  that would otherwise hide the just-opened App. `itemHasReusablePrompt` also returns true for
  `item.appId` so the Reuse button renders on app cards.

## Overlay z-order

`MpiBaseApp` uses MpiOverlay `mountTarget:'main-area'` (covers `#tool-container` + `#prompt-box-mount`,
spares the sticky `#shell-info-bar` so the status bar + queue stay live). The queue slide-over rides
ABOVE the app overlay via `--app-overlay-z` (`.mpi-slide-over--queue { z-index: calc(var(--app-overlay-z,90)+10) }`).

## Adding an app (checklist)

> **The workflow machinery is shared** — the MpiNodes pack, the injector target list,
> the `Input_*`/`Output_*` title law, and the template→runtime generator/tier patterns
> are all model/app-agnostic and live in
> [workflow-authoring/README.md](workflow-authoring/README.md). Read it for step 2 below;
> this checklist only covers the app-specific glue.

1. **Register the universal op** in 4 files (see `docs/playbooks/add-model/04-ops-and-controls.md` §11 for the title laws):
   `commandRegistry.js` (`universal:true`, mediaType, mediaInputs with `Input_*` titles),
   `universal_workflows.js`, `operationRegistry.js`, and `operation_registry.json`
   (**hand-maintained superset — never regenerate from JS, it strips the `universal` flags**).
2. **Author the workflow** `comfy_workflows/App_<name>.json`: all app-touched nodes `Input_*`/`Output_*`
   (MPI-116), output capture title per the tier-2 law, both-engine compatible loaders. Add a case to
   `tests/inject-params-titles.test.cjs`.
3. **Descriptor** in `appsRegistry.js` APPS (`requiredModels` = MODEL ids).
4. **uiComponent** (controls only) — an Organism rendering into MpiBaseApp's content slot, exposing
   `el.getInputs()`. Register its CSS in `preloadStyles.js` + props in `types.js`. Map its NAME →
   blueprint in the shell `app:open` handler.
5. Dev-gate stays until **≥4 apps** exist (user decision).

## Known limits

- **Dev-gated** (`APP_CONFIG.dev_mode = BUILD_HASH === 'dev'`) until ≥4 apps exist. A staged build
  hides both entry points automatically.
- **No hot-store for universal ops** (accepted for v1 — the first app uses a small model).
- App overlay UI is intentionally minimal — a dedicated design pass is deferred.

## Files

- `js/data/appsRegistry.js` — registry + availability
- `js/services/appService.js` — `submitAppGeneration`, `openAppFromReuse`
- `js/components/Compounds/LandingPages/MpiAppLibrary/` — the picker overlay
- `js/components/Organisms/MpiBaseApp/` — the App frame
- `js/components/Organisms/MpiAppImageRegen/` — the first app's controls (reused by the 2nd app)
- `comfy_workflows/App_sdxl_regen.json` — the first app's workflow (image-in → image-out)
- `comfy_workflows/App_sdxl_4k.json` — the 2nd app's workflow (t2i, multi-model, media-free; MPI-259)
- `state.s_appInputs` — session-only per-app input snapshot (`.claude/rules/component-state.md`)
