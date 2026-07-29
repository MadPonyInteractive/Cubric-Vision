# Handoff — masking rebuild, next session

Written 2026-07-29 at session close. Read this first; it has the order you asked for.

## The order (this is the thing you wanted written down)

**MPI-382 → MPI-368 → MPI-379.** MPI-376 (undo) is done and shipped, which is why it
came first. The board's `To do` column is now physically in this order, so the top of the
board IS the order — you don't have to remember it.

| # | Card | What |
|---|---|---|
| — | ~~MPI-376~~ | **Undo/redo. SHIPPED** `7db2aad0`, live-verified. Card in `doing`/`validating`. |
| 1 | **MPI-382** | Grow / Shrink — one live slider that dilates or erodes the mask |
| 2 | **MPI-368** | Shapes — rectangle / triangle / ellipse gizmo, Add or Subtract |
| 3 | **MPI-379** | Hover-to-select on Detect (+ the open COCO-YOLO question) |

(MPI-385, the RunPod verification umbrella, still sits above all of these on the board.
It is unrelated to masking — it clears the Pod-only leftovers from 380/384/346/135.)

Why this order: 382 and 368 both **bake irreversibly** into `manualCanvas`, so undo had to
exist before either shipped or every bad gesture was permanent. 379 is selection, which is
already reversible by clicking again, so it goes last.

## What landed this session

Undo/redo on the mask layers — Ctrl+Z / Ctrl+Shift+Z. New
`js/components/Primitives/MpiCanvas/managers/UndoStack.js`, owned by `MpiCanvas`.

The design in one line: **`manualCanvas` + `subtractCanvas` are the only persistent layers**
(`maskCanvas` / `autoCanvas` are derived by `_recomposite()`), so undo restores those two and
re-derives — which is why the MPI-371 auto-picks-union-LAST order survives any undo for free.

Full detail: **`docs/masking-undo.md`**. Validation record:
`.agents/mpi-kanban/tasks/MPI-376/validation.md`.

## Before you write ANY layer mutation in 382 / 368 / 375

Read `docs/masking-undo.md` § "The contract" first. Short version:

- **layer-wide one shot** (a bake, a Clear, a grow release) → `mask._recordUndo()` **before**
  mutating, after any early-return guard
- **a gesture** (stroke, drag) → `undo.begin(mask.undoLayers())` … `undo.commit(mask.takeStrokeBox())`
- **a LOAD** that replaces the layers → record nothing, clear the stack

A mutation that skips the stack is a **silent hole in Ctrl+Z** — nothing fails loudly, and undo
that works for some edits but not others is worse than none. Each of the three cards now carries
this contract in its own description, and it is in the CLAUDE.md Critical Rules Snapshot and
`.claude/rules/dos_and_donts.md`.

**Specifically for MPI-382:** `UndoStack.pendingLayer(i)` already hands back the pristine copy
captured at `begin()` — that IS the anti-compounding drag-start snapshot that card needs. Do not
build a second one.

## Open threads

- **MPI-376 is in `doing` / `validating`, NOT done.** One path is unverified: **Add/Subtract
  bake undo**, because it needs a detect run and therefore an engine. It uses the same
  `_recordUndo()` that the verified `clear()` uses, so the risk is low — but it is unexercised.
  One click with an engine up closes the card. Also browser-surface only, never Electron.
- **CHANGELOG STILL HELD.** The standing instruction is one `UNRELEASED.md` entry for masking
  when the rebuild is complete, not one per card. Undo landing does **not** release the hold —
  shapes (MPI-368) has not landed. Nothing was written to the changelog this session.
- **MPI-386** (new, filed this session): dismissing the 18+ age gate leaves an orphan
  full-viewport `.mpi-modal-backdrop` that swallows every click on the landing page. Found
  incidentally; **Electron first-run impact is unknown and should be checked first**.
- Other sessions' uncommitted work is still in the tree (MPI-353, MPI-355/, MPI-358/, the root
  `events.jsonl`, and a kanban archive relocation). Untouched deliberately — not mine to commit.
