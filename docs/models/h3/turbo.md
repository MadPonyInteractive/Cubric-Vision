# H3 turbo — the 20→6 step distill LoRA (MPI-505, weight swapped MPI-508 and MPI-662)

Split out of `performance.md` on 2026-08-09 when it outgrew that file. Everything here is
about the shipped turbo toggle: what it costs, what it is worth, and what it changes.
The levers we tested and rejected stay in `performance.md`.

## THE WEIGHT CHANGED THE SAME DAY IT SHIPPED — read this before any number below

MPI-505 shipped `drbaph/MiniMax-H3-Turbo-Lora-ComfyUI` v4_step600_ema (larryvrh) at
**strength 1.0 / 8 steps**. MPI-508 replaced it, hours later, with
`lightx2v/Minimax-h3-Turbo` (ComfyUI conversion by `Kijai/MiniMax-H3_comfy`) at
**strength 0.75 / 6 steps**.

**The reason is the whole lesson: a lower step count is not a speed-up.** Measured
side by side on the bench, larry's LoRA landed at close to NO-LoRA wall clock — it cut
the steps and gave the time back per step. lightx2v's is a real one: **105s → 87.77s**
on the same clip at 6 steps. Anything below that quotes larry unless it says otherwise.

Settings, all measured on the bench 2026-08-09, not inherited from the model card:

| knob | value | why |
|---|---|---|
| strength | **0.75** | at 1.0 the AUDIO degrades badly. Audio is the axis that breaks first on H3 — the picture can still look fine while the sound is unusable, so judge it on its own pass |
| steps | **6** | 4 (what it was distilled for) destroys the audio outright. 6 is the floor |
| two-stage split | 3 + 3 | looks good; no reason found to prefer single-pass at this step count |

**Strengths are NOT comparable between the two LoRAs.** lightx2v's safetensors metadata
reads `baked_scale: 0.125` / `peft alpha/r=0.125 baked into lora_B`, so 0.75 here is a
tuned value on its own curve, not a reduction from larry's 1.0.

## THEN IT CHANGED AGAIN — v0.1 → v1.0 768p (MPI-662, 2026-08-30)

Same publisher, same conversion author, same 416-tensor coverage (`diffusion_model.blocks`
×400 + `token_refiner` ×16, zero text-encoder keys — checked on both files). What differs:

| | v0.1 | **v1.0 768p (shipped)** |
|---|---|---|
| size | 1.82GB | **0.41GB** |
| rank | flat 128 | **dynamic**, `sv_fro 0.96 from 128`, avg 31 |
| `baked_scale` | 0.125 | **1.0** |
| alpha | r=0.125 baked | 128, folded into lora_B |

Adopted on a bench read: less noise, cleaner picture, at a quarter of the download.

**Strengths do not port between the two, and no conversion factor exists.** The graph
applies `0.75 if a else 0.2` (`MpiMath` #343 fl2va, #453 r2va), unchanged across the swap.

Measured rather than inferred — `||B@A||_F` per module (the quantity a strength multiplier
scales), every block, 208 matched pairs:

| | vs v0.1 at the same strength |
|---|---|
| **v1.0 4-step (shipped)** | median **4.75x**, mean 5.66, p10 1.17, p90 10.87, range 0.74–19.9 |
| v1.0 8-step (rejected) | median **0.40x** |

The spread is the finding: this is a different distill with its own per-layer profile, not
a rescale, so **no single number converts a v0.1 strength into a v1.0 one.** Do not compute
one. In particular do not read the metadata `baked_scale` (0.125 → 1.0) as a strength
ratio — it predicts 8x, and the measurement says 4.75x median across a 27x spread. That
mistake was made and corrected here on 2026-08-30.

**Magnitude is not quality, and this weight is the proof:** 0.75 on v1.0 moves the weights
~4.7x further than 0.75 on v0.1 did, and the picture is *cleaner*. Both shipped strengths
are bench-judged, never derived — 0.75 tested and adopted with this weight; 0.2 is
MPI-550's tuned non-turbo value, deliberately left alone. What is genuinely open is that
the 25-step path now sees ~4.7x the perturbation MPI-550 tuned against (about 1.3x what the
old *turbo* path applied), and has not been re-judged on it. One non-turbo run closes that.

The 8-step v1.0 sibling (`..._8step_v1.0_resized_avg_rank_24_bf16`, `baked_scale` 0.0625)
was tested the same day and **rejected: same quality, more time.**

Everything below this section was measured on v0.1 or on larry's, and stands only until
someone re-measures it on v1.0.

## ref2va took its OWN weight, at its OWN strength (MPI-662, 2026-08-30)

The two DiTs shared one turbo LoRA from MPI-505 until this change — upstream's own usage,
and never actually judged on ref2va. Judged now, it loses. ref2va ships
`minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16` (0.29GB) at
**strength 1.0**, in r2va's own `MpiMath` #453 (`1.0 if a else 0.2`). fl2va is untouched:
fl2v v1.0 at 0.75, `MpiMath` #343. The expressions are per-graph — do not harmonise them.

Bench verdict over a full session: more cinematic, and **noticeably better at following the
audio description** — which is the axis H3 breaks on first, so it is the one worth having.

**It is a v0.1 on purpose.** lightx2v shipped v1.0 for fl2v only; no ref2v v1.0 existed on
2026-08-30. If one appears, retest — every v1.0 tried that day beat its v0.1.

### Two methodology findings from this adoption, both of which cost runs

**1. Clip length is a confound, and it reversed conclusions.** Every short A/B run at ~1s
said the ref2v weight was inferior — softer, flatter, worse. Re-run at seconds instead of
one, the verdict flipped completely. H3's trained window is 124–362 frames (~5.2–15.1s at
24fps); ~1s is ~22 frames, a fifth of the floor. Audio in particular cannot be judged there
at all. **Fix the clip length before comparing anything, and keep it inside the window.**

