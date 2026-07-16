# MPI-292 — KREA2 edit: two image chips

KREA2 edit op accepts a 2nd reference image (place two characters in a scene). PromptBox
shows 2 image chips **only in `krea2Edit`**; injector maps chip 2 → `Input_Image_2`
(`MpiLoadImageFromPath`, self-gates on empty → 1-image edit runs fine). Workflow already
wired (`Input_Image_2` + `Mpi Crop`); user tested, works.

## Rule (directional / sticky — op is NOT a pure fn of count)
| Action | Result |
|---|---|
| Drop img 0→1 (t2i) | → i2i (auto, already works) |
| Drop img 1→2 (i2i) | → **edit** (auto) + fill chip 2 |
| Remove chip 1 of 2 (edit) | **stay edit**, chip2→chip1 (promote by position) |
| Remove last chip →0 | → t2i (auto, already works) |
| Drop more while 2 in edit | chip 2 replaced, chip 1 sticky (remove-all to reset chip 1) |

Only genuinely-new auto-switch = **1→2 up-jump to edit**, gated to models that HAVE a
≥2-image op (krea2). 1-img-max models just replace (today's behavior, no jump).

## Edits
- **A** `js/data/commandRegistry.js` — 2nd `mediaInputs` slot `Input_Image_2` on `krea2Edit` (required:false).
- **B** `js/services/commandExecutor.js` — dedup fallback loop (usedIds guard) so 1 dropped image never duplicates into `Input_Image_2`.
- **C′** `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — up-jump on 2nd image to the model's 2-image op; promote-on-remove already handled by role-by-position.

## Verify
Desktop test: 5 rows of the table above. 1-img edit → `Input_Image_2` unset (self-gated).

Sync (Input_Image_2 into 4 krea2 runtime files) already run + staged.
