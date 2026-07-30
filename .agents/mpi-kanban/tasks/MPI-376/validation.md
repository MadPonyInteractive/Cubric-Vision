# MPI-376 — validation

Live smoke 2026-07-29, browser at http://127.0.0.1:3000/, real project
("Cubric prompt tests"), real history entry, mask Brush tool armed through the rail.
Mask layer 912×1140. Strokes driven as **real mouse events on the canvas container**, so the
whole `InputController → MaskManager → UndoStack` path ran — not the API in isolation.

## Results

| Check | Result |
|---|---|
| stroke A, stroke B | 0 → 3960 → 7927 mask px |
| undo ×2 | 7927 → **3960** → **0** (exact match to the pre-stroke counts) |
| 3rd undo / `canUndoMask()` at bottom | `false` / `false` — no throw |
| redo ×2 | 0 → **3960** → **7927** (exact) |
| 3rd redo | `false` |
| new edit after undo | redo branch dropped (`canRedoMask() === false`) |
| **Ctrl+Z (real KeyboardEvent)** | 10568 → 7927, depth 2 |
| **Ctrl+Shift+Z** | 7927 → 10568 |
| **Ctrl+Z while focused in a TEXTAREA** | mask **untouched**, depth unchanged — native text undo preserved |
| eraser stroke (writes BOTH layers) | 10568 → 8172; undo → **10568** exact |
| `clearMask()` | → 0; undo → **10568** exact |
| mask-tool swap (Brush → Points) | mask intact, depth 3, `canUndoMask()` still true |
| **entry switch** | depth 3 → **0**, `canUndoMask() === false` |
| op-strip resync | `viewer.hasMask()` false → true (stroke) → false (undo) |

## Measured cost — `getUndoStats()`

- brush stroke (dirty rect): **58,824 – 73,272 B** (59–73 KB)
- layer-wide op (Clear): **8,317,440 B** = 7.93 MB = exactly `w × h × 4 × 2`
- stroke is **<1%** of a full snapshot — the dirty rect is carrying the design
- at `MASK_MAX_EDGE` (1536) a full-layer entry would be 18.9MB; the 96MB budget holds ~5

## Bug found and fixed BY the smoke

`bytes` counted a discarded redo branch forever. Measured: 2 strokes → 117,648 B; undo →
117,648 (correct, an undone entry still holds its pixels); new stroke → depth 2 but
**176,472 B** (3 entries' worth). Every undo-then-edit-again inflated the total and would
evict live history early. Fixed by crediting the discarded entries back in `_push()`;
re-measured live at **117,648 B** for depth 2. Guarded by a new unit test
("discarding the redo branch credits its bytes back").

## Add / Subtract bake undo — CLOSED by the user 2026-07-30

**User-verified.** The bake path was exercised by the user themselves as part of their own
testing of the undo system, on an engine, before this card was picked back up. That was the
card's last open item, so the card closes on it.

Nothing in this file's measured record changes — the bake shares the `_recordUndo()` layer-wide
path that `clear()` already proved restores exactly (`10568 → 0 → 10568`), so the user's run
exercised the one call site that had no coverage rather than a different mechanism.

## Still not covered (deliberately, not a blocker)

- **Electron desktop.** Everything above ran on the browser surface. The undo stack is pure
  renderer code with no main-process leg, so the surfaces are not expected to diverge — but it
  is unexercised there and worth noting rather than implying.

## Unrelated defect seen while setting up — carded as MPI-386, and it did NOT reproduce

Dismissing the 18+ age gate appeared to leave an **orphan `.mpi-modal-backdrop`** — zero
children, full viewport, `z-index: 10009`, `pointer-events: auto` — swallowing every click on
the landing page. Carded as **MPI-386**.

**Re-ran that exact repro 2026-07-30 and it did not reproduce:** fresh profile, gate →
CONTINUE (which correctly *chained* the changelog, MPI-333 working) → dismiss left
`backdrops 0 / wrappers 0 / modals 0`, and a real click on the landing nav then succeeded with
no interception. Counts stayed balanced at 1/1/1 across the handover, so nothing stacks either.

**The observation above was a misread, and the trap is worth carrying:** a *live* `MpiModal`
backdrop is legitimately childless — `MpiModal.js:57-63` builds `.mpi-modal-backdrop` as a
**separate element** from `.mpi-modal-wrapper` — so "full-viewport, zero children,
`pointer-events: auto`" describes a perfectly healthy **open** modal exactly as well as an
orphan. Check for the sibling wrapper (and the parent — a live one sits in `page-landing`)
before calling a backdrop leaked. Electron first-run remains unchecked.
