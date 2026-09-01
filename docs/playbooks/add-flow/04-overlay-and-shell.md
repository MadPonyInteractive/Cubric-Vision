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

## The licence surface — on BOTH sides of the skip (MPI-666)

`js/utils/flowLicences.js` owns it, and both surfaces import it. Extracted rather than copied
for the reason `declaredFields.js` was (MPI-580): two copies drift into one surface attributing
its licensor and the other not, and `poweredBy` is licence-mandated attribution while `report`
is a channel MiniMax H3 §V.5 obliges us to keep reachable.

- `flowInstallKeys(flow)` — the download-queue keys. Lives here because **the queue key IS the
  licence key**: `getModelLicence` answers for a model id and a `flow:<id>` dep key alike.
- `flowLicences(flow)` — the descriptors gating them, deduped by descriptor **id**, not by key
  (H3 ships as two ModelDefs under one agreement).
- `buildLicenceRows(flow, unsubs)` — the rows. `mpi-detail__licence*`, MpiModelManager's block,
  loaded app-wide by `preloadStyles.js`; the caller supplies its own wrapper for spacing.

**Pre-install** (`MpiFlowLibrary`): a `Licence required` tile chip and a `Licence` field in the
drawer. Its `_licenceErrands(flow)` returns the OUTSTANDING descriptors, and an errand is
`verify || territory` — a trip to the licensor standing between the click and the weights.
Both shapes qualify but they are not the same: `verify` is a probe we run and it **mechanically**
refuses the install (klein-9b, a Hugging Face grant); `territory` is **self-attested** — H3 has
no `verify`, so a user ticks the box and the download proceeds. Keying on `verify` alone read H3
as ungated, which is why the test is widened. The footer names what the click delivers:
`Verify licence` / `Review licence` / `Install models`.

**Post-install** (`MpiBaseFlow` step 0, under the explainer): the same rows, **unconditional and
with no field heading**. Acceptance is a pre-install question and by step 0 the weights are on
disk; what survives is the attribution and the report channel, which the gate dialog cannot carry
because it fires once. No heading because step 0 is prose, not a spec sheet (Fabio, 2026-09-01).
This half exists *because* of the skip above: a flow opened inside a project never sees the
drawer, and a beginner living in Flows may never open the Model Library.

Guarded by `tests/flow-licence-surface.test.cjs` — a data half over the descriptors and an
anchoring half over all three files. **The anchors must be proved to bite against
`git show HEAD:<path>`**; a green anchoring test that also passes on the unfixed tree proves
nothing, and this card turned master red once by asserting a key that existed only in a peer's
uncommitted tree.

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

## Uninstall — a flow frees its OWN deps, nothing else (MPI-682)

The **Open** footer state also carries an **Uninstall**, but only when the flow declares
`requiredDeps`. A models-only flow owns nothing to free — its weights come off in the Model
Library, and a button here would read as an offer to delete the model itself. That gate is
the same one the plugin row uses (`_pluginTile`, MpiModelManager).

What it frees is `flow.requiredDeps` **only**: not `requiredModels` (the Model Library owns
models — MiniMax does not get to delete Krea2) and not a `requiredPlugins` plugin's deps.
So it reads `requiredDeps` directly and **never** `getFlowDependencies()`/`flowDepIds()`,
which union plugin deps in for the *install* payload — counting those would make the
dialog promise disk the server guard is going to keep anyway.

The uninstall goes out under `flowDepKey(flow.id)`, and that key is load-bearing: it is what
lets `_flowRequiredDepIds(excludeUninstallId)` release the weights (see
`docs/download-manager.md` § shared-dep uninstall guard). A model id here leaves them
protected and the button silently frees nothing — the whole reason this was unbuildable
before MPI-682. Deps shared with another flow are still kept (last owner standing).

**Nothing else reports the result.** MpiModelManager's `download:uninstalled` handler owns
the removed/kept toast for models and plugins, and only exists while the Model Library is
mounted; it resolves a `flow:` key to neither, so MpiFlowLibrary carries its own. That
handler deliberately does **not** repaint: the dep-status cache is still pre-uninstall at
that instant. The repaint is `models:checked`, fanned out by the re-sync the SSE twin
triggers (MPI-681).

Reachability: an installed flow clicked from the **Gallery** skips the drawer and opens the
frame (MPI-638), so Uninstall is reached from the Landing page — the same surface as the
Model Library.

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
