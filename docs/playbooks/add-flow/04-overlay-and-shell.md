# 04 — Overlay & Shell

The Flow overlay frame, the Flow Library, install progress, the Ctrl+Enter hotkey, and the
overlay/status-bar/z-order gotchas. Read [README](README.md) first.

## Components

| Component | Tier | File | Role |
|---|---|---|---|
| `MpiFlowLibrary` | Compound | `js/components/Compounds/LandingPages/MpiFlowLibrary/` | Dev-gated picker overlay. Body-mode MpiOverlay, tile grid + availability badge, detail slide-over with Open/Install |
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
Gallery → (dev-gated) Ctrl+Tab dev radial "Flows" | Landing "Flows" nav → flows:open
  → MpiFlowLibrary overlay (grid + availability badges)
    → card → detail slide-over (description + required-models install state + Open/Install)
      → Open → flow:open {flowId} → MpiFlowLibrary closes, MpiBaseFlow opens
        → fill slots + declared fields → Run → submitFlowGeneration → EXISTING queue
          → result lands as gallery card(s) (also shown in the Flow's result pane)
```

## The result pane: `result.compare` (MPI-585)

A flow that **improves media the user supplied** declares its before/after instead of coding
one:

```js
inputSchema: { media: [{ type: 'video', mode: 'upto', max: 1, roles: ['inputVideo'], … }] },
result: { compare: 'inputVideo' },   // ← which INPUT role is the BEFORE
```

The frame then paints the result on `MpiCompareView` — source left, result right, draggable
reveal bar — instead of a plain `<video>`/`<img>`. **One declaration covers video and image**,
because MpiCanvas's comparison mode already does image+image, image+video, video+image and
video+video. Video pairs stay frame-locked and take the shared `compare.*` hotkeys (space
play/pause both, ←/→ frame step, `l` loop); they are inert while the user is typing in a field.

Declared today: `ltx-upscale` (`inputVideo`) and `head-swap` (`image1`).

**Name the role whose FRAMING the output shares**, not merely an input that fed the run.
Head Swap takes two images but compares against `image1`, the plate it keeps — `image2` only
donates a head and shares no framing, so a bar between them would show two unrelated pictures.

**Omit it when a comparison would say nothing.** Foley returns the same pixels; an extend's
output is LONGER than its source, so a reveal bar between them compares two different moments.
Both omissions are pinned by `tests/flow-result-compare.test.cjs` so a later "every flow should
have one" sweep has to argue with a test. This is a per-flow judgement, not a default.

The frame falls back to the plain element by itself when the named media is gone (a Reuse across
a restart), when the run produced several outputs (there is no single "after"), or when the pair
will not decode. So a declaration can never leave an empty pane — but a role that does not match
`inputSchema.media[].roles` falls back **silently**, which reads as "compare is broken". That
pairing is pinned by `tests/flow-result-compare.test.cjs`.

`MpiCompareView` is a shared Compound: the History workspace's `MpiCompareOverlay` is the same
surface wrapped in a full-screen takeover. **Change the compare behaviour in the view, never in
one of the two consumers** — that is the whole reason it was lifted out.

## The result pane: every video result gets the real player (MPI-585)

A **single video** result mounts `MpiVideoViewer` + `MpiVideoControlBar` — the same pair the
Group History workspace runs — not a `<video controls>`. That gives frame stepping, a
frame-accurate seek bar, loop, mute + volume, fullscreen and the time/frames toggle. Nothing to
declare: it is what a video result does.

- **Where they go.** The viewer fills the result FRAME; the bar is a sibling of the `__split`,
  spanning the whole slide beneath it. Inside the result column instead, the bar's ~740px of
  fixed chrome squeezed the flexible part — the seek bar — to exactly 0px.
- **`showTrim: true`, always.** `MpiTrimBar` is track + in/out handles + playhead in ONE
  component, so `showTrim: false` removes the seek bar along with the trim handles.
- **The frame contract is compare's.** The media layer stays empty, which is what leaves every
  `_bindResultView` handler inert; the viewer brings its own zoom/pan.
- **Compare wins the first paint** when the flow declares one, and a `MpiButton` in the frame's
  bottom-right toggles the two. The toggle appears only when BOTH surfaces exist — a declared
  compare AND a video result — and only one is mounted at a time. The choice is remembered
  across slide rebuilds, but never applied to a result it cannot serve.
- **Unchanged:** images, and runs with several outputs, keep the plain elements. N players would
  be N decoders and N control bars, and there is no single "after" for a reveal bar.

A Flow is an overlay over a workspace that may have its OWN video bar, and video hotkeys are
bucketed by key — so a bar the user cannot see must not answer the keyboard. That gate lives in
the player, not here: `docs/video-player.md` § A bar you cannot see.

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
