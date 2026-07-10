# Krea2 — samplers

> Part of [docs/krea2/](README.md). Model overview + variants table live in the hub.

## Sampler settings — SETTLED (live A/B, 2026-07-09/10)

**Ship this. Both stages first-order + `beta`.**

| | sampler | scheduler | steps | denoise | eta | cfg |
|---|---|---|---|---|---|---|
| **stage 1** | `euler` | `beta` | 6 | 1.0 | 0.5 | 1.0 |
| **stage 2 (refiner)** | `euler` | `beta` | 3 | 0.35 | 0.5 | 1.0 |

Stage 2 takes stage 1's **latent** directly (no VAE round-trip), `sampler_mode: standard`.
Stage 2 beat stage 1-alone at every refiner setting tried — the second pass earns its cost.

**No shift node.** ComfyUI's model config already applies Krea's `mu 1.15`:
```python
# comfy/supported_models.py:1828
class Krea2(supported_models_base.BASE):
    sampling_settings = {"multiplier": 1.0, "shift": 1.15}
```
A `ModelSamplingAuraFlow` re-applies a value the model already has. Verified inert live
(1.15 vs 1.75 vs bypassed → no difference). Delete it.

**Note the workflow shape cost:** two stages ⇒ a `_stage2` runtime file,
`capabilities.multiStage: true`, and a `progressStages.js` entry whose bar counts must be
**counted live** per run mode (§4b of the add-model playbook). 9 NFE total vs 6 single-stage.

### Why: three constraints, each isolated by a single-variable run

**1. First-order sampler only.** `res_2s` is 2nd-order — 2 model calls per step (that is what
the `2s` suffix means; NFE = number of function evaluations = model calls). It distorted at
8 steps (16 NFE) *and* at 4 steps (8 NFE). Neither the step count nor the compute budget
rescued it. `deis_3m` (multistep) also lost to `euler` in the refiner stage.

**2. ~6 steps under `beta`.** `beta`@6 clean, `beta`@8 distorted — same scheduler, same
sampler, same eta, only steps changed. The optimum is **scheduler-dependent**, not a global
model constant: `bong_tangent` peaks at 8 (6 and 10 both distort), `beta` peaks at 6. What
generalizes is that **exceeding the peak reintroduces distortion** — more resolution actively
hurts a step-distilled model.

**3. Symmetric tapered schedule.** Ranked by live A/B: `beta` > `bong_tangent` > `simple`.

```
beta(6)         1.0, .909, .725, .5, .275, .091, 0     gaps .091 .184 .225 .225 .184 .091
bong_tangent(8) 1.0, .971, .929, .863, .744, .5, .213, .07, 0
                                                       gaps .029 .042 .067 .119 .244 .287 .143 .07
simple(8)       uniform .125 × 8
```
`beta` tapers into **both** endpoints — small steps where a flow-matching ODE actually curves,
large ones through the straight middle. `bong_tangent` is asymmetric (micro-steps at the head,
a `.287` leap mid-curve, a coarse tail). `simple` is flat and produced **structural** artifacts
(eye, nose, phone camera) despite having the *smallest* max gap — so "avoid big jumps" is not
the rule; matching the trajectory's curvature is.

**4. `eta > 0` is load-bearing.** `eta` is per-STEP SDE noise, not a multi-sampler knob:
`set_sde_step()` (`RES4LYF/beta/rk_noise_sampler_beta.py:216`) runs inside the per-step loop and
derives `sigma_up`/`sigma_down` from it — each step denoises *below* `sigma_next`, then injects
fresh noise back up. `eta = 0` ⇒ deterministic ODE. **`eta 0` degraded every configuration
tested** (`bong_tangent`@8, `beta`@6, and the refiner — where it broke the shadows). Four
independent confirmations. Keep `eta 0.5`.

### The steps ↔ denoise invariant (for tuning the refiner)

Comfy slices a refiner's sigmas as `sched(int(steps/denoise))[-(steps+1):]`. So **gap size**,
not steps or denoise alone, is what you are choosing:

