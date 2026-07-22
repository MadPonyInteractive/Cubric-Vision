# 04 — Overlay & Shell

The App overlay frame, the App Library, install progress, the Ctrl+Enter hotkey, and the
overlay/status-bar/z-order gotchas. Read [README](README.md) first.

## Components

| Component | Tier | File | Role |
|---|---|---|---|
| `MpiAppLibrary` | Compound | `js/components/Compounds/LandingPages/MpiAppLibrary/` | Dev-gated picker overlay. Body-mode MpiOverlay, tile grid + availability badge, detail slide-over with Open/Install |
| `MpiBaseApp` | Organism | `js/components/Organisms/MpiBaseApp/` | Shared App frame (COMPOSITION, not inheritance). `main-area` MpiOverlay; header + Back, media slots (from `inputSchema.media`), content slot for a per-app uiComponent, Run, result pane |
| `MpiAppImageRegen` | Organism | `js/components/Organisms/MpiAppImageRegen/` | First app's controls-only component (a prompt textarea + `el.getInputs()`), mounted into MpiBaseApp's content slot. Reused by SDXL 4K |

`MpiBaseApp` and `MpiAppLibrary` both use the **MpiOverlay primitive**; they do NOT reimplement
the overlay.

### The uiComponent is optional

The shell `app:open` handler maps the descriptor's `uiComponent` NAME → blueprint via
`_appComponents[app.uiComponent] || null`. A media-only app omits `uiComponent`; BaseApp renders
the media slots from `inputSchema.media` and mounts no per-app controls. `el.getInputs()` is only
called when a uiComponent exists (`_perApp?.el?.getInputs?.()`).

To add a uiComponent: register its CSS in `preloadStyles.js`, props in `types.js`, and map its
NAME → blueprint in `js/shell.js`'s `_appComponents`.

## The flow

```
Gallery → (dev-gated) Ctrl+Tab dev radial "Apps" | Landing "Apps" nav → apps:open
  → MpiAppLibrary overlay (grid + availability badges)
    → card → detail slide-over (description + required-models install state + Open/Install)
      → Open → app:open {appId} → MpiAppLibrary closes, MpiBaseApp opens
        → fill slots + controls → Run → submitAppGeneration → EXISTING queue
          → result lands as gallery card(s) (also shown in the App's result pane)
```

## Install progress (multi-model)

The detail footer has three states: **Install models** (missing, idle) → **aggregated % bar +
Cancel** (installing) → **Open** (all installed). Installs are SERIAL (downloadService serializes
the queue), so N models each own **1/N** of the bar (`_installProgress` in MpiAppLibrary). Cancel =
cancel-all. The bar ticks on `download:progress` via a light `_patchProgress` (width/pct only, no
footer rebuild); state transitions (`download:started`/`complete`/`cancelled`) rebuild the footer
so the button swaps Install↔Cancel↔Open. Reuses the Model Library's `.mpi-tile__prog` bar.

## Ctrl+Enter runs the OPEN app

`generation.run` (Ctrl+Enter) is bound by BOTH the PromptBox and `MpiBaseApp` — and `Hotkeys.bind`
fires **all** handlers for an id (bind order), not last-wins. So:

- `MpiBaseApp` binds `generation.run` → its Run.
- The PromptBox's `_triggerRun` **bails when an app overlay is live**: `if
  (document.querySelector('.mpi-base-app')) return;`. When the overlay hides, its element leaves
  the DOM (MpiOverlay `hide()` removes it), so the query returns null and the PromptBox works
  again.

## Overlay z-order + the spared status bar

The App overlay uses MpiOverlay `mountTarget: 'main-area'` (covers `#tool-container` +
`#prompt-box-mount`, inset above `#shell-info-bar` so the status bar stays live). It publishes
`--app-overlay-z`. Two gotchas:

1. **Status bar collapses to the top.** `.main-area` is a flex column; `#tool-container`
   (`flex:1`) is the filler that pushes the sticky footer to the bottom. Stashing `#tool-container`
   (overlay open) removes the filler → the sticky `#shell-info-bar` collapses to the TOP of
   `.main-area`, behind the overlay, under the OS titlebar. Fix: MpiOverlay toggles
   `.main-area--app-overlay` (main-area mode only) → CSS pins `#shell-info-bar`
   `position:absolute; bottom:0` for the overlay's lifetime. App gens emit the same
   `tool:*` events (`tool: 'groupHistory'`) as normal gens, so the bar tracks their progress.

2. **A modal's backdrop renders UNDER the app overlay.** A modal opened over an open app (e.g. the
   "Generation failed" error dialog) is its own body-level stacking context; the App overlay is
   another. `MpiModal` floors its z at `--app-overlay-z + 20` when an app overlay is live (falls
   back to the normal Overlays depth z when none). Without this the backdrop rendered under the
   app overlay and only dimmed the area OUTSIDE it.

The queue slide-over rides ABOVE the app overlay via `--app-overlay-z` (`.mpi-slide-over--queue {
z-index: calc(var(--app-overlay-z,90)+10) }`).

## Errors: toast vs dialog

App runs surface errors like every other gen: `ui:error` = GitHub-report DIALOG,
`ui:warning`/`info`/`success` = TOAST. **OOM** (`MemoryError` / `cannot allocate` / `CUDA out of
memory` / `OutOfMemoryError`) is user-actionable ("inputs too large") → downgraded to a
`ui:warning` toast in `commandExecutor`, NOT the report dialog.

## Dev-gate

`APP_CONFIG.dev_mode = BUILD_HASH === 'dev'` hides BOTH entry points (Landing nav + Gallery
radial) on a staged (non-dev) build automatically. The gate stays until **≥4 apps** exist (user
decision); lifting it is an explicit call.
