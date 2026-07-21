# MPI-261 Validation

Verify mode: user-ux.

## Result: PASSED — user-verified in the running Electron app (2026-07-12)

- **Phase 1** (CROP_RATIOS + cinema icons): node self-check + test green.
- **Phase 2** (Crop tool Ratio/Free + Divisible input): user confirmed RATIO/FREE only,
  cinema ratios present. Follow-up: portrait cinema icons were showing landscape wide-rects;
  fixed with 4 tall portrait icons + repointed portrait table. User re-verified.
- **Phase 3** (apply round-up): user cropped t2i_001 — crop_002 = 1024×432, crop_003 = 240×432,
  both divisible by 16 (the earlier 1024×439 / 439×237 non-multiples are gone). User: "looks good".
- **Phase 4** (Resize default 16): both DEFAULTS === 16 (assert + test); already on HEAD via peer commit a0da51b7.
- Automated: tests/crop-ratios-divisible.test.cjs 3/3; ratio-modes-exhaustive + krea2 11/11; ESLint clean.

Video crop round-up (absoluteCropPx bypass in videoCrop.js) is logic-verified + lint-clean;
image path proves the shared helper. Not exercised on a real video this session.
