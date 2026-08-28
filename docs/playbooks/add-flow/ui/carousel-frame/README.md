# Flow carousel frame — the shape of every flow

> **PORTABLE.** This is THE flow UI. Designed during Head Swap (MPI-299), but Head Swap is
> flow #1 of the real product — the three earlier flows (Image Regen, SDXL 4K, Video Stitch)
> were plumbing tests, are marked for deprecation, and were never released. Nothing here is
> a compromise with them.
>
> **Status: BUILT** (MPI-306 Phases 1–3, 2026-07-18) — the frame ships as `MpiBaseFlow`, with
> Head Swap as its first real instance. The approved composition is recorded in
> [composition.md](composition.md), which OVERRIDES the sketch below wherever the two disagree.
>
> **Split out of a single 496-line `carousel-frame.md` (MPI-643)** against the 200-line budget,
> following the precedent [result-pane.md](../result-pane.md) set. This README is the frame
> itself; the other files are its four subjects.

| File | Covers |
|---|---|
| **README.md** (this file) | The frame: zones, drop boxes, the canvas, navigation, what the frame guarantees a flow, Head Swap's instance |
| [steps.md](steps.md) | **Steps are DATA** — step kinds, the role vocabulary, a step's one row of `fields`, `param`, and `STEP_MEDIA` |
| [fields.md](fields.md) | **`fields` is the ONE control surface** — the field types and where each id's value lands |
| [run-path.md](run-path.md) | What happens to a result when a run finishes — and why the Apply step that used to be here is gone |
| [composition.md](composition.md) | **The approved visual composition** — air, the inset divider, the ambient ground, the placeholder slot, the ticker, tier cost |

## The frame

A step carousel. Two zones split by a centre divider — but **only on the first and last
step**. That absence is the signal: divided = you are supplying or reviewing; undivided =
you are working.

```
FIRST / LAST STEP                    MIDDLE STEPS
┌───────────────┬───────────────┐    ┌───────────────────────────────┐
│               │               │    │           title               │
│  ‹    work    │   context   › │    │  ‹   ┌───────────────┐    ›   │
│               │               │    │      │    canvas     │        │
│               │               │    │      └───────────────┘        │
│               │               │    │            hint               │
└───────────────┴───────────────┘    └───────────────────────────────┘
```

| Step | Left | Right |
|---|---|---|
| **0 · Inputs** | drop boxes, scrollable | what this flow does + examples (image / gif / video) |
| **1..N · Work** | *(undivided)* framed canvas — title above, guidance below | — |
| **Last · Run** | controls + Generate | result / live latents |

**Work-left / context-right.** The user's hands stay on one side the whole way. The right
pane is always "what you're looking at or will get" — examples at the start, the real output
at the end. Same slot, promoted from promise to result.

### Drop boxes (step 0)

An empty slot shows an icon + what it wants. Dropping media **replaces** that content with
the media itself; the slot keeps a label (badge on the image, or a label above) so the user
can still tell which slot is which once all of them are filled. Scrollable — a flow may
declare many slots, required or optional.

### The canvas (middle steps)

A **bounded, centred box** — not edge-to-edge. Title above it, short guidance below (what to
do, best-practice pointers for that step).

### Navigation

- ‹ › vertically centred, outside the content, one per side. No back arrow on step 0.
- Step dots indicate position and total length — a flow that reveals its length one arrow at
  a time feels endless. They also **navigate** — see [composition.md](composition.md) § The step
  ticker NAVIGATES.
- **ArrowLeft / ArrowRight = previous / next step** (MPI-606). Registry ids `flow.step.back` /
  `flow.step.forward`, bound through `Hotkeys` and unbound with the instance, so they exist only
  while a flow is open. Both are `allowWhileTyping: false` and the arrows are in the hotkey
  manager's `isTextEditKey` list, so a focused text field keeps them and the caret moves instead
  of the step. **They are not gated on the result surfaces**, and a gate was tried and removed:
  `hotkeyManager._mapKey` keys handlers by TYPE+KEY rather than by id, so `video.frame.*` and
  `compare.frame.*` fire on the same press and yielding to them looked careful — but
  `_compareView` is non-null for an IMAGE compare too (MpiCompareView only *binds* when a side
  is video), so a replayed image result killed ArrowLeft on the Generate slide. No gate is
  needed: result surfaces are run-slide only, ArrowRight is already a navigation no-op there
  (`_goTo` clamps), so a video keeps forward frame-stepping, and ArrowLeft goes back a step.
