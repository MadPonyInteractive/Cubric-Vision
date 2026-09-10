# MPI-713 validation

## What shipped

`ComfyUi-MpiNodes` commit `1f808a9`, on `origin/main`.

`MpiMaskPreview` (`img.py`, `MpiNodes/Debug`, display "Mpi Mask Preview") - paints a flat
colour through a `MASK` onto an `IMAGE` and previews it in-graph. Subclasses `PreviewImage`,
`OUTPUT_NODE = True`, and still returns the composited `IMAGE` so it can be chained.

Widgets, as specified by the user: `color` (INT, `display: "color"`, default `0`),
`invert_mask` (BOOLEAN), `alpha` (FLOAT, default `0.70`), `index` (INT, default 0). No
`source`, no x/y, no `resize_source`.

`pick_from_batch` lives in `help_funcs.py`, per `new-node.md` step 3, written against a batch
of anything since a MASK and a LATENT index identically.

## Evidence

17 asserts on the bench python (`G:/ComfyUi/python_embeded/python.exe`, real torch; the
ComfyUI modules `img.py` imports are stubbed so nothing boots the app). All passed:

- colour decoded per channel (red and green both checked, so it is not being treated as one number)
- all-white mask paints everywhere, all-black mask returns the plate untouched
- `invert_mask` in both directions
- `alpha` 0.0 (no-op), 0.5 (exact blend arithmetic), 1.0
- `index` positive, negative from the end, and out of range in both directions (clamps)
- a mask batch of 1 broadcast over a 5-frame clip
- a bare `(H, W)` mask accepted
- resolution mismatch resampled NEAREST - asserted that no intermediate values appear, which
  is the property that keeps a coarse mask looking coarse
- empty batch returns `ExecutionBlocker` with an empty `ui.images`, rather than `IndexError`
- the previewed tensor is the one returned
- the destination is not mutated in place
- shipped widget defaults are the user's numbers, and black at 0.70 over a 0.25 plate
  leaves 0.075 - dark but not the flat 0.0 that would hide everything
- `img.py` holds no local copy of `pick_from_batch`; it uses the `help_funcs` one

`py_compile` clean on `img.py`, `help_funcs.py`, `__init__.py`.

Script: scratchpad `smoke_maskpreview.py` (session-local, not committed).

## User acceptance

Tested live in the authoring bench 2026-09-10: "I just tested it, and it works fine". The two
default changes that followed (`color` 0xFF0000 -> 0, `alpha` 1.0 -> 0.70) are the user's own
numbers and were amended into the same commit before the push.

## Procedure

`.claude/commands/new-node.md` was NOT read before the node was written - `update-node.md` was,
for MPI-712, and the new-node procedure was applied from memory. Read afterwards at the user's
prompt and audited against: steps 2, 5, 6, 7 and 8 were already satisfied; step 3 was not, and
moving `pick_from_batch` into `help_funcs.py` is the fix. Nothing else was missing. Read the
matching command file BEFORE the work next time, not after.

## Deliberately NOT done: the pin bump

`dev_configs/node_lock.json` is still at `287edb8`. Standing decision from MPI-712: a peer
agent has ongoing node work and owns the bump. Their sha will be a descendant of `1f808a9`,
so this node rides along.
