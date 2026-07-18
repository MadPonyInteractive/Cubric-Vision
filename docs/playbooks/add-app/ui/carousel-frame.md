# App carousel frame — the shape of every app

> **PORTABLE.** This is THE app UI. Designed during Head Swap (MPI-299), but Head Swap is
> app #1 of the real product — the three earlier apps (Image Regen, SDXL 4K, Video Stitch)
> were plumbing tests, are marked for deprecation, and were never released. Nothing here is
> a compromise with them.
>
> **Status: DESIGN AGREED, NOT BUILT.** Mock-up phase pending (see § Next). Treat the layout
> as settled in *intent*; exact composition is still open to the craft pass.

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
| **0 · Inputs** | drop boxes, scrollable | what this app does + examples (image / gif / video) |
| **1..N · Work** | *(undivided)* framed canvas — title above, guidance below | — |
| **Last · Run** | controls + Generate | result / live latents |

**Work-left / context-right.** The user's hands stay on one side the whole way. The right
pane is always "what you're looking at or will get" — examples at the start, the real output
at the end. Same slot, promoted from promise to result.

### Drop boxes (step 0)

An empty slot shows an icon + what it wants. Dropping media **replaces** that content with
the media itself; the slot keeps a label (badge on the image, or a label above) so the user
can still tell which slot is which once all of them are filled. Scrollable — an app may
declare many slots, required or optional.

### The canvas (middle steps)

A **bounded, centred box** — not edge-to-edge. Title above it, short guidance below (what to
do, best-practice pointers for that step).

### Navigation

- ‹ › vertically centred, outside the content, one per side. No back arrow on step 0.
- Step dots indicate position and total length — a flow that reveals its length one arrow at
  a time feels endless. **Dots indicate; they do not navigate.**
- Plain slide transition. Nothing more.

## Steps are DATA, not layout

The canvas is a **slot**, not a box gizmo. Box today; mask painter, light-direction pointer,
mood board, whatever later. The frame must never know what is inside it.

An app declares its middle steps and writes no layout code:

```js
steps: [
  { kind: 'box', role: 'image1',
    title: 'Choose who gets the new head',
    hint:  'Box the head you want replaced. Include hair and jaw.',
    ratio: 1 },
  { kind: 'box', role: 'image2',
    title: 'Choose the head to use',
    hint:  'Box the head to take. A close-up portrait works best.',
    ratio: 1, default: 'full' },
]
```

**Step 0 and the last step are implicit** — the frame renders them from `inputSchema` and the
app's controls. An app with no middle steps declares `steps: []` and gets a 2-step flow.

`kind` is a **registry key**, mirroring the existing injector registry:

```
STEP_KINDS = { box: MpiStepBox, /* mask, light, … as they are built */ }
```

Each step kind is one component with one contract: it receives `{ media, value, onChange }`
and reports a value. It never knows which app hosts it, never touches the workflow, never
talks to an injector. The frame collects `{ [role]: value }` and hands it to the app's param
builder at Run.

**A new gizmo = one component + one registry line.** No frame change, no per-app layout.

Two rules that keep this honest:

- **A step binds to a media role** (`image1`, `image2`) — the same vocabulary the op's
  `mediaInputs` already uses, so the box for `image1` reaches `Input_Box` with no new mapping
  ([box-gizmo.md](box-gizmo.md) § suffix convention).
- **A step is never invalid.** Every step kind supplies a usable default (the box defaults to
  the full image), so `›` is never blocked. Required-because-the-flow-walks-you-there, not
  required-because-Run-is-gated.

## Results are not real until Apply

**This is a run-path change, not a UI detail.** Today `submitAppGeneration` enqueues with
`scope: 'gallery'` + a `placeholderGroup`, so a card appears in the gallery *at enqueue
time*, before the run even finishes.

Under this design the last step holds the result **in-app**: the user generates, watches
latents, cancels or re-generates freely, and only **Apply** commits it to the project +
gallery.

Decided:

- **Pending results live in app state and do not survive closing the app.** Closing with an
  unapplied result asks to discard. No project-level persistence for something the user has
  not committed to.
- Generated files still land on disk regardless — "not in the gallery" means *not recorded in
  the project*. Orphans are the existing `.preview-assets` + Cleanup GC path's job
  (MPI-277/227), not a new mechanism.

Live previews already have their plumbing: `submitAppGeneration` returns `tempId`, which
`MpiBaseApp` uses to match `preview:frame` events (MPI-271). What changes is where the
*committed* output goes, not how previews arrive.

## Head Swap's instance

| Step | Content |
|---|---|
| 0 | two image drop boxes + explainer |
| 1 | box the target head (`image1` → `Input_Box` → `Mpi Box Mask`) |
| 2 | box the reference head (`image2` → `Input_Box_2` → `Mpi Box Crop`), defaults to full image |
| 3 | tier radio (Quality / Turbo / Hyper) + Generate → result → Apply |

No prompt anywhere: both prompts are baked in the graph. No seed UI, ever. The two boxes look
identical but mean different things — step 1 marks *where the head goes*, step 2 marks *which
head to take* — so their copy carries the whole distinction.

## Open — for the mock-up phase

Deliberately unresolved. The craft pass gets **full freedom** to propose additions,
removals, or a different composition entirely:

- Whether a one-off step can bypass the registry (`component: 'MpiFooStep'`) or every step
  kind must be registered.
- Slot previews: thumb / `<video>` / `<audio>` in the drop box (open since MPI-259).
- Result-pane composition: single vs multi-output, where Apply/Discard sit, cancel affordance
  during a run.
- Generate button states (idle / queued / running / cancellable / done).
- Where the tier radio sits relative to Generate.
- Whether the explainer pane persists in any reduced form on middle steps.

## Next

Three independent mock-ups via the `impeccable` skill, given the vision and constraints above
but **not** a prescribed layout — mock-ups routinely surface things a written design misses,
in both directions (more, and less). Then converge, then build.
