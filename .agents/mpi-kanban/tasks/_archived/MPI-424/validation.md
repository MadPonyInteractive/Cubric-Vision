# MPI-424 Validation

Umbrella card. It holds no implementation of its own, so its validation is simply that
the five cards it sequenced have each shipped, in the recorded order, and that the
taxonomy they mount into still describes what is in the tree.

## The five, in the order this card recorded

| # | Card | Shipped | What it left behind |
|---|---|---|---|
| 1 | MPI-425 | done | The taxonomy — the frame every other one mounts into (`docs/masking-tools.md`) |
| 2 | MPI-382 | done | Adjust, and THE PREVIEW CONTRACT (`discardPreview()`), which 368 and 373 both extend |
| 3 | MPI-368 | done | The shape gizmo — one component, two mounts (`docs/masking-shapes.md`) |
| 4 | MPI-375 | done | The paint layer and the shared brush engine `brushDab.js` (`docs/painting.md`) |
| 5 | MPI-373 | done | The Composite group — one operation, two front ends (`docs/composite.md`) |

No card started before the one above it shipped, so the "unless this card records why the
order changed" clause was never needed.

## Acceptance, line by line

- **MPI-379 rejected outright** — brainstormed with the user 2026-08-01 and closed as a
  record of the decision, not trimmed and not parked. Canvas-side hover selection is
  complexity he does not want; the thumb strip and the Detect button stay.
- **The taxonomy is recorded and every card carries its re-scope** — `brief.md` holds the
  architecture; the taxonomy table lives in `docs/masking-tools.md` and every family in it
  now has a shipped rail button. MPI-425's rule that only working tools get a button, never
  a greyed placeholder, held for all five.
- **Recorded order kept**, 425 first.
- **This card held no implementation** — its own diff is brief/plan/validation only.
- **It closes when the last of them ships** — MPI-373 was user-tested and closed
  2026-08-04, so it closes with it.

## The thesis, tested

The umbrella's claim was that *a new destination never means a new engine*. It survived
contact: `brushDab.js` drives the mask, paint AND composite brushes; `MpiMaskStrip` grew a
`DESTINATIONS` row for each rather than a branch; the shape gizmo mounts twice off one
`MOUNTS` table. The one place the pattern legitimately broke is written down — Composite is
a real canvas MODE rather than a flag, because its cut brush competes for the pointer.

## Follow-ups, independent and already carded

MPI-435 (alpha brush pack) and MPI-436 (Adjust for the paint layer) were never part of the
five. They sit in `todo` with their own cards and neither blocks nor is blocked by anything
here — this umbrella does not stay open for them.
