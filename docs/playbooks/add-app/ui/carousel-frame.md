# App carousel frame — the shape of every app

> **PORTABLE.** This is THE app UI. Designed during Head Swap (MPI-299), but Head Swap is
> app #1 of the real product — the three earlier apps (Image Regen, SDXL 4K, Video Stitch)
> were plumbing tests, are marked for deprecation, and were never released. Nothing here is
> a compromise with them.
>
> **Status: DESIGN AGREED + MOCK-UP APPROVED, NOT BUILT.** The mock-up phase ran (MPI-306,
> 2026-07-18); the approved composition is recorded in § The approved composition below, which
> OVERRIDES this document wherever the two disagree.

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

### A step may declare FIELDS — one row, under the canvas

Some gizmos need adjustments beyond the canvas itself: a ratio lock, a brush size, a reset.
These are **declared, not hand-laid-out** — same logic as `steps`, one tier down. The frame
renders them as a single row **between the canvas and the hint**, centred at canvas width:

```js
{ kind: 'box', role: 'image1', title: '…', hint: '…',
  fields: [
    { id: 'ratio', type: 'select', label: 'Ratio',
      options: [{ v: '1', label: 'Square' }, { v: 'free', label: 'Free' }] },
    { id: 'reset', type: 'button', label: 'Reset box' },
  ] }
```

The step's reported value widens to carry them — `{ box: {...}, fields: { ratio: '1' } }` —
so the `{ media, value, onChange }` contract is unchanged and the frame still knows nothing
about what a gizmo does.

**Why the frame renders the row rather than the gizmo:** consistency for free. If each gizmo
drew its own row, the mask painter's and the box's would drift into two dialects of the same
thing. Declared fields mean every gizmo's controls look identical without coordination.

**The cap is the point — ONE row, no nesting, no panels, no accordions.** The canvas IS the
step; the row is a modifier on it, never a second control surface. A gizmo that wants more
than one row of fields is telling you the step should SPLIT IN TWO, not that the row should
grow. Hold this line: it is the seam where a guided flow quietly rots back into a settings
form.

## Results are not real until Apply

**This is a run-path change, not a UI detail.** Today `submitAppGeneration` enqueues with
`scope: 'gallery'` + a `placeholderGroup`, so a card appears in the gallery *at enqueue
time*, before the run even finishes.

Under this design the last step holds the result **in-app**: the user generates, watches
latents, cancels or re-generates freely, and only **Apply** commits it to the project +
gallery.

Decided:

- **Pending results live in app state and do not survive closing the app.** No project-level
  persistence for something the user has not committed to.
- **There is no Discard button, and closing does not prompt** (decided 2026-07-18, superseding
  the earlier Apply/Discard pair + discard dialog). Discard was redundant: *Generate again*
  already overwrites a pending result and closing already drops it, so its only unique job was
  "clear the pane and stay here" — not a thing a user deliberately wants. With nothing unique
  to destroy, a close prompt guards a non-decision, so it goes too.
- **The result pane keeps a quiet "Not saved yet" note.** This is what carries hold-until-Apply.
  Without it a finished image reads as already-in-the-gallery and Apply looks decorative; the
  note is the only thing making the commit legible. It is the surviving half of the pair.
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

## The approved composition

Three independent mock-ups ran on 2026-07-18 (MPI-306). Mock-up C ("surgical precision") won
and was revised to C2, which the user approved as **the** design. Reference implementation:
`mockup-C2.html` (scratchpad — a throwaway artefact; this section is the durable record).

Where this section disagrees with the sketch above, **this section wins.**

### Air is structural, not leftover

Content clusters toward a **centre gravity** with generous empty outer margins — the opposite
of stretch-to-fill. A `max-width: 1180px` centre column inside `--s-7` padding. The outer
thirds stay empty on purpose.

### The divider is INSET, top and bottom

It does **not** run the full height and never touches the chrome. ~62% height, fading out at
both ends:

```css
background: linear-gradient(to bottom,
  transparent 0%, var(--line) 12%, var(--line) 88%, transparent 100%);
```

Quiet `--line`, never an accent colour. A full-height accent rule is the decorative use of
heat that Stage bans.

### Ambient gradient ground, matched to the Libraries

The app frame sits on the **same ground as the App/Model Library** (`--lib-bg:
oklch(0.26 0.020 350)`), so the three overlays read as one family. Not a flat fill.

**Keep these tokens LOCAL to the component** — `--lib-bg` is already declared locally in both
`MpiAppLibrary.css` and `MpiModelManager.css` rather than globally in `styles/01_base.css`.
The app frame is the third local copy. Decided deliberately (2026-07-18): these are
overlay-ground values, not app-wide tokens, and promoting them to global would invite reuse on
surfaces that shouldn't have them.

