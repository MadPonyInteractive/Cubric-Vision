# MPI-615 Validation

## Ran and passed (2026-08-24)

| check | result |
|---|---|
| `validate-injection-rules.mjs` on all 3 converted API templates | `All 3 file(s) conform to the injection rules.` |
| `orchestrate.py` | 9 runtime files rebuilt; klein rebuilt byte-identical (no diff), so the bake is deterministic |
| `verify-workflow.mjs` on all 9 runtimes, against the **APP engine** :48188 | `All 9 file(s) validate.` Every class registered, every combo in range, every link type-compatible. The only findings are 4 checkpoints Fabio has not installed locally (`SDXL_NSFW`, `ILL_Anime_Beauty`, `PONY_Mix`, the LTX bf16 unet) — not failures. |
| `npm test` | **729/729 pass.** `inject-params-titles` is the load-bearing one: it asserts every `opInject` title exists in every workflow its op runs, AND that every op with a workflow has an `opInject` entry. |
| `npm run release:check` | `Release health check passed.` |
| `node scripts/smoke-workflows.mjs --plan` | `preflight (offline, free): all ops resolve a graph, a branch and a budget ✓` — the plan now lists `inpaint` for the SDXL and Krea 2 graphs alongside Klein. Nothing rented, nothing spent. |
| bare-Node registry harness (7 models) | `inpaint` returned by `getAvailableCommands('image', model, {imageCount:1, canMask:true})` with `available: true` for all 7. `modelShowsStyleRack` true on Krea 2 only. Chroma did NOT gain the op; Klein's `Input_wf_type: 5` intact. |

## What the graph read proves (source: the raw JSON, node by node)

- SDXL branch: `Get_img1` is the RAW `Input_Image` (`Set_img1 ← MpiLoadImageFromPath`), and
  `InpaintStitchImproved` returns it at input size — so the op is input-sized and the ratio
  picker would be a lie. It never mounts one, so nothing to declare.
- SDXL takes no `Get_denoise` on this branch: LanPaint has no denoise input and the hi-res
  `KSampler` bakes `0.4`. Correct that the op mounts no denoise slider.
- Krea 2 branch DOES read `Get_turbo` three ways — `MpiMath "8 if a else 15"` (steps),
  `MpiMath "1.0 if a else 2.0"` (cfg), and `MpiIfElse` picking the accelerator-patched
  model. That is why `krea2Turbo` was added to the op's `components`.
- `MpiMaskSquareBbox` and `MpiLatentUpscale` both exist at the pinned MpiNodes commit
  `38b3a27a` (checked with `git show <pin>:__init__.py`), so the SDXL branch needs no pin
  bump. `smoke-workflows --plan` agrees: *"first-party nodes: every Mpi\* class_type exists
  at MpiNodes 38b3a27a OK"*.

## NOT proven — the second gate is Fabio's

**No live generation was run on the new branch.** Gate 1 (author + prove on the local
ComfyUI) is what the re-export itself represents; gate 2 is an in-app run, and it needs a
real mask painted in the UI on a real image. Everything above is static: the engine will
ACCEPT these graphs, and the app will DISPATCH slot 5 for the right op. What no check here
covers is whether the result looks right.

The cheap version: open an image in the app, paint a mask, pick **Inpaint** on SDXL
Realistic or Krea 2, and give it an instruction that names its target.

## Noted, deliberately not fixed (pre-existing, not this card)

Every shipped runtime carries whatever prompt the author last had in the graph —
`generate_krea2.py` is the ONLY generator that scrubs (`[SCRUB] Input_Positive → ''`).
`ltx_i2v_t2v.json` now ships `"a woman having a shower, naked, soaping her body…"` where it
used to ship a knight; `qwen3vl_4b_prompt_enhancer.json` already shipped
`"a nude woman laying in bed with spread legs"`, and 14 other runtimes carry test prompts.
The value is always overwritten by injection at dispatch, so it is cosmetic — but it ships
in the product. A blanket scrub would be WRONG for `Input_Negative`, which several graphs
bake deliberately (LTX's black-bars negative). Worth its own card.
