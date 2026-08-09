# MPI-505 Brief — H3 Turbo LoRA + the acceleration verdicts

Bench session 2026-08-09. Started as "are SageAttention / SolAttn / EasyCache viable
for H3, LTX and WAN?" and ended somewhere better: **H3 is the only non-distilled
video model we ship, so it is the only model with headroom for any of them.**

## The weight

`drbaph/MiniMax-H3-Turbo-Lora-ComfyUI`, variant `v4_step600_ema` (README's
recommended build; the non-EMA sibling is "for testing and comparison").
Original author `larryvrh`, licence **Apache-2.0** — different from the H3
transformer's own CLA entry (`licences.js` → `minimax-h3-cla-2026-08-02`), so
decide whether it needs its own licence record before ship.

Staged to R2 and verified:

```
loras/minimax-h3/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors
620,285,592 bytes   sha256 7098acf3ee75028fd9fcd948f50fcc8d995057fabb76f86bd3ca2c0ffc58e409
HTTP 200, Content-Length matches, rclone's own exit 0
```

Upstream settings: **8 steps** (6–8), **euler**, **beta**, LoRA strength 1.0,
sigma shift video 12 / **audio 4–6**. Model defaults are 12 / **3.0**, so the
audio shift must move or audio distorts. README documents t2v only — i2v/fl2v is
upstream-untested.

## Measurements — 864x480 (the app's baked default), warm, 2s clip

| config | time |
|---|---|
| two-stage, 20 steps, no EasyCache | 204.02s |
| two-stage, 20 steps, EasyCache | 168.75s |
| single-pass, 20 steps, no EasyCache | 174s |
| single-pass, 20 steps, EasyCache | 136s |
| **turbo, 8 steps** | **90–96s** (4 runs: 91.59 / 90.07 / 96 / 91) |

Turbo is the headline: **204 → 96s, −53%.**

## Verdicts, with the reason each one is final

**SageAttention — dead.** Already rejected three times here: MPI-50 (local engine,
too fragile), MPI-189 (Pod; upstream `#157` ships a Triton-only package, `#219/#291/#330`
open on cu130), MPI-145 (`--use-sage-attention` crashes LTX-2.3 on Ada sm_89 —
4090/4060 Ti — engine dies, WS drops). Measured **~2x SLOWER** on Windows embedded
Python: Triton JIT fails with no toolchain, leaving pure overhead.

**SolAttn — deferred, no card.** Real method (NVIDIA, arXiv 2607.24027, block-sparse
with proxy-score reuse) and kijai's node does detect H3 and WAN. Blocked by four
independent things: `triton` is engine-owned and filtered out of our curated dep set
(`compile-node-deps.mjs` `isEngineOwned()`, `engine.js` `ENGINE_OWNED_PKG`); Windows
embedded Python has no compiler; **the repo ships no LICENSE file**; and it is
Triton/CUDA-only so **Mac (MPS) can never run it**. No `is_ltx` branch either.

**EasyCache — worth shipping, non-turbo only.** Already in the shipped engine
(`comfy_extras/nodes_easycache.py`, core ComfyUI, node id `EasyCache`) — zero pip, zero
pin, both engines, works on Mac. Worth **−22%** on the single-pass 20-step path.
But it needs steps: at 8 steps it skips **0**. And it **cost 12% on a cold run**
(81.00 → 90.51 at the old resolution), so it must never be a silent default.

Its skip pattern is structural, reproduced across seeds: **0 skips in stage 1, 4 in
stage 2.** `easycache_sample_wrapper` is an `OUTER_SAMPLE` wrapper whose `finally`
calls `reset()`, so each `SamplerCustomAdvanced` gets its own cold lifetime — stage 1
pays ~2 steps of warmup and sits in the high-sigma region where per-step change always
clears `reuse_threshold`. Stage 2 is the low-sigma region it is built for.

**LTX and WAN — out of scope, and not for lack of trying.** Every one is already
step-distilled upstream:

| model | steps | why the seam cannot be collapsed |
|---|---|---|
| LTX 2.3 (both tiers) | 8 | the two stages use **different samplers** (`euler_ancestral_cfg_pp` → `euler_cfg_pp`) |
| WAN 2.2 14B | 6 (`ManualSigmas` 1.0/0.93/0.85 then 0.85/0.65/0.45/0.25/0.0) | the seam is the **MoE expert boundary** — High-noise UNET hands off to Low-noise at 0.85 |
| WAN 5B | 4 | already one sampler |

