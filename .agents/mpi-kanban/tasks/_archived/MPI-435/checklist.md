# MPI-435 — checklist

- [ ] `brushDab.js`: ten preset PARAMETER SETS + `getPreset()` + `dabExtent()`; `stampDab`
      and `strokeDabs` take an optional preset and default to today's hard round
- [ ] Jitter is DETERMINISTIC in (x, y, i) — the mask brush stamps the same dab into
      `manual` and `subtract` and the two must stay exact mirrors
- [ ] `MaskManager` + `PaintManager` carry `brushPreset` and grow the stroke box by
      `dabExtent(r, preset)`, not `r`
- [ ] `MpiCanvas` setters + `_methods` allowlist; `MpiCanvasViewer` surface
- [ ] Picker on `MpiMaskStrip` as a DESTINATION row (mask + paint yes, composite no),
      persisted under the destination's tool key
- [ ] `tests/brush-presets.test.cjs` — extent maths, spacing, preset table shape
- [ ] `npm test` green, eslint 0 errors
- [ ] Pixel probe in Chromium: scatter stays inside the undo box, spacing stays
      continuous at speed, mask twin layers stay exact mirrors
- [ ] `docs/painting.md` § the shared dab records the pack (200-line cap)
- [ ] User's in-app pass
