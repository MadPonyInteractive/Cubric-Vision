# Investigation: New ratio table + Resize default

## Ratio union (FLUX/SDXL/SOCIAL)
- 9 distinct shapes: 1:1(1.0), 3:4(.75), 4:5(.8), 5:8(.625), 9:16(.5625) [portrait];
  4:3(1.333), 5:4(1.25), 8:5(1.6), 16:9(1.778) [landscape]. SOCIAL adds nothing new.
- Video tables (WAN/LTX/KREA2) only add 1:1/9:16/16:9. KREA2['1k']===FLUX_RATIOS (same ref).

## New CROP_RATIOS (pure aspect, no px), {portrait,landscape}
- portrait ratio<1, landscape>1, 1:1 in both, index-mirror flip reused.
- Cinema to add (user: real icons): 2:1(2.0/.5), 1.85:1(1.85/.5405), 21:9(2.333/.4286), 2.39:1(2.39/.4184).
- entry shape {label, ratio, icon}. icon keys use rect_* form (consumer does rect→ratio replace).

## Icons
- 9 ratio_* exist. Cinema (2:1,1.85:1,21:9,2.39:1) LACK icons → add stroke <rect rx=2/> entries
  ratio_2_1, ratio_185_1, ratio_21_9, ratio_2_39. Missing key falls to 'info' icon.

## Resize default divisible_by 1→16 — TWO files
- MpiToolOptionsResize.js:57 DEFAULTS.divisible_by.
- resizeInjector.js:23 DEFAULTS.divisible_by — injector falls back to OWN default when param absent;
  missing this = silent 1. clampInt(128) uses fallback only for non-finite. No auto-migration of saved
  projects (keep stored value until edited). Resize is ONE component for image+video (toolKey hardcoded
  'resize'), so one default per file covers both modes.

## family removal safety
- MpiToolOptionsCrop is the ONLY reader/writer of crop family. projectModel/projectService generic.
  Removing sdxl/flux/social → coerceSettings falls to DEFAULTS.family. No crash, no other consumer.

## Tests
- tests/ratio-modes-exhaustive.test.cjs + krea2-ratio-roundtrip.test.cjs touch ratios.js (no crop/divisible).
  Zero matches for divisible_by or FAMILY_VALUES in tests. Neither change breaks tests. Add: CROP_RATIOS
  shape test + both-DEFAULTS-agree(16) test.
