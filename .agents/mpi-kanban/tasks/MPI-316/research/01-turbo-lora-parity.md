# MPI-316 — RAW + accelerator LoRA vs Turbo: A/B evidence

Session 2026-07-19 → 2026-07-20. All runs local, RTX 4060 Ti, ComfyUI, 768×1344.

**Verdict: PASS.** RAW SFW + `krea2_turbo_lora_rank_64_bf16` @ strength 1.0
reproduces Turbo seed-for-seed at lower wall-clock, on both an anime prompt and
a photoreal prompt. The 4-card Krea2 library can collapse to 2.

---

## 1. What the LoRA actually is

Read from the safetensors header of `krea2_turbo_distill_r64.safetensors`
(TheDivergentAI):

```
base_model:        krea/Krea-2-Raw
target_model:      krea/Krea-2-Turbo
extraction_method: svd_lowrank_weight_delta
ss_network_dim/alpha: 64
```

It is **Turbo extracted as an SVD delta from Raw**. So `RAW + LoRA@1.0 ≈ Turbo`
is the identity it encodes — parity at strength 1.0 is the design intent, not a
lucky result. Key naming is `diffusion_model.blocks.N.attn.*` (Krea-2's own
architecture, NOT FLUX `double_blocks`/`single_blocks`) — so FLUX accelerator
LoRA advice does not transfer.

Two files tested, same extraction in different key conventions:

| File | Source | Keys | Tensors | Size |
|---|---|---|---|---|
| `krea2_turbo_lora_rank_64_bf16` | Comfy-Org/Krea-2 | `lora_down`/`lora_up` | 535 | 469MB |
| `krea2_turbo_distill_r64` | TheDivergentAI | `lora_A`/`lora_B` | 530 | 469MB |

Output near-identical (20s vs 24s on the same seed). **Which LoRA is a dead
variable.** Ship the Comfy-Org one — official, and what users would find.

`extraction_report.json` per-rank reconstruction error: r64 0.461, r128 0.415,
r256 0.366. **The 46% error did not manifest perceptually** — SVD keeps the
high-energy directions, and seed-level composition rides on what survives.
r128/r256 were not needed. Worst-fit layers are text MLP / fusion blocks.

⚠ The author's README recommends "cfg 0, mu 1.15, r128". That is **diffusers
convention** — ComfyUI's cfg 1 is the same thing and ComfyUI handles shift
internally. Do not carry those numbers into a ComfyUI graph.

---

## 2. Turbo seed-lock — confirmed

The user complaint that motivated the card. Loose prompt (~25 words), 3 seeds,
matched SFW weights, bypass 1.0.

- **Turbo SFW**: three seeds → one image. Same bob, same pink undertips, same
  magenta eyes, same bared teeth, same square-to-camera pose, same face marks.
  Seeds differ by roughly an earring.
- **RAW SFW**: three genuinely different pictures. Side-lit near-profile /
  three-quarter turn on dark ground / tight close-up on green outdoor
  background. Different framing, lighting, mood per seed.

Turbo has collapsed to a single attractor for this prompt region; RAW has not.
Classic adversarial-distillation tradeoff — diversity sold for few-step
convergence. **Users were not exaggerating.**

⚠ An earlier grid compared Turbo **NSFW (Lustify)** against RAW **SFW**, i.e.
different finetunes. The conclusion above uses the matched SFW-vs-SFW grid.

---

## 3. Sampler: euler-beta @ 40 confirmed on RAW

