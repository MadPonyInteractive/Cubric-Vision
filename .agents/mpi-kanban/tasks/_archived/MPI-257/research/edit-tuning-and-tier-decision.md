# Boogu-Image — edit tuning + tier decision (LIVE-TESTED)

Concluded from a ~25-run live A/B session in ComfyUI (G:), 2026-07-11. Image-EDIT only (T2I not yet tested). All conclusions are eyeball-verified on real edits, not doc claims.

## SHIP DECISION — THREE tiers, edit (T2I still to test separately)

| Tier | Model file | Size (GB / GiB) | VRAM | Steps | Speed | Role |
|---|---|---|---|---|---|---|
| **Low / Fast** | `boogu_image_edit_turbo_int8_convrot` | 11.37 / 10.59 | ~12 GB | **8** | fast | Mediocre-but-quick. "Have fun" tier. Nails simple single edits; undershoots dense/global. |
| **Balanced** | `boogu_image_edit_fp8_scaled` | 10.31 / 9.61 | ~12 GB | 25 | ~217 s | Near-production, gate-safe, best size. The pragmatic default. |
| **High** | `boogu_image_edit_bf16` | 20.59 / 19.17 | ~16 GB | 25 | ~298 s (this rig); ~40–60 s on a 5090 | Production quality. Best compositing on dense multi-op. What you'd use for real work. |

**Shared deps (once, all tiers):** `qwen3vl_8b_fp8_scaled` (10.59 GB, text encoder) + `flux1_vae_bf16`/`ae.safetensors` (0.17 GB, ALREADY on R2 as existing dep — reuse, zero upload). Total NEW weight to upload if 3 tiers ≈ 52.9 GB (3 diffusion + qwen3vl_8b; VAE reused).

Tier philosophy (user): High = production (user would pick bf16 for real work); Balanced = almost-production; Low = meh/fun. bf16's compositing edge on hard edits IS the production margin — not tier-padding. Confirmed keep.

**bf16 hot-store = RESOLVED, no problem.** VERIFIED the constant: `HOT_STORE_MIN_BYTES = 15 * 10**9` (15 GB, env `CUBRIC_HOT_STORE_MIN_BYTES`) in `mpi-ci/cubric-vision-pod/wrapper/wrapper.py:118`. It's a FLOOR not a ceiling: files **≥15 GB get STAGED to fast container disk** (hot-store, MPI-194). bf16 (20.59 GB) is ABOVE the floor → it gets the FAST disk path, not blocked. fp8/turbo (10–11 GB) sit below 15 GB → stay on the volume (fine). So bf16-high ships clean on the remote engine — the gate HELPS it. (Earlier notes said "20 GB gate, bf16 breaches" — that was wrong on both the value AND the direction; corrected here.)

**Multi-image is a WORKFLOW feature, orthogonal to tier** — image_1/image_2 slots work on ALL three weights. Exposing multi-image does NOT require a specific tier. Don't conflate.

- **bf16 CORRECTION (supersedes earlier reject).** First pass judged bf16 ≈ fp8 and rejected it (squirrel 3D-restyle test: near-identical, +37% time, 2× size, breaches ≥20 GB hot-store gate). WRONG on hard edits. On the 4-op max test (remove + church + nun + cop-with-bible), **bf16 wins clearly**: full church interior, proper habit, full uniform, natural lighting, NO paste-collage — while fp8 followed all 4 ops but looked like cut-paste layers (flat light, attribute leak). bf16 ≈ fp8 on SIMPLE edits; bf16 > fp8 on DENSE multi-op compositing. That gap is what justifies a high tier.
- **OPEN TRADE:** bf16 (20.6 GB) crosses the ≥20 GB per-file hot-store gate → remote-Pod disk cost. fp8 (10.3) is gate-safe but composites worse on dense edits. Decision pending: ship bf16-high (eat the gate) vs fp8-high (accept flatter dense-edit compositing) vs both. Needs the multi-image test + a call on whether dense 4-op edits are even a real user path (they produce collage on ALL variants — app should steer to 1–2 ops, which may make fp8 good enough and moot the gate problem).
- **turbo-LoRA-on-full-weight = REJECTED.** Cross-applying the T2I turbo LoRA (`boogu_image_turbo_hotfix_lora_rank_128_bf16`, model-only, no CLIP) onto the full Edit weight for a fast-edit hack degrades the WHOLE image (face reworked, skin plastic, color undershoots to terracotta not red). Qwen-style cross-apply works structurally (shared 10B transformer, keys are `diffusion_model.*` backbone-level) but quality is unacceptable. Don't re-propose.

