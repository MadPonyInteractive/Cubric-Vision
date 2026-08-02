# MPI-428 — checklist

- [x] Schema-gate the sync: `/object_info` answers for `InpaintCropImproved`,
      `InpaintStitchImproved`, `MpiMaskSquareBbox`, `MpiAnyChecker`, `MpiIfElse` — done
      2026-08-02, all 200.
- [x] `node scripts/sync-raw-workflows.mjs` — raw → API template → `orchestrate.py` bakes
      `boogu_edit_high.json` + `boogu_edit_balanced.json`. Both at 43 nodes (HEAD: 33).
- [x] Injection-rules gate passes — re-run standalone 2026-08-02:
      `node scripts/validate-injection-rules.mjs comfy_workflows/boogu_edit_{high,balanced}.json`
      → both ✓.
- [x] Baked files carry `Input_Mask` (`MpiString`), `InpaintCropImproved` +
      `InpaintStitchImproved`, `MpiMaskSquareBbox`, `MpiAnyChecker`, 2× `MpiIfElse`, and
      `Input_Tier` = 1 (high) / 2 (balanced).
- [x] `comfyui-inpaint-cropandstitch` added to BOTH Boogu ModelDefs' `dependencies`
      (`boogu-edit-high` + `boogu-edit-balanced`). Key already exists in `nodesDeps.js`
      (line 234) — Klein and the Head Swap app were the prior holders, so no new registry
      entry and no new download for anyone who already has Klein.
- [x] `progressStages.js` still correct — `{ single: 1 }` holds. The graph carried 2
      `SamplerCustom` nodes BEFORE this change too (one per tier chain, `Input_Tier`
      selects); the crop/stitch branch adds no sampler. Verified against `HEAD`.
- [x] Node test suite green — `node --test "tests/*.test.cjs"` → 305 pass, 0 fail.
- [ ] Close the bench, then live-verify in the app: masked edit on a source **over
      1536px** (crop path + resolution preserved) AND an unmasked edit (whole-image path
      still runs). **`G:\ComfyUi` is holding port 8188 right now — close it first or every
      dispatch silently runs on the bench.**
- [x] `docs/releases/UNRELEASED.md`: localised-edit bullet EXTENDED with Boogu Image Edit
      (single bullet, no duplicate) — already committed.
- [x] `docs/masking.md` model list updated (line 17 names Boogu's single-file graph) —
      already committed.
