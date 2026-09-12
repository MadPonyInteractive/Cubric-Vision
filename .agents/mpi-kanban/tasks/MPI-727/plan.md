# MPI-727 — Plan: a flow's result follows the user across steps

Read [brief.md](brief.md) first — it carries the user's words, the root cause, and the spec table.
This file is the route through the code.

## Current State — 2026-09-12, CUT AND NOT STARTED

Cut from MPI-664's Song run. Nothing built. The root cause is named in the brief and does not need
re-deriving: the run slide is rebuilt on every navigation and the result pane is closure-held, so
the media element is destroyed on the way out and never rebuilt on the way back.

**The single next action:** read `MpiBaseFlow.js:477-519` (the `_result*` closure vars and
`_resultView`) and find every site that renders or clears the result pane. That set is the surface
this card changes.

## The shape of the fix, as far as it is known

Unverified as an implementation plan — confirm against the code before committing to it.

1. **The result has to outlive the slide.** Today it is closure state rebuilt per navigation. It
   needs one owner that survives a step change, with the slide and the floating window as two
   VIEWS onto the same media element rather than two elements.
2. **Move the element, never re-create it.** See the brief's 🔴. `appendChild` of a playing
   `<audio>`/`<video>` preserves playback; a new element with the same `src` does not. This is the
   whole card — get it wrong and the symptom survives the fix.
3. **The gate is three conditions ANDed:** a result exists, the flow is open, the user is not on
   the last step. Put it in one predicate, not three scattered `if`s.
4. **Per-type presentation** — video loops muted, image is a thumbnail, audio is the player. That
   is a property of the result's KIND, and the frame already knows media kinds
   (`MpiBaseFlow.js:151` matches `^(image|video|audio)\d*$` on a role).

## Parking, deliberately

- Where exactly "top right" sits relative to the flow's own chrome, and whether the window is
  draggable or dismissible. Fabio said top right; anything beyond that is a question for him, not
  an invention. Ask before adding a close button — a window the user can dismiss and not get back
  is a new bug.
- Multi-result flows (a batch). Today's complaint is one result; do not build for N until asked.

## Verification

**Verify mode:** `user-ux`

See the brief's Verification section for the full list. The one that matters: **press play, change
step, the sound never breaks.**

## Ownership

See [files.json](files.json). 🔴 **`js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` is
contended** — MPI-664 is live in that file for two unrelated fixes (the `@` picker's Tab key and
the voice roster's persistence). Check `.agents/mpi-kanban/state/index.json` for an active claim
before editing it, and `mpi-message` the owner rather than editing over them.