## Multi-image input — `TextEncodeBooguEdit` uses SEPARATE reference latents (NOT stitched)

Verified from `comfy_extras/nodes_boogu.py` source: each of `image_1`/`image_2` is VAE-encoded **independently** into its own latent, appended to a `ref_latents` LIST, attached as `reference_latents` (append=True) to both positive+negative conditioning. It does NOT concat/stitch the images into one canvas.

**Consequence for the app:** do NOT pre-assemble/montage two images into one input — that collapses the reference into a collage. Wire the real `image_1`/`image_2` slots. (The "node just stashes images together" rumor applies to OTHER community nodes, not Boogu's native one.)

**BUT — model officially = SINGLE reference only.** The Edit model card states verbatim: *"Only support 1 reference image for now. Will try our best to support more reference images. Stay tuned!"* So the ComfyUI node exposes image_1+image_2 and encodes BOTH into separate ref latents, but the MODEL was only trained on single-reference edits. Dual-image is untrained territory — image_2 may be ignored/half-used. DO NOT ship or advertise multi-image reference edits until live-proven to work beyond the card's claim. Single-image edit is the validated capability. (Live test in progress: red-haired woman from image_1 → replace subject in image_2 + text edit. Result will show whether Comfy's dual-latent wiring exceeds the base training.)

**Text editing IS an official feature** (card): "precise text editing — replacing/adding/removing characters, EN + CN, adapts font/weight/color/layout." Rare for an edit model (most garble text). Worth leveraging; test for reliability given FLUX VAE's weak text reconstruction.

## The core finding: turbo needs 8 steps, NOT 4

The official template + docs say 4-step turbo. **At 4 steps the turbo EDIT checkpoint is broken** (reframes, hallucinates props — "free shrubbery"). **At 8 steps it behaves.** The turbo edit models were never broken — they were step-starved. This is the single most important correction; it flips the whole "turbo is unusable for edit" conclusion.

## Instruction-magnitude undershoot (the tier split, quantified)

turbo (8-step) under-commits high-magnitude / global / stacked edits; fp8 (25-step) commits fully. Scored on the max test ("remove middle woman + church bg + left→nun + right→cop-with-bible", 4 ops in one prompt):

- **turbo_int8 = 2.5 / 4** — removed ✅, church ✅(partial), cop+bible ✅ but kept gym shorts+socks (½), nun ❌ skipped.
- **fp8_scaled = 4 / 4** — all ops landed (full habit, full uniform + bible, church interior).

Earlier corroboration: "make Viking fat" → fp8 = properly fat, turbo = buff-not-fat. "Style → 3D animated" → fp8 committed to 3D shading, turbo only removed the black outlines (barely moved).

**Rule:** turbo does the "loud" ops (remove, big add), drops/half-does the "quiet" ones (local restyle). fp8 does all.

## Model-level limitation (affects BOTH tiers — a UX note, not a reject)