`docs/models/krea2/samplers.md` holds. A live session had drifted to
`multistep/res_2m @ 25` (8 workflow tabs open; suspected cross-workflow
contamination — the graph's own Note node says "Test 25 to 50 steps").

| Sampler | Steps | Time | Quality |
|---|---|---|---|
| `multistep/res_2m` | 25 | 89s | mediocre, soft faces |
| `linear/euler` + beta | 40 | 132s | clearly better, coherent |

A "RAW looks mediocre" reading was traced to sampler config, not weights.

---

## 4. Watermarks come from stock Krea2 RAW

**Not from the Lustify NSFW finetune** — reproduced on stock
`krea2_raw_int8_convrot` (SFW). Turbo does not watermark; the distillation
appears to have trained the behaviour out. Watermarks are worse at higher step
counts (the model renders learned artifacts more faithfully).

`krea2filterbypass3.safetensors` suppresses them. It is **160 bytes, one
tensor**: a 12-float32 delta on `diffusion_model.txtfusion.projector.diff` — an
additive bias on the text-fusion projector, the layer where text conditioning
enters the image path.

Cleanest evidence (style held constant, only the bypass moved):

| Weights | Bypass | Style | Watermark |
|---|---|---|---|
| RAW NSFW | 0.0 | photoreal | **yes** |
| RAW NSFW | 1.0 | photoreal | **clean** |
| RAW SFW | 0.0 | photoreal | **yes** |
| RAW SFW | 1.0 | anime (prompted) | clean |
| Turbo SFW | — | either | clean |

⚠ **Two caveats before this ships as an always-on default.** (1) Evidence is
n=1 per cell — seed-repeat first. (2) The file is named "filterbypass" and acts
on the conditioning path; shipping it on-by-default is a decision to make and
document as what it is, not to adopt as a dewatermark utility. **Own card.**

---

## 5. Strength sweep — 1.0 is the answer

Early runs at 0.8 and 0.5 looked like a variance/quality tradeoff, but the
tradeoff was illusory: 0.5 did **not** recover RAW's spread (poses stayed in
Turbo's family) and cost quality, needing more steps to claw back — 12+6 at 35s
was still locked and softer than Turbo. Variance in the 6–18 step regime is
governed by step count, not LoRA strength.

At **1.0 / 6+3**, seed-for-seed against the Turbo SFW grid:

- **Seed A** — both three-quarter lean, same choker, same shoulder tattoo, same crop
- **Seed B** — near-identical: hairclips, ear hardware, bared teeth, tank
- **Seed C** — both straight-on with heavy collar + cross pendant; Turbo's collar squared/studded, LoRA's rounder chain (the only visible difference in the grid)

A reproduction, not an approximation you would notice in use.

---

## 6. Timings and the step sweep

Matched step schedules, photoreal prompt, seeds A/B/C:

| Steps | Turbo SFW | RAW+LoRA @1.0 | Δ |
|---|---|---|---|
| 6+3 | 28s | 20–24s | — |
| 8+4 | 36s | 25–26s | −29% |
| 10+5 | 43s | 31s | −28% |
| 12+6 | 51s | 36s | −29% |

**Consistent ~29% faster at every matched step count.** The headline:
**RAW+LoRA at 12+6 costs 36s — the same as Turbo at 8+4.** Same wall-clock,
50% more steps.

**SHIPPING CONFIG: 12+6 @ strength 1.0** (user call, 2026-07-20). Best skin
texture and linework of the set at a wall-clock that matches what Turbo charges
for 8+4.

⚠ **Two corrections, both from reading Turbo rows as LoRA rows mid-session:**
1. An "8+4 seed-locks" call was made on the Turbo row. The actual LoRA 8+4 row
   is three distinct shots (different crops, backgrounds, wardrobe). The fast
   tier does **not** inherit Turbo's lock.
2. A "12+6 overcooks, 10+5 wins" call was likewise made on Turbo rows. On the
   LoRA rows 12+6 is the best of the set. Do not carry the overcooking claim
   over to the LoRA path.

Also observed: Turbo's seed-lock is **prompt-dependent** — much weaker on this
constrained photoreal prompt than on the vague prompt in §2. Consistent with it
being an attractor effect rather than a flat property of the weights.

---

## 7. Photoreal check — the test that could have killed it

Anime/illustrated prompts hide softness: loose rendering reads as intentional
style. The photoreal prompt is where a deficit would show.

**It passed.** Turbo SFW vs RAW+LoRA@1.0, 8+4, three seeds: same shots
seed-for-seed (three-quarter lean with neck piece / frontal with pink fringe /
leather-jacket profile). Skin texture holds, tattoo linework legible, no mush,
no watermarks in either row. LoRA row arguably warmer and more natural in skin
tone; Turbo slightly flatter. No decisive gap either way — which is what parity
should look like.

---

## 8. The disk/library math

| | Cards | Total |
|---|---|---|
| Today | turbo-sfw 12.24 + turbo-nsfw 12.25 + raw-sfw 13.49 + raw-nsfw 13.15 | **4 cards, 51.13GB** |
| After | raw-sfw 13.49 + raw-nsfw 13.15 + LoRA 0.47 | **2 cards, 27.11GB** |

A Turbo-only user pays 1.7GB more (12.24 → 13.96GB). Everyone who wants both
speed modes — the normal case: fast for stylized work, guided for realistic and
precision work — goes from 25.7GB to 13.96GB and gets both tiers from one card.

---

## 9. Open confounds (not retired by this session)

- **Quant.** Every RAW arm ran `int8_convrot`; Turbo ran `fp8_scaled`.
  `docs/models/krea2/int8-quant.md` says "we ship fp8_scaled only" while
  `modelDeps.js` ships RAW as int8 — **docs/code contradiction, worth resolving
  independently**. That doc's checkbox 4 (int8 quality A/B) remains unrun.
  Parity held across the mismatch, so it did not block the verdict.
- **Step count is a variance lever**, not a neutral quality knob — changing
  steps at fixed seed/strength moves composition (sigma schedule shifts the
  trajectory). Cannot hold variance fixed while tuning steps.
- **Bypass LoRA** — n=1 per cell (§4).
- **Identity-edit + style-LoRA composition** with the accelerator: untested.
