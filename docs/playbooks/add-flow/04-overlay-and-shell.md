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

## The result pane: `result.compare` (MPI-585)

**A comparison belongs to a flow that CHANGES ITS INPUT, and to no other kind** (Fabio,
2026-08-20). That is the whole test, and it is a positive one — not "does this flow take an
input", but "does the output modify one". Of the flows shipped today only `ltx-upscale` and
`head-swap` pass it.

Such a flow declares its before/after instead of coding one:

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
output is LONGER than its source, so a reveal bar between them compares two different moments;
the character sheet takes a description and no input media at all, so the bar's left half would
be empty. All three omissions are pinned by `tests/flow-result-compare.test.cjs` so a later
"every flow should have one" sweep has to argue with a test.

The character sheet is the case worth remembering, because it was nearly decided the other way:
an earlier note read "upscale, head swap AND the character sheet get it", and the flow that
would have been given one has no BEFORE to reveal against. Fabio settled it on 2026-08-20 —
**no input to change means no comparison.** Adding one where it misleads is worse than leaving
it off.

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
  across slide rebuilds **and across close→reopen** (MPI-587, below), but never applied to a
  result it cannot serve.
- **Unchanged:** images, and runs with several outputs, keep the plain elements. N players would
  be N decoders and N control bars, and there is no single "after" for a reveal bar.

A Flow is an overlay over a workspace that may have its OWN video bar, and video hotkeys are
bucketed by key — so a bar the user cannot see must not answer the keyboard. That gate lives in
the player, not here: `docs/video-player.md` § A bar you cannot see.

## The result pane survives close→reopen (MPI-587)

**A finished result is session state, not instance state.** The shell destroys the
`MpiBaseFlow` on every `flow:open` and on close (MPI-345 — that destroy is correct and stays),
so anything held only in the closure dies with it. Inputs already travelled in
`state.s_flowInputs[flowId]`; the result did not, which is why a reopened flow used to show its
restored inputs beside an EMPTY frame and a finished run read as lost.

`state.s_flowResults[flowId]` is the twin — same session-only lifetime, same top-level-replace
discipline, **last result only** (a run's N outputs are one result; there is no history here):

```js
{ items, mode, status, pending }   // mode = the surface the user CHOSE; pending = the note
```

- **Four write sites, and that is the complete set.** `_persistResult()` is called from
  `_showResults`'s `remember` branch (a finished run and the error/cancel clear are the same
  branch), the surface toggle, the reset at the top of `_run` — the only path that drops the
  result *without* repainting, so it cannot ride on the first — and `_forgetResult`. Before adding
  a fifth, check whether the path already goes through `_showResults`: that is why the flag
  `onComplete` sets moved ABOVE its paint rather than gaining its own persist call.
- **A remembered path can be dead** — item deleted, media cleaned, another project loaded. One
  `fetch(url, { method: 'HEAD' })` at mount decides it (`/project-file` 404s a missing file); on
  failure the snapshot is forgotten and the pane paints empty. **One probe, not three `error`
  handlers**: the replay fans out to plain / compare / player and two of those swallow the event.
  Same discipline as `_mountCompare`'s fallback — never paint a dead `src`.
- **Across a RESTART is a different mechanism** and stays that way: `openFlowFromReuse` rebuilds
  a flow from the card's sidecar. This key is session-only, like the inputs it mirrors.

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