LTX "High" vs "Balanced" is **precision** (bf16 vs int8), not distillation — all four
weights are `ltx-2.3-22b-distilled-1.1_*`. A turbo LoRA there would be distilling a
distilled model. Reopen only if a non-distilled LTX-2.3 ever ships as a quality tier.

## Graph work done on the bench (engine user dir, NOT yet exported)

`engine/.../user/default/workflows/minimax_h3_fl2va_template.json` (+ r2va, same edit).
Turbo gating, all four switches off one `Get_turbo`:

```
UNETLoader[129] -> EasyCache[321] -> MiniMaxH3SigmaShift[322](12,5)
                -> MpiLoraModelClip[323](EMA) -> Input_Lora_1[246] .. Input_Lora_6[252]

[337] sigmas   true=BasicScheduler[140](beta,8)  false=[338](simple,20)
[340] step     true=MpiInt[341]=3                false=MpiMath[328]("10 if a else 5")
[345] sampler  true=KSamplerSelect[152](euler)   false=[346](res_multistep)
[343] strength "1.0 if a else 0.0" -> [323].strength_model AND .strength_clip
```

Driving **both** strengths matters: `MpiLoraModelClip` only short-circuits when
`strength_model == 0 AND strength_clip == 0`, and that short-circuit is what makes
turbo-off skip the file load entirely (house pattern, same as krea2's `Accelerator Lora`).

Single-pass path (`Input_Single_Pass` + `Set_single`): `MpiIfElseInverted[363]` routes
the initial latent to `out0 -> [153]Stage1_Bypass` or `out1 -> [348]Single`, and
`MpiIfElse[359]` picks the output. The un-taken branch emits an **ExecutionBlocker**,
which cascades through `[320]MpiStageLatents` and kills the stage-1 sampler AND its
save. A lazy-refusal approach would NOT work here — a blocker travels downstream only,
and the sampler is downstream of the latent split.

## Open questions, in priority order

1. **`204.02s` is one unverified sample** and it is the entire justification for
   single-pass. Re-run 20 steps / EasyCache off / two-stage / warm. If it comes back
   ~174, **drop single-pass altogether** — no boolean, no app injection, no
   `progressStages` edit, no r2va graph work.
2. `shift_audio` 4/5/6 made **no audible difference** — verified not to be a plumbing
   fault (`ModelPatcher.clone()` preserves `object_patches` and `model_options` via
   `deepcopy_list_dict`, so the value does reach `model.py:527`). Baked at 5. The audio
   improvement came from euler/beta, not the shift.
3. **Check the Console for `NOT LOADED`** (`comfy/sd.py:125`) on the EMA weight — proves
   the LoRA keys actually bind. Without it, a green run could be the base model at 8 steps.
4. Consider `MpiLoraModel` (model-only) instead of `MpiLoraModelClip` — krea2's precedent
   is model-only, and it removes the CLIP-keys question.
5. Gate `EasyCache` off turbo — 0 skips at 8 steps means it is pure bookkeeping there.

## Intended ownership (write to files.json on the todo -> doing move)

```
comfy_workflows/raw/minimax_h3_fl2va_template.json
comfy_workflows/raw/minimax_h3_r2va_template.json
comfy_workflows/minimax_h3_fl2va.json
comfy_workflows/minimax_h3_r2va.json
comfy_workflows/scripts/workflow_generation/generate_h3.py
js/data/modelConstants/loraDeps.js
js/data/modelConstants/models.js
js/data/promptControlDefaults.js
js/data/commandRegistry.js
js/data/progressStages.js
js/components/Organisms/MpiPromptBox/PromptBoxControls.js
js/services/commandExecutor.js
```

## Notes for whoever picks this up

- **The first run after flipping any injected boolean is not warm.** A 96s outlier
  against three ~91s runs was exactly this. Discard run 1 of every config.
- **A model-side widget change costs a re-patch (~19s here).** `MiniMaxH3SigmaShift`
  calls `add_object_patch("model_sampling", ...)`, so touching it re-uploads the
  transformer + LoRA. Seed-only changes stay warm. Never compare across a re-patch.
- **Same seed + same graph = `execution_cached`**, which measures nothing. Vary the
  seed between repeat runs; pair seeds across configs being compared.
- `progressStages.js` needs `single: 2` -> `single: 1` on both H3 rows **if** single-pass
  ships. Turbo does **not** need a new axis — it changes bar length, not bar count. A
  wrong count is worse than a missing one: the bar advertises a total that never arrives.
- Ship the toggle as a **sibling** `h3Turbo` control, not a reuse of `krea2Turbo` —
  that one emits `prompt:krea2-turbo` to hide the negative-prompt toggle, and sharing
  the control id would share one `perModel` storage key across model families.
