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
  mediaType,      // 'image' | 'video'
  inputSchema,    // what the uiComponent collects → injected into the workflow
}
```

`appAvailability(app)` → `{ available, missing[] }`: available = every `requiredModels` id ∈
`state.s_installedModelIds`. The Install button drives each missing model's OWN dep download
(`getModelDependencies(id)` → `downloadService.start(id, deps)`) — apps declare **models, never deps**
(zero dep duplication).

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
- `js/components/Organisms/MpiAppImageRegen/` — the first app's controls
- `comfy_workflows/App_sdxl_regen.json` — the first app's workflow
- `state.s_appInputs` — session-only per-app input snapshot (`.claude/rules/component-state.md`)
