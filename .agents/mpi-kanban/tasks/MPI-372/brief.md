# MPI-372 Brief — the prompt box has to be there while you mask

Raised by the user 2026-07-28, right after verifying MPI-371.

## The complaint, verbatim in substance

> When the user is using mask tools, the prompt box needs to be visible. Now that we
> are getting more mask tools, I started realising that it's becoming an issue having
> to mask and go to the prompt box. It's just to adjust settings. It's extremely
> annoying.

## Why it is a real problem, not a preference

A mask is never the goal. The goal is *"do this thing to this region"* — the mask and the
prompt are **one operation**, and the UI splits them across two mutually exclusive modes.
Every settings tweak mid-mask costs: mask → switch to Prompt → change one control →
switch back → find your place again.

It was survivable when Mask was a single rail tool. **MPI-371 made it a family** — Detect
and Points shipped, Shapes (MPI-368) and Text (MPI-361 Phase B) queued — so the round trip
now sits in the middle of the flow the whole product is built around, and it repeats once
per tool.

## Where it lives

All of it is in `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`:

- `mountOptions(mode)` — `prompt` is a special case with no tool compound. It toggles
  `mpi-group-history-block--prompt-active` (shows PromptBox, hides `#right-top-slot`),
  and every other mode calls `_pb?.el?.hide()`.
- `_shouldShowPromptBox()` / `_hasPromptOps()` / `_mountPromptBoxIfNeeded()` — the gates.
- `MpiGroupHistoryBlock.css` — the layout the class switches between.

## The catch that makes this a design job, not a CSS job

**Prompt mode swaps the viewer surface.** Entering prompt calls `viewer.el.swapToPreview()`;
leaving it calls `swapToCanvas()`. The canvas (paintable, mask overlay, points) and the
preview are not the same surface, so "just show both" is not a one-line change. Resolving
that swap coherently IS the task.

## Options to weigh — NOTHING DECIDED, brief the user first

1. **PromptBox stays visible whenever a mask tool is active.** Tool panel keeps its slot;
   PromptBox keeps its mount. Smallest conceptual change, but the canvas/preview swap has
   to be settled and vertical space gets tight.
2. **Prompt stops being a rail tool.** It becomes always-present chrome and the rail owns
   canvas tools only. Cleanest model — prompt is not a *mode*, it is the thing you are
   always writing — but it touches every workspace path that assumes `mode === 'prompt'`.
3. **A compact prompt strip while masking**, expanding to the full box on demand. Cheapest
   on space, adds a second prompt surface to keep in sync.

Option 2 is the one that matches the complaint's root ("prompt is not a mode"), and it is
also the biggest blast radius. Get the user's call before writing anything.

## Do not

- Do not fold this into MPI-371 (done) or MPI-368/MPI-361 Phase B. It is its own UX change
  and every mask tool inherits whatever is decided here.
- Do not bypass `swapToPreview` / `swapToCanvas` with a CSS-only hack. That is the
  symptom patch; the mode/surface coupling is the cause.