**2. LoRA magnitude does not predict quality — stop computing it.** Measured `||B@A||_F`
per module across all 208 pairs, this weight applies a median **0.12x** what fl2v v1.0
applies at the same strength (and ~0.56x what v0.1 did). It was predicted to be starved.
It won. Three separate magnitude predictions were made on 2026-08-30 and all three were
wrong. The metadata `baked_scale` is worse than useless for this — it is bookkeeping about
what was folded into `lora_B`, not a strength ratio. Judge by eye at a real duration.

Both weights are pure diffusion-model LoRAs — 416 tensors each, split
`diffusion_model.blocks` ×400 + `diffusion_model.token_refiner` ×16, **zero text-encoder
keys**. So `strength_clip` is a no-op on either, and the graph feeds the gate into both
strengths purely because `MpiLoraModelClip` only short-circuits the file load when both
are 0. Do not "simplify" it to `LoraLoaderModelOnly` — that short-circuit is what makes
turbo-off free.

## Step distillation — the lever that WORKED (MPI-505, measured 2026-08-09)

**H3 was the only non-distilled video model we shipped**, and that single fact explains
why every acceleration technique in this doc lands on H3 and nowhere else:

| model | steps | distilled |
|---|---|---|
| H3 | 20 | no, until the turbo LoRA |
| LTX 2.3 (both tiers) | 8 (`LTXVScheduler.steps`, a literal) | yes, upstream |
| WAN 2.2 14B | 6 (`ManualSigmas` 1.0/0.93/0.85 then 0.85/.../0.0) | yes |
| WAN 5B | 4 | yes, baked distill LoRA at 0.8 |

LTX "High" vs "Balanced" is **precision** (bf16 vs int8) - all four weights are
`ltx-2.3-22b-distilled-1.1_*`. A turbo LoRA there would distil a distilled model.

`drbaph/MiniMax-H3-Turbo-Lora-ComfyUI`, variant `v4_step600_ema` (Apache-2.0, original
`larryvrh`) takes H3 to 8 steps. Measured at 864x480 (the baked default), 2s clip, warm:

| config | time |
|---|---|
| 20 steps, two-stage, no EasyCache | 204.02s |
| 20 steps, single-pass, EasyCache | 136s |
| **8 steps (turbo)** | **90-96s** (4 runs) |

Those rows predate the shipped graph - 2s, split 3, pre-single-pass, and the 204.02s row
is n=1. Keep them as the record of what the LoRA does to the STEP COUNT; for wall clock
use "What turbo is actually worth" below.

Upstream settings: euler / beta / strength 1.0, sigma shift video 12 and **audio 4-6**.
The model defaults are 12 / **3.0** (`nodes_minimax_h3.py`, `ldm/minimax/model.py`), and
the audio value is the one that must move or audio distorts. Sweeping 4/5/6 changed
nothing audible - the audible fix was euler/beta - so it is baked at 5. Turbo ships
OPT-IN: quality is slightly below the 20-step path, which is the user's stated trade.

### What turbo is actually worth (measured 2026-08-09, LARRY weight at 8 steps)

> Superseded as a wall-clock claim by the swap above — these rows are the larry LoRA,
> the one that turned out not to be a real speed-up. The **decomposition** is still the
> useful part: it shows where H3's time actually goes, and the fixed costs it names
> (decode, init, re-patch) are weight-independent.

864x480, **5s**, single-pass, warm, decomposed from `app.log` timestamps. Both configs
n=2 with per-step agreeing to two decimals across a seed change:

| phase | turbo (8 steps) | non-turbo (20 steps) |
|---|---|---|
| load before first bar | 1.2s | 1.1s |
| step 1 (carries model init) | 20.3s | 19.2s |
| remaining steps | 112.6s (16.09s/step) | 163.0s |
| video decode | 36.9s | 35.3s |
| audio decode | ~1.5s | 1.5s |
| **total** | **171.1s** | **220.1s** |

