# MPI-585 Brief

**One compare surface, shared by every Flow that improves media the user supplied.**

Fabio, 2026-08-20: *"These will happen for other flows as well, so keep that in mind so
that we don't have to repeat code."* First consumer is `ltx-upscale` (MPI-584) - source
left, upscaled right, draggable reveal bar.

## What shipped

`MpiCompareView` (Compound) is now the ONE before/after surface: labels, an MpiCanvas in
`compare` mode, and the shared `compare.*` video transport. It states no size, so each
consumer supplies its own frame:

- `MpiCompareOverlay` - the History takeover, refactored onto it (197 -> 96 lines).
- `MpiBaseFlow` - a Flow's result pane, when the FlowDef declares `result.compare`.

**No third engine was built.** `ComparisonManager` + MpiCanvas already did the reveal bar,
the dual-video RAF sync and every image/video pairing; what was duplicated-in-waiting was
the transport living inside the History overlay, and that is what got lifted.

**The flow side stays data** (MPI-572): `result: { compare: 'inputVideo' }` names which
input is the BEFORE. One declaration covers video and image. Omit it where a comparison
says nothing - foley returns the same pixels, an extend's output is longer than its source.

## State

In `doing` / `validating`. Self-verified: 634/634 tests, eslint clean on every touched
file, both consumers proven live on Fabio's own 864x480 -> 1728x960 pair. Uncommitted,
awaiting his UI check - see `validation.md` § Outstanding.
