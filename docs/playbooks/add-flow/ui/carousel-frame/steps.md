# Steps are DATA, not layout

> Part of the flow carousel frame — [README.md](README.md) is the hub. This file is the step
> contract: what a step kind is, how a step binds to media, its one row of `fields`, and the two
> ways a step's value leaves it (`param` into the graph, `STEP_MEDIA` into the picture).

The canvas is a **slot**, not a box gizmo. Box today; mask painter, light-direction pointer,
mood board, whatever later. The frame must never know what is inside it.

A flow declares its middle steps and writes no layout code:

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
flow's controls. A flow with no middle steps declares `steps: []` and gets a 2-step flow.

`kind` is a **registry key**, mirroring the existing injector registry:

```
STEP_KINDS = { box: MpiStepBox, /* mask, light, … as they are built */ }
```

Each step kind is one component with one contract: it receives `{ media, value, onChange }`
and reports a value. It never knows which flow hosts it, never touches the workflow, never
talks to an injector. The frame collects `{ [role]: value }` and hands it to the flow's param
builder at Run.

**Where role → graph-param mapping lives (settled MPI-306 Phase 2).** The frame passes the
collected values to the flow's controls component — `getInputs({ stepValues })` — and the APP
names them for its own graph. Head Swap turns `image1`'s box into `box1` (masks the head being
replaced) and `image2`'s into `box2` (crops the head being taken). That mapping is flow
knowledge by definition: teaching the frame which role feeds which node would make every
future flow's roles a frame concern, and the frame would stop being portable.

**A new gizmo = one component + one registry line.** No frame change, no per-flow layout.

Two rules that keep this honest:

- **A step binds to a media role** (`image1`, `image2`) — the same vocabulary the op's
  `mediaInputs` already uses, so the box for `image1` reaches `Input_Box` with no new mapping
  ([../box-gizmo.md](../box-gizmo.md) § suffix convention).
- **A step is never invalid.** Every step kind supplies a usable default (the box defaults to
  the full image), so `›` is never blocked. Required-because-the-flow-walks-you-there, not
  required-because-Run-is-gated.

## A step may declare FIELDS — one row, under the canvas

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

The field vocabulary itself — the types, and where each id's value lands — is
[fields.md](fields.md). It is one vocabulary whether declared here or on the flow.

## A step may declare WHERE ITS VALUE GOES — `param` (MPI-572)

A gizmo reports a value; something has to name the graph node it feeds. That naming is flow
knowledge — Head Swap knows `image1`'s box masks the head being *replaced* and `image2`'s crops
the head being *taken* — so the flow declares it, one word:

```js
{ kind: 'box', role: 'image1', param: 'box1', title: '…', hint: '…' }
```

The frame writes that step's value into `injectionParams[param]`. The **shape** the graph wants
is not flow knowledge, it is a property of the gizmo, so it lives with the KIND
(`stepValueToParam`, `stepKinds.js`) — for `box`, the `w`/`h` → `width`/`height` rename and
nothing else. **Coords pass through unconverted**; arithmetic there is the centre-anchor bug
([../box-gizmo.md](../box-gizmo.md) § Coord contract).

A `null` is **omitted**, never sent: an unmarked step leaves the node on its baked default. A
kind that reports nothing (`preview`) has no adapter and can carry no `param`.

## …or its value may change the PICTURE — `STEP_MEDIA` (MPI-594)

Some gizmos do not feed a widget at all. An outpaint rect is not a number anywhere in the
graph: it describes a bigger frame the source has to be redrawn into before anything samples
it. Such a kind registers in `STEP_MEDIA` instead of `STEP_PARAMS`, returns a **File**, and
the frame swaps it in for that role's media at dispatch (`_deriveRunMedia`).

Still declaration-only for the flow — `kind: 'crop'` and nothing else — so it stays
manifest-expressible, and the graph needs no node for it. Two rules the frame enforces:

- **The derived file never enters the snapshot.** `submitFlowGeneration` strips
  `runMediaItems` before writing `flowInputs`, so Reuse restores what the user supplied plus
  the step value, and re-derives. Persisting the derived file would re-apply the step to its
  own output on every reuse.
- **A failed derivation aborts the run** with a warning. Running on the original media would
  produce a result that looks like the model ignored the request.

A kind may deliver its file to a role OTHER than the one it operates on, by declaring
**`mediaRole`** on the step (MPI-567). Omit it and the file REPLACES the step's own media, which
is what `crop` wants — a padded picture supersedes the picture it padded. `paint` wants the
opposite: the user draws on the photo and the graph needs BOTH, so the layer is declared into its
own slot and the frame APPENDS it. Still one word, still no JS. The named role must be one the
op's `mediaInputs` declares, or the file reaches no node.

→ [../crop-gizmo.md](../crop-gizmo.md) · [../paint-gizmo.md](../paint-gizmo.md).

The reported value's own shape is deliberately NOT renamed to match — `stepValues` is persisted
for Reuse, so renaming at the source would strand every card already saved with `w`/`h`.

**This is what closed the manifest gap.** It was the one thing a `uiComponent` did that a FlowDef
could not say for itself, and with it declared, the component surface was deleted outright.