- **Dense multi-op → "Photoshop collage" blending.** 4 stacked ops: fp8 followed all 4 but the compositing looked pasted (cutout edges, flat light, attribute leak — nun ended up with the other woman's kitty-paws + socks). **App should steer users to 1–2 ops per edit**, not 4.
- **Small faces/eyes get artifacts** — baked-in: FLUX VAE high reconstruction loss. Not a knob. Fix = app-side upscale (users have upscalers; embedding an upscaler in the workflow is OUT OF SCOPE — that's the App-system work, MPI-256). Post-edit upscale/detailer expected.
- Boogu beats **Qwen-Image-Edit** here (user's read): Qwen over-smooths + raises contrast; Boogu holds texture + identity.

## Resolution law (HARD)

- **Dims MUST be ÷16** = VAE downscale 8 × transformer patch_size 2 (Boogu inherits Omnigen2; `patch_size=2`, `sampling_settings.shift=3.16` baked in `supported_models.py`). Non-÷16 dims get internally padded → edge/frame slop.
- Resize node "scale total pixels" does NOT snap to a grid → follow with **`Mpi Round To Multiple` (multiple_of 16, round UP)**. Round-DOWN starves the face of pixels (mush); round-UP keeps detail.
- **~1.0 MP is the safe zone.** >1.0 MP (tested 1.5 @ 1088×1456, 2.0) → the model **drifts anatomy/composition** (wider hips, reshaped body, relit scene, added foliage) on BOTH turbo and full. 1.5 MP is NOT "more detail" — it's more hallucination. Ship at ~1 MP round-up-16.

## Sampler / scheduler (verified from official Comfy-Org template JSON)

- **Edit** template: `dpmpp_2m` + `simple` scheduler + 25 steps + cfg 3.5, via SamplerCustom + KSamplerSelect + BasicScheduler + **`ModelSamplingAuraFlow` shift 3.16** (node applies the model-baked default; generic node default 1.73 is WRONG for Boogu).
- **Turbo** template: `lcm` + `sgm_uniform` + 4 steps + cfg 1.0, plain KSampler, negative = `ConditioningZeroOut` (no ModelSamplingAuraFlow node). For turbo EDIT use **8 steps** (see above), cfg ≥ 1.0 (below 1.0 = prompt ignored).
- Keeper knob law: sampler = **euler or dpmpp_2m**, scheduler = **simple or sgm_uniform**, **shift 3.16**. res4lyf/ClownsharKSampler = untested, no community data, SKIPPED (user decision).
- GGUF text encoder = BROKEN (shape mismatch 12288 vs 4096) → use the fp8 encoder (`qwen3vl_8b_fp8_scaled`). No seed UI (house rule).

## Files on disk (G:/CubricModels, mapped via extra_model_paths)

- `diffusion_models/boogu_image_edit_fp8_scaled.safetensors` (10.3 GB) — HIGH tier
- `diffusion_models/boogu_image_edit_turbo_int8_convrot.safetensors` (11.4 GB) — BALANCED tier
- `diffusion_models/boogu_image_edit_bf16.safetensors` (20.6 GB) — rejected, keep for reference or delete
- `text_encoders/qwen3vl_8b_fp8_scaled.safetensors` — shared encoder
- `vae/ae.safetensors` — flux VAE, already present (reuse existing dep)
- `loras/boogu/boogu_image_turbo_hotfix_lora_rank_128_bf16.safetensors` — T2I turbo LoRA (model-only); NOT for edit path (rejected)

## Hotfix note

No edit-turbo hotfix FILE exists — the Edit-Turbo fix ships as source-repo git revision TAGS (`hotfix-1k-20260708`), NOT a `*_hotfix_*` .safetensors. T2I turbo is the only variant with dedicated hotfix files. Unverified whether Comfy-Org's `boogu_image_edit_turbo_int8_convrot` was packed from the fixed revision (filename won't say) — but it tested well at 8 steps, so moot.

## Still open (T2I, not this session)

T2I tier not tested. When we wire T2I: turbo LoRA (hotfix, model-only) on Base weight = the intended 4-step T2I speed path. Different from edit.

## Next session(s)

Two clean-boundaried future sessions (NOT a resume — each starts fresh from this note):

1. **Test T2I tier** — same rig/method. Base weight + T2I turbo hotfix LoRA (`boogu_image_turbo_hotfix_lora_rank_128_bf16`, model-only, `LoraLoaderModelOnly`) at 4-step for the fast T2I path; Base at 25-step for quality. Decide T2I tiers (likely mirrors edit: turbo/fp8/bf16). Sampler: turbo = lcm/sgm_uniform, base = euler/simple, shift 3.16, ÷16 round-up, ~1MP.

2. **Build workflow + wire the model** — author the ComfyUI edit workflow (Input_*/Output_* tier-2 titles, capture = `Output_Image`), then run `/mpi-add-model` (enforces `docs/add-model-playbook.md`): dependencies.js entries (3 edit weights + qwen3vl_8b; VAE `ae.safetensors` REUSE existing dep, no upload), R2 upload (`--s3-no-check-bucket --bwlimit 3M`), `/mpic-compute-dep-hashes`, models.js ModelDef with the 3 tiers (low=turbo-int8 / balanced=fp8 / high=bf16), progressStages.js bar count, new `model.type` consumer sweep, enhanceRecipe → existing recipe. NOT a version bump. Multi-image (image_1/image_2) = optional workflow surface, half-works, decide whether to expose. User downloads weights (has them local at G:/CubricModels); R2 upload source = local.

## One-line summary

Boogu-Image EDIT = fast, high-quality SINGLE-image edit specialist (beats Qwen/FluxKline on single-edit quality; loses to Qwen on multi-ref + ControlNet, neither of which Boogu has yet). Reliable text edit. 3 tiers. Ship it for what it's good at; Qwen stays for multi-ref/CN.