The app's gradient is **centre-out horizontally** — brightest along the centre column where the
work sits, falling away to the left and right edges. This differs from the Libraries' flat
ground; it is what gives the frame its "air at the edges" reading:

```css
/* Direction is settled; exact stops are to be tuned live in the app. */
radial-gradient(ellipse 75% 120% at 50% 50%,
  oklch(0.29 0.021 350) 0%,
  oklch(0.26 0.020 350) 55%,     /* = --lib-bg */
  oklch(0.225 0.019 350) 100%);
```

The mock-up used a wider top-biased ellipse; the horizontal centre-out form above is the
approved direction. **Fine-tune the stops in the running app, not in a mock-up.**

### The slot is a PLACEHOLDER, not a container

This is the rule most likely to be got wrong:

| State | Rendering |
|---|---|
| Empty | Bordered box, fixed size, icon + "Drop image here" |
| **Filled** | **The image IS the box** — `width:auto; height:auto; background:none; padding:0`, border hugging the image at *its own* aspect |

**No crop, no letterbox padding, no box-around-an-image.** A filled slot is the media with a
1px outline, nothing else. Constrain with `max-width`/`max-height`, never fixed dimensions.

### Middle steps: bounded centred canvas, no annotation column

Title above, canvas, guidance below — all centred, no divider, no side column. Mock-up C's
60/40 split (annotation column beside the canvas) was **rejected**: the step's copy lives
*below* the canvas, not beside it. `.work { max-width: 900px }`.

### The step ticker NAVIGATES

**This overturns "step dots indicate but do not navigate."** All three mock-ups independently
rejected inert dots — a row that indicates but refuses clicks reads as *disabled*, not
*informational*. Resolution: make it real. The header ticker (`01 Inputs · 02 Target head ·
03 Reference head · 04 Generate`) is a row of buttons with `aria-current="step"`; active in
`--accent-heat`, completed in `--ink-3`, upcoming in `--ink-4`.

### Tier cost is RELATIVE, never absolute seconds

A hardcoded ETA (`~45 s`) is a lie on every GPU but the one it was measured on. The **ratio**
is a property of the pipeline (step count), so it holds everywhere:

| Tier | Steps | Measured | Cost label | Gloss |
|---|---|---|---|---|
| Quality | 20 (raw) | 386 s | `baseline` | Full sampling. Best edge blending and skin match. |
| Turbo | 8 | 100 s | `~25% of time` | Half the steps. Softer detail in hair. |
| Hyper | 4 | 51 s | `~13% of time` | Fewest steps. For checking framing, not final work. |

**Measure the ratio; do not derive it from step count.** The measured column above comes from
a real A/B on one machine (2026-07-18). Note it is *not* linear — 20 steps costs 386 s, not
4×100 s, because the raw tier runs **without the speed LoRA**. Deriving "20 steps = 2.5× of 8
steps" would have been wrong by a factor of ~1.5. Any new tier needs its own measurement.

Only the **ratio** is portable across GPUs, which is why the label is a percentage and the
seconds never ship. The label must say *time*, or "13%" reads as 13% quality. Progress during
a run comes from **server truth** (steps completed), never a baked per-tier duration.

> Later, once run history exists: measure the user's own first Quality run and show real
> seconds from *their* GPU. Their machine's number, not a marketing one. Not built.

### Settled odds and ends

- **Mid-run navigation is allowed** — the run keeps going. Only *closing* with an unapplied
  result prompts to discard. Blocking the arrows during a full-quality run is a cage.
- **Explainer pane does not persist** on middle steps. It vanishes; the canvas hint carries it.
- **Generate button states:** `Generate` → `Cancel` (frost, during run) → `Generate again`.
  Copy change IS the state signal — no spinner. A 1px `--accent-frost` gauge under the button.
- **Live latents:** progressive de-blur + a 1px frost scanline. Honest about a half-computed
  image; never a spinner over blank space.
- **Apply** sits under the result, inline — not a modal. No Discard beside it, and no close
  prompt (see § Results are not real until Apply). A quiet "Not saved yet" note sits with it.
- Prose blocks are **centred as a block, left-aligned as text**, capped ~62ch.

## Still open

- Whether a one-off step can bypass the registry (`component: 'MpiFooStep'`) or every step
  kind must be registered.
- Slot previews for `<video>` / `<audio>` (images are settled above; open since MPI-259).
- Multi-output result panes — the approved composition shows a single output.
