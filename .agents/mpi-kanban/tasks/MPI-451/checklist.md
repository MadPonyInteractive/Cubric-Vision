# MPI-451 checklist

- [ ] `js/data/modelConstants/licences.js` — descriptor registry keyed by model id,
      plus `hasAcceptedLicence` / `recordLicenceAcceptance` over one localStorage key.
      Keyed by id, NOT inlined on the ModelDef: `models.js` is being edited concurrently
      by the H3 wiring session, and 20 clauses of legal text do not belong in it.
- [ ] MiniMax H3 descriptor — Section V verbatim, Exhibit A verbatim (20 items),
      Excluded Territories, the MiniMax request-form URL, the Discord report route.
- [ ] `MpiLicenceGate` compound (`MpiModal` + scroll-gated pane + two checkboxes).
- [ ] Register its CSS in `js/shell/preloadStyles.js` and its props in `js/components/types.js`.
- [ ] Guard in `downloadService.start()` — gated ids only; the non-gated path stays
      synchronous so `download:started` still fires before `_install()` returns.
- [ ] `tests/licence-gate.test.cjs` — passthrough / blocked / accepted / version bump.
- [ ] Verify live in the app (the gate opens, the scroll gate unlocks, Accept installs).
- [ ] Confirm the H3 model id with the wiring session — a mismatched key is a silent no-gate.

## Deliberately NOT in this card

The NOTICE file, the in-app licence text and the "Powered by MiniMax H3" attribution are
in MPI-452's acceptance criteria even though this card's brief mentions them. The gate
links the licence rather than bundling it.
