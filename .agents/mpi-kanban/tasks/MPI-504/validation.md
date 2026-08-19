# MPI-504 — validation

## 2026-08-19 · enhancer recipe regression (no generation)

**Ran:** the Prompt Enhancement chain of `krea2_t2i_template.json`, rebuilt node for node in API
form and posted to the bench engine `127.0.0.1:8188` — `qwen3vl_4b_abliterated_fp8_scaled`
through core `TextGenerate`, temperature 0.5, seed 0, four regression inputs per arm, four arms
(v1, v2, v2 with `use_default_template` false, v3). No image was generated.

**Result: the drafted recipe FAILED and was replaced.** v1 returned the example that lived
inside its own instruction as the answer for 2 of the 4 inputs, discarding the user's character
entirely. v3 fixes the leak, the length band and the place/light/camera exclusion; it does NOT
fix positive phrasing, which no wording tried could fix on this model.

**Not closed by the recipe, closed in the graph instead:** two core `RegexReplace` nodes,
verified offline against all four real v3 outputs — negation gone 4/4, rear-view clause kept
4/4, trailing full stop gone 4/4. Patterns in prompts.md §2.

**Null result worth keeping:** `use_default_template` true vs false on `58 TextGenerate` with a
manual ChatML string produced byte-identical output on all four inputs, with node `58` executing
fresh in both arms (`/history` reports only `["69","420"]` as `execution_cached`, so this is not
the caching trap).

Full run, every output verbatim, and the runner:
[research/enhancer-regression-2026-08-19.md](research/enhancer-regression-2026-08-19.md).

## 2026-08-19 · graph strip

**Ran:** a script copy of `comfy_workflows/raw/krea2_t2i_template.json` to
`comfy_workflows/raw/flow_character_sheet.json` with the seven groups named in plan.md deleted
whole. Group membership was computed from each group's bounding box and asserted against the
plan's per-group counts (Edit 40 · Upscale 27 · Images 21 · Detailer 19 · Stitch Edit 14 ·
Depth 9 · Loras 6 = 136) **before** anything was written; all seven matched.

**Result:** 218 → 82 nodes, 276 → 98 links, 10 → 3 groups. 178 dead links removed, 3 dangling
input refs and 1 dangling output ref nulled, `extra.reroutes` 9 → 6 and `extra.linkExtensions`
4 → 4 pruned to surviving link ids. Post-strip audit: node ids unique, **every remaining link
resolves to two live nodes**, 82 = the plan's predicted 31 + 8 + 12 + 31.

**Not yet done, and not claimed:** the graph has not been opened in the bench editor, not
executed, and nothing has been added. The collapse pass is the next step and its worklist is in
plan.md.