- **Space never navigates.** Every piece of nav chrome is a real `<button>` that keeps focus
  after a click, and Space on a focused button is native activation — clicking the forward arrow
  turned the next space press into another step. `_killSpace` preventDefaults Space on the back
  button, both arrows and every ticker tick. Enter still activates them, and the media slots'
  own `Enter || ' '` handlers are untouched: the fix is at the nav chrome, never global.
- Plain slide transition. Nothing more.

## What the frame guarantees a flow (MPI-606)

- **Inputs survive leaving and coming back, without a run.** `state.s_flowInputs[flow.id]` is
  written as the user works — media changes immediately, gizmo reports and field edits on a
  300ms trailing timer, flushed in `destroy()` (which IS the navigation path, MPI-345). It used
  to be written only inside `_run`, so anything entered before the first Generate died with the
  closure. This is **session scratch**, not the sidecar's `flowInputs`, which stays frozen at Run
  so a mid-run edit cannot corrupt what Reuse restores
  ([../../03-storage-and-reuse.md](../../03-storage-and-reuse.md)). Do not fix one into the other.
- **`promptRequired` on the op is enforced.** A flow whose `operation` declares it refuses to run
  on an empty prompt with a `ui:warning` and no generation. Scope is the flow frame only: every
  Flow declares its prompt as a field with id `positive`, and `tests/flow-frame.test.cjs` fails
  any flow that declares it under another id. The flag is still inert on the eleven non-flow ops
  that declare it — enforcing it at `enqueueGeneration` would change `i2i` / `inpaint` / `edit` /
  `promptEnhance` behaviour nobody reported.
- **A field id declared on a gizmo step AND on the run slide is ONE value.** `_writeDeclaredField`
  fans a write across every store that declares the id. They used to be two stores —
  `_stepValues[role].fields` and `_fieldValues` — with `_collectInputs` applying the flow store
  last, so from the second run onward the value edited on the step was overwritten by the stale
  run-slide one. A `kind: 'fields'` step never had this problem: it is a FRAME kind with no role
  and seeds into the flow store by design, which is why `character-sheet` declaring its prompt
  twice always worked and read as precedent.
- **An overlay-hosted popup must not take the flow down.** `MpiColorPicker.openPopup` emits
  `ui:close-all-popups` with `{ reason: 'overlay-open' }` — the established "I am opening on top
  of you" contract (`overlayManager.js`). Bare, it hid the full-page Flow overlay and dropped the
  user on the gallery, and the picker's own MutationObserver then destroyed it mid-`rAF` for a
  `getBoundingClientRect of null`. Any new popup that can open inside a Flow owes the same reason.

## Head Swap's instance

| Step | Content |
|---|---|
| 0 | two image drop boxes + explainer |
| 1 | box the target head (`image1` → `Input_Box` → `Mpi Box Mask`) |
| 2 | box the reference head (`image2` → `Input_Box_2` → `Mpi Box Crop`), defaults to full image |
| 3 | tier radio (Quality / Turbo / Hyper) + Generate → result (committed on completion — [run-path.md](run-path.md)) |

Every row of that table is now DECLARED: steps 1 and 2 are `kind:'box'` with
`param: 'box1'` / `'box2'`, and step 3's radio is a `fields` entry (`Input_Tier`). The flow
carries no JS at all — it is the proof that the frame's template is complete.

No prompt anywhere: both prompts are baked in the graph. No seed UI, ever. The two boxes look
identical but mean different things — step 1 marks *where the head goes*, step 2 marks *which
head to take* — so their copy carries the whole distinction.

## Still open

- Whether a one-off step can bypass the registry (`component: 'MpiFooStep'`) or every step
  kind must be registered.
- Slot previews for `<video>` / `<audio>` (images are settled in
  [composition.md](composition.md) § The slot is a PLACEHOLDER; open since MPI-259).
- Multi-output result panes — the approved composition shows a single output.
