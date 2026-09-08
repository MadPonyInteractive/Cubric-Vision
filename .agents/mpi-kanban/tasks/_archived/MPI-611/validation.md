# MPI-611 Validation

## What was wrong

Tab inside an open Flow ran the `gallery` leg of the ring — `state.currentPage`
is still `gallery` under the flow overlay — so it emitted `flows:open` and put the
**Flow Library** on screen on top of the flow. There was no way back into the flow
by keyboard, and the ring's third stop listed flows instead of being one.

## What changed

Ring is now **gallery → last card → the open Flow → gallery** (it ran
card → gallery → Library before). The flow leg PARKS the instance:
`flow:suspend` hides the overlay without the outward `close`, so the shell's
MPI-345 destroy never fires and `flow:restore` shows the same instance back.
The Library survives only as the fallback third stop when no flow is open.

The flow's hotkeys (`flow.step.back/forward`, `generation.run`) moved from
instance-lifetime binds to per-show `_bindKeys()` / `_unbindKeys()`. Without that,
a parked flow would keep them live: arrows stepping an invisible carousel, and
Ctrl+Enter queueing a phantom flow run from the gallery — MPI-345 in a new shape.

## Evidence — live app, 2026-08-23

Own instance (`npm run app:isolated`, port 62667, never :3000), driven with
`playwright-cli`. Project seeded with one card, flow opened via
`Events.emit('flow:open', {flowId:'outpaint'})`.

| Step | Expected | Read back |
|---|---|---|
| Tab on gallery | the card | `currentPage=group-history`, `groupId=c16086b5…` |
| Tab on card, no flow open | Library (fallback) | `.mpi-flow-library` present |
| Tab in Library | gallery | `currentPage=gallery`, library gone |
| Tab in an open flow | parked, gallery visible | `.mpi-base-flow` absent, node still alive (detached), `.mpi-gallery-grid` present, Library NOT opened |
| Tab again | the card | `currentPage=group-history` |
| Tab again | the SAME flow back | `document.querySelector('.mpi-base-flow') === window.__mark` → `true`, `data-mpi611="same-instance"` |

Hotkey handler counts (`Hotkeys._handlers`): flow shown → `generation.run` 2,
`flow.step.forward` 1. Flow parked → 1 and 0. So a parked flow is inert.

Regression check on MPI-345: closing the flow for real (overlay X) still
destroys — a following `flow:restore` brings nothing back.

`npm test`: 706 pass, 0 fail (includes the new `flow-frame.test.cjs` case pinning
suspend + the per-show binds). `npx eslint` on all touched files: clean.

## Left for Fabio's eyes

Whether the ORDER feels right in daily use, and whether the Library deserves to
stay in the ring at all when no flow is open. Mechanics are verified; the feel is
a UI call.
