# 04 — Overlay & Shell

The Flow overlay frame, the Flow Library, install progress, the Ctrl+Enter hotkey, and the
overlay/status-bar/z-order gotchas. Read [README](README.md) first.

## Components

| Component | Tier | File | Role |
|---|---|---|---|
| `MpiFlowLibrary` | Compound | `js/components/Compounds/LandingPages/MpiFlowLibrary/` | Dev-gated picker overlay. Body-mode MpiOverlay, tile grid + availability badge, detail slide-over with Open/Install |
| `MpiBaseFlow` | Organism | `js/components/Organisms/MpiBaseFlow/` | Shared Flow frame (COMPOSITION, not inheritance). `main-area` MpiOverlay; header + Back, media slots (from `inputSchema.media`), content slot for a per-flow uiComponent, Run, result pane |
| `MpiFlowImageRegen` | Organism | `js/components/Organisms/MpiFlowImageRegen/` | First flow's controls-only component (a prompt textarea + `el.getInputs()`), mounted into MpiBaseFlow's content slot. Reused by SDXL 4K |

`MpiBaseFlow` and `MpiFlowLibrary` both use the **MpiOverlay primitive**; they do NOT reimplement
the overlay.

### The uiComponent is optional

The shell `flow:open` handler maps the descriptor's `uiComponent` NAME → blueprint via
`_flowComponents[flow.uiComponent] || null`. A media-only flow omits `uiComponent`; BaseFlow renders
the media slots from `inputSchema.media` and mounts no per-flow controls. `el.getInputs()` is only
called when a uiComponent exists (`_perFlow?.el?.getInputs?.()`).

To add a uiComponent: register its CSS in `preloadStyles.js`, props in `types.js`, and map its
NAME → blueprint in `js/shell.js`'s `_flowComponents`.

## The flow

```
Gallery → (dev-gated) Ctrl+Tab dev radial "Flows" | Landing "Flows" nav → flows:open
  → MpiFlowLibrary overlay (grid + availability badges)
    → card → detail slide-over (description + required-models install state + Open/Install)
      → Open → flow:open {flowId} → MpiFlowLibrary closes, MpiBaseFlow opens
        → fill slots + controls → Run → submitFlowGeneration → EXISTING queue
          → result lands as gallery card(s) (also shown in the Flow's result pane)
```

## Install progress (multi-model)

The detail footer has three states: **Install models** (missing, idle) → **aggregated % bar +
Cancel** (installing) → **Open** (all installed). Installs are SERIAL (downloadService serializes
the queue), so N models each own **1/N** of the bar (`_installProgress` in MpiFlowLibrary). Cancel =
cancel-all. The bar ticks on `download:progress` via a light `_patchProgress` (width/pct only, no
footer rebuild); state transitions (`download:started`/`complete`/`cancelled`) rebuild the footer
so the button swaps Install↔Cancel↔Open. Reuses the Model Library's `.mpi-tile__prog` bar.

## Ctrl+Enter runs the OPEN flow

`generation.run` (Ctrl+Enter) is bound by BOTH the PromptBox and `MpiBaseFlow` — and `Hotkeys.bind`
fires **all** handlers for an id (bind order), not last-wins. So:

- `MpiBaseFlow` binds `generation.run` → its Run.
- The PromptBox's `_triggerRun` **bails when a flow overlay is live**: `if
  (document.querySelector('.mpi-base-flow')) return;`. When the overlay hides, its element leaves
  the DOM (MpiOverlay `hide()` removes it), so the query returns null and the PromptBox works
  again.

## Overlay z-order + the spared status bar

The Flow overlay uses MpiOverlay `mountTarget: 'main-area'` (covers `#tool-container` +
`#prompt-box-mount`, inset above `#shell-info-bar` so the status bar stays live). It publishes
`--main-overlay-z`. Two gotchas:

1. **Status bar collapses to the top.** `.main-area` is a flex column; `#tool-container`
   (`flex:1`) is the filler that pushes the sticky footer to the bottom. Stashing `#tool-container`
   (overlay open) removes the filler → the sticky `#shell-info-bar` collapses to the TOP of
   `.main-area`, behind the overlay, under the OS titlebar. Fix: MpiOverlay toggles
   `.main-area--overlay` (main-area mode only) → CSS pins `#shell-info-bar`
   `position:absolute; bottom:0` for the overlay's lifetime. Flow gens emit the same
   `tool:*` events (`tool: 'groupHistory'`) as normal gens, so the bar tracks their progress.

2. **A modal's backdrop renders UNDER the flow overlay.** A modal opened over an open flow (e.g. the
   "Generation failed" error dialog) is its own body-level stacking context; the Flow overlay is
   another. `MpiModal` floors its z at `--main-overlay-z + 20` when a flow overlay is live (falls
   back to the normal Overlays depth z when none). Without this the backdrop rendered under the
   flow overlay and only dimmed the area OUTSIDE it.

The queue slide-over rides ABOVE the flow overlay via `--main-overlay-z` (`.mpi-slide-over--queue {
z-index: calc(var(--main-overlay-z,90)+10) }`).

## Errors: toast vs dialog

Flow runs surface errors like every other gen: `ui:error` = GitHub-report DIALOG,
`ui:warning`/`info`/`success` = TOAST. **OOM** (`MemoryError` / `cannot allocate` / `CUDA out of
memory` / `OutOfMemoryError`) is user-actionable ("inputs too large") → downgraded to a
`ui:warning` toast in `commandExecutor`, NOT the report dialog.

## Dev-gate

`APP_CONFIG.dev_mode = BUILD_HASH === 'dev'` hides BOTH entry points (Landing nav + Gallery
radial) on a staged (non-dev) build automatically. The gate stays until **≥4 flows** exist (user
decision); lifting it is an explicit call.
