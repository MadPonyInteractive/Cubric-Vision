# MPI-530 — Character consistency at the bench

Umbrella created by the consolidation sweep, 2026-08-10. Two `todo` cards, one bench
track.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-348 | Krea2 swap workflows: face / head / character — co-develop in the node graph |
| MPI-504 | Character Sheet flow — attributes or a reference photo in, a video-reference sheet out (front body HEADLESS) |

## Current State

Not started as a pair. MPI-504 is at `research` and its `brief.md` already reads
`../MPI-348/brief.md` — the link exists, this file only makes it a shape.

## Why one card and not two

Both are the same bet: **consistent characters with no LoRA training**, as Flows on Krea2
(memory `project_lora_free_character_system`). Both are authored by Fabio in the ComfyUI
node graph first, with the agent supplying node semantics, graph topology and the measured
regimes — proven in the graph BEFORE any Flow is built. Both consume the same Krea2
knowledge: `docs/models/krea2/injection.md`, `docs/models/krea2/resolution.md`, and the
measured `ref_boost` table in `docs/models/krea2/editing.md` (which MOVES — read it there,
never cache the numbers).

And they feed each other in one direction: the character sheet is the keystone artifact,
and the swap family is what consumes a locked character. Building the swaps against
ad-hoc references means re-deriving the reference format the sheet is supposed to define.

Three of the four shipped flows are marked for deprecation (MPI-529 rips them), so this
track is where the next real Flow comes from.

## Phase 1: The sheet

MPI-504. The layout that works as a VIDEO reference is the unknown, and the front body is
HEADLESS — that is a production hack, not an oversight; `~/.claude/memory/domain/ai-video-asset-production.md`
carries it along with "never run an image through a model twice", the 3/4 location plates
and the empty camera-walk trick. Read it before designing the sheet.

**The LoRA-training sheet is out of scope** — a different beast, and the card says so.

## Phase 2: The swap family

MPI-348. Face swap, head swap, character swap/restage on krea2edit, against the sheet
format phase 1 settles. Head Swap already ships as flow #1 (`comfy_workflows/flow_head_swap.json`)
and is the working reference topology.

Flow outcomes discovered along the way get spun out as their own cards — do not grow this
umbrella into a Flow-wiring card. Wiring a Flow is `/mpi-add-flow` and its playbook.

## Verification

Bench-side, at the node graph: a sheet that holds identity across regenerations, and a swap
that keeps it. Memory `tool_author_and_verify_a_comfy_workflow_offline` has the offline
half — CLONE donor node objects, and a `graphToPrompt` diff of 0 proves the graph without
paying for a run.

## Parallel Batch

None. Phase 2 consumes phase 1's output format by construction, and both are
user-in-the-loop bench sessions rather than dispatchable file edits.

## Plan Drift

(none yet)
