# MPI-428 — validation

## Live verification — PASSED (user, 2026-08-02)

Masked edit on **Boogu Image Edit B** (balanced tier, `boogu_edit_balanced.json`),
local engine, in the history workspace:

- Source `edit_014`, 832×1248, mask painted with the mask brush.
- Prompt `Make it a furry Chihuahua.`
- Result `edit_015` — the chihuahua is generated **inside the masked area only**;
  the woman, the surf and the rest of the frame come back untouched, and the entry
  keeps its 832×1248 dimensions.

That exercises the whole new branch end to end: `Input_Mask` (MpiString) →
`MpiAnyChecker` → the `mask` loader → `MpiMaskSquareBbox` → `InpaintCropImproved` →
sampler → `InpaintStitchImproved`, with both `MpiIfElse` gates picking the `has_mask`
= true side. No dimension error, no `unknown class_type`, no missing-node prompt.

App side needed only the `comfyui-inpaint-cropandstitch` dependency line: the pack was
already on disk (Klein/Krea2 installed it), the runtime workflow is `fetch`ed fresh per
dispatch with no cache, and mask delivery was already generic — so a plain Ctrl+R was
enough to pick the change up. That was checked before telling the user, not assumed.

## Static checks

- Injection-rules gate ✓ on both baked files.
- 43 nodes each (HEAD: 33), `Input_Tier` = 1 / 2, no dangling links, `output_padding`
  `'32'` matching Krea2/Klein/Qwen (it is a string combo, not an int).
- `node --test "tests/*.test.cjs"` → **305 pass, 0 fail** (includes `inject-params-titles`
  and `output-prompt-capture`, which sweep model × op against graph titles).
- `npm run lint` → 0 errors (18 pre-existing warnings in `heroStats.js` /
  `preloadStyles.js`, untouched by this card).

## NOT proven — read before assuming this is fully covered

1. **No source over 1536px was tested.** The verification image was 832×1248, so
   `MASK_MAX_EDGE` never engaged and `MaskManager.getURL()`'s `_toSourceScale()` was a
   no-op. `InpaintCropImproved` asserts `mask dims == image dims`, and that assert is
   exactly what broke Klein in released 1.3.0 (MPI-365 fix 2). Boogu uses the same mask
   producer, so it inherits the fix by construction — but the inheritance is reasoned,
   not measured. A single masked edit on a >1536px source would close this.
2. **The unmasked (whole-image) path was not re-run after the graph change.** It is not
   the old wiring any more: it now flows through `MpiIfElse 226 false → Input_Image` and
   `MpiIfElse 208 false → MpiAnySwitch`, with the mask loader's `block_if_empty: true`
   short-circuiting the crop branch. That is the same shape Klein proved on 2026-08-02,
   and the branch is selected by the same `MpiAnyChecker` boolean the masked run already
   exercised — but no unmasked Boogu edit has actually been dispatched since the sync.

Both are cheap to close on the next Boogu run. Neither blocked the user, who approved
final completion after the masked run.