**~22%, not 50%** - because EasyCache skips **8 of 20** on the quality path and **0 of 8**
under turbo, so the real comparison is **12 computes vs 8**. The "half" figure only exists
against an EasyCache-OFF baseline (~364s); quote it only with that caveat.

Turbo cannot touch: **~38s decode**, ~20s init, and a **~17s re-patch on every FLIP** of
the toggle either way (`MiniMaxH3SigmaShift` calls `add_object_patch`, so the
transformer re-uploads - 17.7s vs 1.2s before the first bar). Discard run 1 after a flip.
At **1s/608x352** that fixed cost is ~22s of a 33s run, so the same step cut is worth only
~10s: state duration AND resolution beside every H3 number.

### Turbo changes MOTION, not just detail (observed 2026-08-09, not yet measured)

The trade is not "same video, fewer steps, slightly softer". Across a run of app tests at
608x352 and 864x480 the user reports a consistent difference in the motion itself:

| | turbo (8 steps) | non-turbo (20 steps) |
|---|---|---|
| motion speed | noticeably **slower**, slight slow-motion feel | natural |
| low-res morphing | **none observed** | substantial |

Which inverts the usual reading of the toggle. **Speed is fixable in post; morphing is
not** - so at low resolution turbo can be the better OUTPUT choice, not merely the faster
one, and the 20-step path's advantage is clearest where the canvas is big enough that it
does not morph.

Plausible mechanism, NOT verified: 8 steps gives the high-sigma region - where inter-frame
displacement is decided - very few coarse steps, and a short-schedule distill LoRA tends to
under-shoot displacement. The 20-step morphing is the opposite failure: enough tail steps
to keep re-deciding identity on an under-resolved latent.

Qualitative, one prompt, no fixed-seed A/B - it must not move the `h3Turbo: false`
default until someone runs one at two resolutions. Recorded because it changes what the
toggle MEANS, and the release copy was written on the wrong assumption.

### The two-stage split costs nothing at low step counts

Turbo two-stage (91.59 / 90.07s) and turbo single-pass (91s) are indistinguishable, so
collapsing the split is only ever worth measuring at high step counts. Note the preview
decode does **not** run on a full two-stage generation - `MpiStageLatents` blocks
`denoised` unless `is_preview`, so the split's real cost is one sampler setup plus the
latent save.

## EasyCache is gated OFF turbo

At 8 steps EasyCache skips 0 and still pays its per-step bookkeeping — and at the 6 steps
we now ship it skips 0 for the same reason, so the gate stands. Gating it measured
**16.09s/step -> 15.56s = 171.07s -> 168.31s warm, ~1.6%**. (First estimated at ~6% off
the whole turbo/non-turbo per-step gap; only half that gap was EasyCache, the rest is the
LoRA patch.) A correctness fix that saves 1.6%, not a speed lever.

Both graphs route the model through an `MpiIfElse` on `Input_is_Turbo` — `[369]` in
fl2va, `[459]` in r2va:

    UNET ─┬─> ModelAttentionBackend ─> MiniMaxH3SigmaShift ─> gate.true    (turbo)
          └─> EasyCache ────────────────────────────────────> gate.false   (non-turbo)
                                     gate ──> turbo LoRA ──> user LoRA slots

`MpiIfElse` is **lazy**, so on a turbo run the EasyCache node does not execute at all.
**Verify by log**: a turbo run prints NO `EasyCache enabled` and NO `skipped` line; a
non-turbo run prints both, with ~8/20. Confirmed live 2026-08-09.

`MiniMaxH3SigmaShift` sits on the turbo branch ONLY, and that is correct rather than an
oversight — it entered the graph WITH turbo (`2b2df03f`; `2b2df03f^` has zero
occurrences), so a non-turbo run skipping it is exactly the 1.3.1 behaviour.

Two wiring mistakes were caught at the sync's diff step before either was installed: the
branches inverted (turbo keeping the cache), and `MiniMaxH3SigmaShift` stranded on one
branch so the other lost it. Convert-and-diff before installing is what caught both.

## `ModelAttentionBackend` is gated ON turbo — and OFF the quality path (MPI-662)

Core's `ModelAttentionBackend` node (`comfy_extras/nodes_model_advanced.py`, present from
the pinned `v0.34.0` — it was absent at `v0.31.0`, which is what blocked MPI-605) takes
`attention: "comfy kitchen attention"`. It sits on the **turbo branch only**, `[393]` in
fl2va and `[497]` in r2va, between the UNET loader and `MiniMaxH3SigmaShift`.

That split is a measured decision, not symmetry:

- **Turbo path — adopted.** Faster AND visibly cleaner, so it wins on both axes at once.
- **25-step quality path — rejected.** It gains speed there too (roughly: kitchen-attention
  cold ≈ stock warm), but it **degrades quality**, and that path exists precisely to be the
  good one. H3 already has a fast path; buying speed on the slow one with picture quality is
  the wrong trade.

This is the first place the "approximate attention loses precision" objection was actually
measured per path rather than argued — see MPI-605, which reached the opposite conclusion
about the two paths from the same node.
