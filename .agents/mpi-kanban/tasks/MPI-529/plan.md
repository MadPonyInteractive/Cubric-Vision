# MPI-529 — Flow Library v2

Umbrella created by the consolidation sweep, 2026-08-10. Two `todo` cards with a hard
ordering between them.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-332 | Rip the 3 deprecated test flows (image-regen, sdxl-4k, video-stitch) — keep Head Swap |
| MPI-259 | Flows v2 — install/multi-model flows, UI design pass, 2nd flow |

## Current State

Not started. MPI-332 carries the full delete list (descriptors in
`js/data/flowsRegistry.js`, the workflow JSONs, and everything only they touch); MPI-259
carries the deferred-path list.

## Why one card and not two, and why the ORDER matters

MPI-259's deferred paths — the Install button end to end, a flow whose required model is
NOT installed, flows declaring MULTIPLE required models, the reuse matrix — were written
against the three flows MPI-332 deletes. Those three were plumbing tests for the Flow
Library frame (MPI-256/259/306), never released, marked for deprecation. Exercising v2's
install and reuse paths against them means proving the paths work on fixtures that are
about to leave the repo, and then re-proving them afterwards.

So MPI-332 first, always. Head Swap (MPI-299) is flow #1 of the real product and STAYS,
along with the portable frame — it becomes the fixture v2 is built against.

Note the naming history when reading old prose: July text says "App"; everything shipped
has been "Flow" since `985faa09` (memory
`project_civarchive_lora_browser_and_workflow_cards`).

## Phase 1: The rip

MPI-332. Delete the three descriptors and everything only they touch. This is a
delete-only pass — the frame, the carousel, Head Swap and the reuse routing all stay.
Grep for each removed flow id across `js/` and `comfy_workflows/` before declaring done; a
descriptor removed while a workflow JSON or a reuse entry still names it is a half-rip.

The Flow Library is dev-gated, so this is not user-visible and does not gate a release.

## Phase 2: v2, against a real flow

MPI-259, now with Head Swap as the only fixture. Order inside it is the card's own, but
the install-an-app flow comes first: a badge and install routing for a flow whose model is
missing is the path with the most unknowns, and the multi-model and reuse-matrix cases sit
on top of it. The overlay UI design pass and the 2nd flow follow.

New flows discovered along the way get their own cards — see MPI-530 for the
character-consistency track, which is where the next real flow is coming from.

## Verification

Phase 1: the app boots, the Flow Library lists Head Swap only, and no grep hit survives for
the three removed ids. Phase 2 is user-visible UX, so it needs the app — spin your own
(`npm run app:isolated`), never the user's `:3000`.

## Parallel Batch

None. Phase 2 is defined as "after the rip", and both phases reach
`js/data/flowsRegistry.js`.

## Plan Drift

(none yet)
