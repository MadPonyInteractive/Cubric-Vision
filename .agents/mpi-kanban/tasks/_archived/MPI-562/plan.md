# MPI-562 — Dropping media onto History: the half-built handler and the third composite front end

Umbrella created by the consolidation sweep, 2026-08-14. Two `todo` cards, one drop path
in `MpiGroupHistoryBlock.js`: **a dropped image has to become a history entry before
anything can be built on top of it.** MPI-454 is already recorded as BLOCKED BY MPI-377.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-377 | Media dropped into the History workspace vanishes — it must become a history entry |
| MPI-454 | Composite Place — a transform gizmo that scales and positions an image ON TOP of the current entry |

## Current State

MPI-377 is `planned` with the root cause already located; MPI-454 is `blocked` on it and has
no design work beyond its description. Nothing started.

MPI-377 is a live user-facing bug, reported by the user as "works as a bug": drag an image
into the History workspace and nothing visible happens — no new entry, nothing on the canvas.
The file is not lost, it silently became a PROMPT CHIP, which the user only discovers after
running an op and seeing their dropped image come out of the latents.

## Why one card and not two

Same handler, and one is the other's foundation. MPI-454 places a slot image on top of the
selected entry and flattens the result into a NEW history entry — which is the exact
sequence MPI-377 has to build first (`createImageItem` → `appendToHistory` → persist →
`historyList.appendEntry` → `viewer.loadEntry`). Building Composite Place against a drop path
that cannot yet produce an entry means writing that sequence twice, in two places, and the
second one will be the one that drifts.

## Phase 1: Finish the drop handler (MPI-377)

Root cause is located: `MpiGroupHistoryBlock.js:913-921`. The drop overlay's `onDrop`
uploads the file and then does exactly one thing — `_pb?.el?.injectMedia?.(...)`. It never
creates an item, never appends to history, never touches the history list, never loads the
canvas. **The drop overlay itself is fine; the handler is half a feature.**

Fix: after `uploadMediaFile`, run the same sequence `_runComposite` already runs for its
result at 1881-1894. **Copy that path rather than inventing one.**

**THE DESIGN CALL — entry AND chip, or entry only?** The chip behaviour is LOAD-BEARING in
video mode: dropping a start/end frame is how a user unlocks the frame-driven i2v ops when
no media is staged (see the comments at ~217 and ~919), and `_isVideoPromptToolActive()`
deliberately hands drops to the PromptBox while the video prompt tool is active. **Do not
strip the chip globally to fix an image-mode bug.** Most likely answer: image drops create
an entry AND stage the chip; video-mode prompt-tool drops keep today's chip-only behaviour.
Settle this before writing code.

## Phase 2: Composite Place (MPI-454)

The third composite front end. The slot image sits ON TOP of the selected entry, moved /
scaled / rotated by a gizmo with handles like the shape gizmo, then flattened into a new
history entry — a cut-out object from another generation or a photo, dropped onto an
existing image, then detailed to blend.

Two contracts to read before starting rather than rediscover: `docs/composite.md` (the two
existing front ends, the SCRATCH cut, the inverted brush meaning, cover-fit on client AND
server, pasted slots) and `docs/masking-shapes.md` (the ONE gizmo already mounted under both
the mask and paint mounts, its handles, and Shift/ALT). This is a third front end on an
existing system, not a new gizmo.

## Verification

Phase 1: drop an image into History in image mode — a new entry appears in the list, loads
on the canvas, and survives a project reload. Then repeat in video mode with the video prompt
tool active — the chip behaviour is unchanged and the frame-driven i2v ops still unlock.

Phase 2: place an image over an entry, transform it, flatten — the result is a new history
entry and the source entry is untouched.

## Parallel Batch

**None.** Strictly ordered, and both members own `MpiGroupHistoryBlock.js`. Phase 2
additionally reaches the composite and gizmo surfaces. Derive ownership from each member's
`files.json` at dispatch time, not from this list.

## Plan Drift

(none yet)