| stage 2 | sigmas | gaps |
|---|---|---|
| 3 @ 0.25 | `.176, .091, .029, 0` | `.084, .062, .029` |
| 3 @ 0.30 | `.234, .123, .040, 0` | `.111, .083, .040` |
| **3 @ 0.35** | `.329, .176, .057, 0` | **`.154, .119, .057`** ← ships |
| 4 @ 0.20 | `.123, .077, .040, .013, 0` | `.046 … .013` → **too fine, adds noise** |
| 6 @ 0.30 | `.234 … .013` | `.058 … .013` → **too fine, adds noise** |

Stage 1's tail gaps are `.184`, `.091`. The winner (`.154, .119, .057`) sits *just under* them —
continuous refinement. Anything much finer makes the model over-apply its learned per-step
correction and it reads as noise. More steps at fixed denoise ⇒ finer gaps ⇒ must raise denoise
to compensate. That is the inverse relation, and it is mechanical.

**⚠ 0.35 re-enters structure.** It starts at sigma `.329`, above stage 1's `.275` level, so it
re-decides things stage 1 had settled (observed: neon sign, wall poster, a ring appeared).
It is a *partial regeneration*, not pure polish. Consequences: the refiner cannot be a
user-facing on/off toggle without changing the image itself, and stage 2 **must** receive the
same conditioning as stage 1 (the `CLIPTextEncode` carrying the style trigger), or it will pull
the image back toward the base model.

### RES4LYF is already a dependency

`res_2s`/`bong_tangent`/`deis_3m` all lost, but the shipped config still uses
`ClownsharKSampler_Beta` for its `eta`. RES4LYF is already in `dependencies.js`
(`type: 'custom_nodes'`, `installRequirements: true` ⇒ baked into the Pod image, universal by
type per MPI-222, pinned in `dev_configs/node_lock.json` `nodes.RES4LYF` @ `419de2d7`). Zero
new deps on either engine.

> **If a future test shows core ComfyUI's `euler` + `beta` matches** the ClownsharK config with
> its SDE noise, the workflow drops RES4LYF entirely. Untested — plain `KSampler` has no `eta`.

### Dead theories — do NOT re-propose (each refuted by a live run)

| theory | killed by |
|---|---|
| `eta 0.5` over-noises an 8-step distill → waxy skin | `eta 0` was **worse**, every time |
| `res_2s` 2nd-order oversamples → soft skin | cutting steps (fewer NFE) was **worse** |
| NFE is the lock (~8 model calls) | `euler`@8 clean vs `res_2s`@4 distorted — **same 8 NFE** |
| `bong_tangent` starves the tail → refiner needed to add tail resolution | `beta`@6 has *fewer* tail levels and wins |
| `bong_tangent`'s tiny head steps are wasted → steal them for the tail | hand-built curve A distorted; `bong`(6), with the **worst** head gaps, was clean |
| the model is locked to 8 steps | `beta`@6 beats `beta`@8 and `bong`@8 |
| Qwen-Image early steps → Krea2 late steps = a high-quality image **editor** | live test 2026-07-10: quality improved, but Krea2 also re-decided the poster, pillow, and phone. Krea2 has **no `reference_latents` slot** — locality cannot cross the handoff. (The same handoff for **ControlNet** is still open and promising — structure crosses, locality doesn't.) See [conditioning-and-control.md](conditioning-and-control.md). |
| an i2i **denoise floor ~0.40** exists (derived from core-`KSampler` semantics) | live test: `denoise 0.19` looks great with the refiner active. Stage 2 is RES4LYF, not core `KSampler`. See [conditioning-and-control.md](conditioning-and-control.md) § i2i. |

**Transfer lesson.** This config began as the user's hard-won **Chroma** setup
(`res_2s`/`bong_tangent`/`eta 0.5`). Chroma is **not step-distilled** — you can spend NFE freely
on integration accuracy there and the schedule shape matters. Krea2-Turbo has a fixed trajectory
baked in; there is nothing to integrate better. **A sampler recipe tuned on a non-distilled model
does not transfer to a distilled one.** The single community recipe found (Civitai
`krea2_simple_v1`: `res_2s`/`beta`/6 → `deis_3m`/`bong_tangent`/2 @ 0.2) lost at **both** stages
on this bench.
