# 04 — Overlay & Shell

The Flow overlay frame, the Flow Library, install progress, the Ctrl+Enter hotkey, and the
overlay/status-bar/z-order gotchas. Read [README](README.md) first.

## Components

| Component | Tier | File | Role |
|---|---|---|---|
| `MpiFlowLibrary` | Compound | `js/components/Compounds/LandingPages/MpiFlowLibrary/` | Picker overlay. Body-mode MpiOverlay, tile grid + availability badge, detail slide-over for a flow that is NOT ready yet |
| `MpiBaseFlow` | Organism | `js/components/Organisms/MpiBaseFlow/` | Shared Flow frame (COMPOSITION, not inheritance). `main-area` MpiOverlay; header + Back, media slots (from `inputSchema.media`), declared `fields`, Run, result pane |

`MpiBaseFlow` and `MpiFlowLibrary` both use the **MpiOverlay primitive**; they do NOT reimplement
the overlay.

### There is no per-flow component (MPI-572)

The shell `flow:open` handler mounts `MpiBaseFlow` with the descriptor and **nothing else** —
`MpiBaseFlow.mount(…, { flow })`. The name→blueprint map it used to resolve (`_flowComponents`)
is gone, along with the last flow component, `MpiFlowHeadSwap`.

**Do not add one back.** A component cannot be carried by a third-party manifest, which is the
acceptance clause the whole Flow track is built to meet (MPI-531). Everything a flow needs is
declarable: a knob is a `fields` entry, and a gizmo's output is a step's `param` binding. If a
control genuinely cannot be expressed, **add the field type** in `_buildField` — one branch,
available to every flow ever written, including ones you will never see.

## The flow

```
Gallery "Flows" bar button | Landing "Flows" nav | Tab | (dev) Ctrl+Tab radial → flows:open
  → MpiFlowLibrary overlay (grid + availability badges)
    → tile → _pick()
       ├─ Ready AND in the Gallery → flow:open {flowId} DIRECTLY (MPI-638)
       └─ else → drawer (description + download picker + install state + Install /
                 disabled Open) → Open → flow:open
          → MpiFlowLibrary closes, MpiBaseFlow opens
            → fill slots + declared fields → Run → submitFlowGeneration → EXISTING queue
              → result lands as gallery card(s) (also shown in the Flow's result pane)
```

**An installed flow skips the drawer** (MPI-638). Fabio, 2026-08-28: *"the first thing that the
user sees is an explanation of how the flow works and what it does, so the slide over is an
unnecessary step."* Literal — step 0 already paints the title, hero clip and description, so a
Ready flow's drawer holds only install machinery it has no use for. **Both surviving branches of
`_pick` are load-bearing:** *not available* keeps Install, the aggregated bar, Cancel-all and the
download picker ([any-of-models.md](any-of-models.md)); *not in the Gallery* keeps the disabled
Open + `ui:info` toast, because a flow becomes a card in the CURRENT project and `flow:open` from
Landing lands nowhere. `#flow-back` reopens the Library, so nothing is unreachable. Both failure
modes are silent — too eager mounts a frame that dies at Generate with no Install button on
screen, too shy just never gets better — so the branch has a desktop probe,
`tests/desktop/flow-library-skips-drawer.spec.js`, both halves mutation-checked. The drawer's LoRA
cogwheel left with it ([ui/lora-rack.md](ui/lora-rack.md)).

## The result pane

Three sections — the declared before/after comparison (`result.compare`), the real video
player every single-video result gets, and the snapshot that survives close -> reopen — live
in **[ui/result-pane.md](ui/result-pane.md)**. They are one subject and they were most of
this file; splitting them is what brought it back under the 200-line budget (MPI-638).

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

## Dev-gate — LIFTED (MPI-589)

The Flow Library is a **user route**: Landing nav (`projectUI.js`), the Flows button on the
gallery bar (`navigation.js`), and Tab. The `≥4 flows` condition this doc used to describe was met
and the gate came off. Only the **Ctrl+Tab radial** is still `APP_CONFIG.dev_mode`-gated
(`navigation.js:353`), and it is one door among several rather than the only one.
