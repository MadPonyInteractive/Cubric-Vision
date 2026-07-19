# Krea2 — samplers

> Part of [docs/models/krea2/](README.md). Model overview + variants table live in the hub.

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

---

## Raw / High tier (52-step, single-stage) — SETTLED (live A/B, 2026-07-16/17)

> This is the **Raw** variant (`lustify-v10-krea-raw-int8_convrot`, SingleStreamDiT), a
> separate regime from Turbo above. Raw is **NOT step-distilled** — no fixed trajectory — so
> the Turbo lessons ("distilled ⇒ don't add steps") do **not** transfer here. It has its own
> floor.

**Ship this.** Single-stage.

| sampler | scheduler | steps | cfg |
|---|---|---|---|
| **`euler`** | `beta` | **40** | 3.0 |

**`euler`@40 `beta` is the floor AND the quality winner.** No sampler tested beat it on speed
*or* quality — anime and photoreal, single- and multi-subject, across seeds. The whole
step-reduction / faster-sampler hunt concluded: for this model, **making the math shorter is not
viable.** The realistic win is *perceived* latency (show a recognizable result earlier), not
*absolute* latency — see [preview-taesd.md](preview-taesd.md).

**The eval-count floor.** `euler`@40 undercooks nothing; `euler`@25 = mush; `euler`@50 =
overcooked. The window is narrow and 40 is its center — not arbitrary. `beta`@30 and `simple`@30
**both** undercooked (soft/hazy, less crisp bark/skin/hair) — so the undercook is **eval count,
not scheduler shape**. Redistributing 30 steps via a hand-crafted sigma curve cannot manufacture
detail that needs ~40 evals to form; two different schedulers undercooking at 30 proves the model
needs the compute, not a different curve. (Manual-sigmas + euler was therefore **not** run — the
two-scheduler @30 undercook already answers it.)

**Every higher-order RES sampler loses.** Consistent, model-level:
- **Multistep (`res_2m`, `res_3m`) = contrast tax.** `res_2m`@40 = slower (221 vs 211s on the
  Pod's RTX PRO 4500) + harsher + *less* fine detail than `euler`@40. `res_3m`@30 = 189s (faster)
  but visibly contrasty; **lowering cfg (3.0 → 2.8) did not fix it** — cfg only shifted composition
  (dino shape), the crushed-shadow/blown-highlight signature stayed. The contrast showed on anime
  first but **reproduced on photoreal** (`res_2m`@40 realistic: blown pink cast + skin/anatomy
  distortion) — it is not an anime-only artifact.
- **2-stage (`res_2s`) = ~2× compute for no speed win.** `res_2s`@40 = 415s (2× `euler`@40's 211s)
  because 2 model calls/step. Quality was *arguably* the nicest (best expressions, scared dog) but
  **not 2× better**, and `res_2s`@20 (≈210s, break-even wall-time) **undercooked**. So it can only
  ever be a slower *quality* option, never a speedup.

**Hands are NOT a sampler problem.** Broken hands persisted across `euler`/`res_2m`/`res_2s` AND
across seeds — constant ⇒ upstream of the sampler. **Root cause: the 2-image reference edit path**
(identity LoRA `krea2_identity_edit_v1_1_r128`). Single-image reference → hands **perfect**,
including the hardest test (holding a thin pen). No sampler change will fix 2-image-ref hands; that
is a separate reference-path problem.

> **Finding recorded on v1.1; the pinned LoRA is now `v1_2_r128` (2026-07-19) and hands were not
> re-tested on it.** Note the shape repeats: on 2026-07-19 the *identity* of two subjects also
> degraded on the 2-reference path while single-reference held. Two-subject single-pass is a
> documented LoRA limit (upstream prescribes chained single-ref passes — MPI-313); whether the
> hands regression is the same root or merely rhymes is untested. Order matters on that path:
> scene → slot 1, subject → slot 2 (MPI-312).

**Timing caveat.** All Raw-tier times above are **RTX PRO 4500** (the Pod), not the user's 4060 Ti
(where the same run is ~597s). Pod = remote code path; treat these as *relative* comparisons at
4500-speed, never as app/local-engine timings ([[feedback_runpod_not_local_engine_proof]]).

### The app-vs-browser "83s vs 55s" mystery — SOLVED

Not app overhead. It was the **prompt enhancer toggle** (ON in app, OFF in browser) — an
autoregressive LM pass before sampling. User re-tested with enhancer OFF: app 55s == browser 55s.
App dispatch overhead is **negligible** (~18–63 ms warm, measured through `commandExecutor.runCommand`
+ `comfyController.runWorkflow`). **Do not chase app plumbing for generation speed** — there is no
app tax. ("Convert workflow JSON to Python" is also a dead end for speed: those tools import the
same node classes / run the same torch — they remove ~ms of HTTP/frontend layer, not compute.)

### Raw-tier dead theories — do NOT re-propose (each refuted by a live run)

| theory | killed by |
|---|---|
| A faster/higher-order sampler cuts Raw-tier time | every RES sampler lost to `euler`@40 on speed or quality |
| Fewer euler steps (25–30) with a better scheduler holds quality | `beta`@30 AND `simple`@30 both undercooked — it's eval count, not curve |
| Manual sigmas (front-load the tail) recover detail at 30 steps | two schedulers undercooking @30 = compute-bound, not curve-bound; a 30-point curve adds no evals |
| `res_2s` 2-stage quality justifies a "High-Quality" tier | @40 not 2× better, @20 (break-even time) undercooked — pure time cost |
| Lower cfg tames multistep contrast | cfg 2.8 only moved composition; contrast signature unchanged |
| Broken hands are a sampler/step artifact | constant across all samplers + seeds; **single-image ref = perfect hands** → 2-image-ref LoRA path |
| The app adds seconds of injection/pre-gen overhead | enhancer toggle was the entire 83-vs-55s gap; dispatch ~tens of ms |
| **FBCache** (WaveSpeed block-cache) accelerates Krea2 | hard-fails: `ValueError: No double blocks found for SingleStreamDiT` — Krea2 is single-stream, FBCache needs MMDiT/double blocks |
| **FSampler** (epsilon-extrapolation skip) accelerates Krea2 | soft-fails: "model type unknown", ran 80 not 40 steps, only 13.8% cut, final image **fried** (nan on last step) |
