# MPI-441 Validation

**Verify mode:** user-ux — the reported symptom is visual and the user filed it from screenshots.

**Result: PASSED, user-validated in the app 2026-08-04.** "yeah, he looks good. It's working fine."
Two screenshots: Grow +50 on the hoop-athlete mask, and a 35px outward Edge band. The arms track
instead of thinning, the gaps between limb and torso stay open, the band follows the real
silhouette including between the arms and legs. Entry pause was not raised, so live preview stays.

## Automated (agent-owned)

- [x] `node --test "tests/*.test.cjs"` — **408 pass, 0 fail**
- [x] The new case confirmed to FAIL against blur-and-threshold before the old code was deleted.
      `tests/mask-distance-field.test.cjs` reimplements it (three box passes, sigma ≈ r, cut at
      0.1587*255) and asserts the failure in CI: the 6px limb is lost at r=20, the 24px gap is
      filled at r=10. Both are what the field keeps. The comparison stays in the file so the
      regression cannot come back silently.
- [x] `npx eslint js/` — 0 errors (19 pre-existing warnings, none in the touched files)
- [x] Real-pixel probe, Chromium at 1536², thin + concave subject (14px arm, 86px gap to torso):

  | Reading | Expected | Measured |
  |---|---|---|
  | grow 20, arm left edge | 481, not 480 | 481, not 480 |
  | grow 20, arm right edge | 534, not 535 | 534, not 535 |
  | grow 20, 14px arm centre | survives | survives |
  | grow 20, 86px gap | open (2r = 40 < 86) | open |
  | band 10/10 on torso edge | 591–610 | 591–610 |
  | shrink 50, torso edge | 651, not 650 | 651, not 650 |
  | shrink 50, 14px arm | removed (2e = 100 > 14) | removed |

- [x] Cost measured, not estimated: field build **125 ms once** in `beginAdjust()` (and after each
      Apply, which re-snapshots); each frame **3.5 ms** including `putImageData`, **flat in r**.
      The old primitive was free to enter and 8.7 ms per frame, 17.4 ms for a band — so a drag is
      now cheaper and only tool entry is not. Live preview kept on those numbers; preview-on-release
      was not needed. Node and Chromium agreed on the build cost (126 / 125 ms).

## User pass (in the app)

- [x] Person mask, **Grow +50** — outline out by 50 everywhere, arms track, limb gaps stay open
- [x] **Edge band** 35px outward — follows the silhouette, including between the limbs
- [x] Live preview still feels live — the entry pause was not reported as a stutter

## Not covered here

Shrink and the inward half of the band were verified by measurement (unit tests on half-planes, and
the 1536² probe above) rather than by eye in the app. The user exercised Grow and the outward band.
