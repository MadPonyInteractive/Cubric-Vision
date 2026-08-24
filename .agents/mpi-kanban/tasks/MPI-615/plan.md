# MPI-615 Plan

Fabio re-exported three LiteGraph sources on 2026-08-24. Two of them grew a branch the
app had no op for; the third changed shape.

## What the re-export actually contains

| raw | change |
|---|---|
| `sdxl_t2i_template.json` | +20 nodes: `MpiMaskSquareBbox` → `InpaintCropImproved` → `LanPaint_ImageEncode/KSampler/ImageDecode` → `MpiLatentUpscale` → a hi-res-fix `KSampler` (denoise 0.4) → `InpaintStitchImproved`, landing on `MpiAnySwitch10.any_5`. **`Input_wf_type` 5 = inpaint.** The graph's own `Workflow types` note now reads `5 = inpaint`. |
| `krea2_t2i_template.json` | +25 / -4: the same LanPaint chain reusing the edit path's `InpaintCropImproved`, on `Input_wf_type` 5. Steps/cfg come from `Get_turbo` (8/1.0 turbo · 15/2.0 quality). The three per-branch `Accelerator Lora` nodes collapsed into ONE (`Set_model accel`) whose strength is `0.7 if is_inpaint else 1.0`. |
| `ltx_i2v_t2v_template.json` | `MpiReroute #160` deleted. That reroute was the tap letting stage 2 read the model BEFORE the LoRA stack. Stage-2 guiders #32/#326 now take #258 ← `Transition Lora` #191 ← `MpiIfElse` #627 — the same fully-patched model stage 1 uses. **That is the quality change.** LoRA PATHS are unchanged from HEAD (checked node-by-node); they were already subfoldered `ltx-2.3\…` and already match `loraDeps.js`. |

**No new injection surface anywhere.** `Input_*` / `Output_*` title sets are byte-identical
to HEAD in all three files, so the only app-side work is teaching the ops about slot 5.

## Steps

1. raw → API → runtime. `sync-raw-workflows.mjs` refused (a peer's uncommitted
   `display/flow-draw-it-in.mp4` tripped its dirty-generated guard, which globs all of
   `comfy_workflows/`), so run its steps 2–5 by hand: commit raw, `workflow-to-api.mjs`
   per file, `validate-injection-rules.mjs` gate, `orchestrate.py`. → verify: gate clean,
   9 runtime files rebuilt.
2. Wire `inpaint` into 5 SDXL cards + 2 Krea 2 cards: `supportedOps`, `opInject`
   (`Input_wf_type: 5`), `workflows`, deps, and `styleOps` on Krea 2 only.
   → verify: `tests/inject-params-titles.test.cjs`.
3. `krea2Turbo` onto the `inpaint` op — the Krea 2 branch genuinely reads `Get_turbo`.
   → verify: it renders only under `capabilities.turboToggle`.
4. Docs: one shared doc for the branch (three families run the same one), plus the stale
   "slot 5 is dead" claims and the now-false LTX stage-2 note.
   → verify: no `5 = ---` / `5 unused` left in `docs/`.
5. Prove it. → verify: `verify-workflow.mjs` against the APP engine, `npm test`,
   `release:check`, `smoke-workflows.mjs --plan`.

## Decisions worth keeping

- **`imageSizedOps` deliberately NOT touched.** That list gates exactly one thing, the
  `ratio` control, and `inpaint`'s `components` never mount it. Adding `inpaint` there
  would be dead config. Klein has always omitted it for the same reason — that is not a
  bug in Klein.
- **Chroma stays out.** Its master template has no LanPaint branch; slot 5 is still dead
  there and declaring it would silently run t2i.
- **The two node packs are declared even though they install anyway.** Both are
  `type: 'custom_nodes'`, so `getUniversalWorkflowDepIds()` already ships them with the
  engine. Declared so the ModelDef reads true and the uninstall sweep never strands them.
