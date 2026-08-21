# MPI-566 — validation

## Human, in the app (Fabio, 2026-08-14) — PASS

A closed pink outline traced around a face in Paint Adjust, Fill pressed: the enclosed area filled
solid in the picker colour, outline included, nothing outside touched. Confirmed after a Ctrl+R
reload — no app restart needed, since the change is renderer-side.

## Automated

- `tests/mask-hole-flood.test.cjs` (new, 8 cases) — the flood's geometry, testable for the first
  time because the extraction made it pure. Hole found, notch open to the border correctly NOT a
  hole, solid shape and empty layer both null, the antialiased inner rim covered with the outer rim
  left partial, the boxed flood identical to a full-canvas reference, and the pad.
  **Mutation-checked**: dropping the pad (`x0 - 1` → `x0 - 0`) fails the pad case.
- `tests/paint-adjust.test.cjs` — the shared-flood delegation, undo ordering, the on-screen source,
  the composite order, no mask publish, both destinations wired, and the forwarding sweep.
- `tests/mask-adjust.test.cjs` — the mask twin's delegation and undo ordering, unchanged in effect.
- 607/607 node tests, `eslint js/` clean.

## Chromium pixel probe (pre-fix, composite only)

Off a real antialiased green outline at `#58e044`, filled with `#e0446b`: interior lands at
`[224,68,107,255]`, the stroke keeps `[88,224,68,255]`, outside stays `[0,0,0,0]`, **0**
partial-alpha pixels on the inner rim and **693** kept on the outer, box `52,52 196×196` on a
300² canvas. The mask twin preserves a separate blob inside the box — the `putImageData` regression
the composite is written to avoid.

## The miss this card should be remembered for

The probe proved the composite and the suite proved the wiring **on MpiCanvas**, and the button was
still dead on arrival: `MpiCanvasViewer` forwards to `MpiCanvas` by hand, one assignment per method,
and `fillPaintHoles` was added to `MpiCanvas` and to its `_methods` allowlist but never to the
viewer. `viewer.el.fillPaintHoles` was `undefined`, the panel's `?.()` swallowed it, and the click
returned falsy with no error and no console entry. Fixed in `98a3bc64`.

**The allowlist test was necessary and never sufficient — there are two hops, and it checked one.**
The guard added covers the class rather than the name: every `viewer.el.X?.()` the panel reaches for
must be assigned in `MpiCanvasViewer`. It fails on the pre-fix source, naming `fillPaintHoles`.
