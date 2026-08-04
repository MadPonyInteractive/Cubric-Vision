# MPI-437 — validation

## Automated — PASSED 2026-08-04

- `tests/mask-composite.test.cjs` rewritten around the corrected behaviour and run
  against real Sharp output: a 4px-thick ring mask over a red base and a blue
  overlay now leaves the enclosed centre RED (was BLUE), keeps the painted ring
  itself BLUE, and leaves the area outside the ring RED. `fillHoles: false` matches
  the default, and `fillHoles: true` still fills — the opt-in is not dead code.
- Full suite **374 pass / 0 fail**. Lint 0 errors.
- **Two negative controls, both bit**: restoring the old `!== false` default, and
  deleting the fill call entirely (which breaks the opt-in half). Both restored
  byte-identical.

## Root cause — confirmed, not inferred

`services/imageComposite.js` ran `if (fillHoles !== false) fillMaskHoles(...)`, and
a grep of every consumer showed the flag is **never passed**. So it was `undefined`
at every call site and the fill was unconditional. The route's own JSDoc justified
the default with "matching MaskDetailerPipe's contour_fill" — a justification
**MPI-431 had already deleted**, when it turned `mask_fill_holes` and `contour_fill`
off in every raw template for exactly this failure (an edge band silently refilled
into a disc). The graph half of that sweep landed; this server route kept a private
copy.

## User check — PENDING

Re-run the reported repro: paint, take an edge-band mask, composite. Only the band
should come through; the enclosed interior should keep the base image.

**RESTART THE SERVER FIRST.** `services/` and `routes/` are main-process code —
Ctrl+R reloads the renderer only, and a stale server would show the OLD behaviour
and read as "the fix did not work".
