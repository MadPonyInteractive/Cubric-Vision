# Wan 2.2 (SmoothMix v2, distilled) — two-stage sigma schedule

**CONCLUDED 2026-07-02 (MPI-126). Live-proven in-app, t2v + i2v.** Read before
re-tuning Wan two-stage sigmas. These are the shipped values + the map of what
each lever does and where the walls are.

## Shipped schedule (manual sigmas, replaces BasicScheduler+SplitSigmas)

Both stages now use **two `ManualSigmas` nodes** (one per `SamplerCustom`),
`euler` both, `ModelSamplingSD3` shift **8**. The old
`KSamplerSelect`+`BasicScheduler(simple/6/1.0)`+`SplitSigmas(step=3)` chain is
gone — manual sigmas give per-value control the split index couldn't.

| Model | stage-1 (high) | stage-2 (low) | steps |
|---|---|---|---|
| **t2v** | `1.0, 0.92, 0.84, 0.77, 0.70` | `0.70, 0.47, 0.24, 0.0` | 4+3 |
| **i2v** | `1.0, 0.93, 0.85` | `0.85, 0.65, 0.45, 0.25, 0.0` | 2+4 |

i2v tuned at **720×1280** (eyes need the pixels — see below); t2v at lower res.

## Architecture (verified, official Wan-Video/Wan2.2 configs)

MoE two-expert. **High-noise expert** = layout/composition/motion (early,
σ≈1.0→boundary). **Low-noise expert** = detail refinement (late, boundary→0).
Expert boundary is a HARD timestep: **T2V = σ 0.875, I2V = σ 0.900**
(`wan/configs/wan_*_A14B.py` `boundary=`). The low expert owns ~87.5% of the σ
range by design — **stage-2 doing most of the work is correct, not a bug.**

Manual sigmas ignore the boundary (it only matters for BasicScheduler routing),
but it explains behaviour: a handoff **above** the boundary keeps clean expert
routing (native/stylized look); **below** it runs both stages on the low expert
(more realistic, but off-distribution → artifacts).

## Lever map (what each knob actually does)

- **Handoff sigma (last stage-1 = first stage-2)** = the master content dial.
  - **High (~0.875–0.92, on-boundary):** clean routing, stylized native look,
    stage-1 preview is a blur (high expert hasn't formed the image) → stage-2
    regenerates → stage-1↔stage-2 INCONSISTENT. Also i2v: keeps eyes stable
    (stage-2 doesn't re-noise the iris).
  - **Low (~0.5):** stage-1 does real work → readable preview + consistent →
    BUT off-distribution → white speckle / "paint spatter" on the FINAL (t2v),
    eye morph (i2v). The realistic-but-specky zone.
  - **Mid (~0.70):** the t2v sweet spot — readable preview AND consistent AND
    no specks. Needed BOTH handoff AND step count (single-variable sweeps fail).
- **Step count** = the missing lever for t2v. **4 stage-1 steps** make the
  preview legible; 2–3 leave it an unreadable silhouette. More stage-2 steps =
  finer detail + smoother tail (kills the coarse final-step cliff), but on i2v
  more stage-2 steps also destabilize fine features (see eyes).
- **Cliff:** the original last step (`0.616→0.0` t2v / `0.667→0.0` i2v) dumped
  ~68% of the σ range in one euler step → coarse, drove regeneration. Splitting
  it across 2+ tail points is most of the consistency fix.

## Walls (model limits — do NOT sigma-chase these)

- **Sampler is not the fix.** Speckle survived euler, dpmpp_2m, uni_pc,
  res_multistep. dpmpp_2m/uni_pc MORPH at few steps (multistep can't converge).
  **euler is the author's pick and nothing beat it.**
- **Shift stays 8.** shift=5 (the distill training config) made MOTION worse
  (foot/shades morph) and is kept at 8 for low-motion videos. Not a lever here.
- **i2v eyes are resolution-bound.** Our detail bump destroyed eyes at 480 but
  they hold at **720** — more pixels resolve the iris. Eyes broke from the
  handoff DROP + more stage-2 steps re-touching the iris, NOT model weakness
  (baseline eyes were good). Fix = keep handoff high enough + ship i2v at 720.
  Proper fix for any residual eye issue = a downstream face/eye-detailer pass,
  not the base schedule (eyes are a known Wan-wide fight — specular iris
  highlights especially).
- **Realistic look = wrong weights, not sigmas.** The 0.5-handoff realistic
  output is off-distribution (specks). True realism wants a different Wan
  checkpoint — ship it as a NEW model/workflow (e.g. "Wan 2.2 Realistic"), a
  new model id, NOT a version bump of SmoothMix v2.

## Which prompts expose the failure

Human faces + orientation/seed changes. Animated/low-detail content HIDES stage
inconsistency (proven on LTX chipmunks-vs-humans too). Baseline a prompt that
actually drifts before tuning — not all prompts show it.

## Generator note

`generate_wan.py` now stamps `Input_Start_Frame`/`Input_End_Frame` LoadImage
nodes back to `placeholder.png` (mirrors the LTX handler). The app injects the
real frame by the **Tier-2 title** `Input_Start_Frame`/`Input_End_Frame` — if a
re-export reverts these to the bare `Start_Frame`/`End_Frame`, injection silently
misses and the placeholder ships (a "wrong output, ignores input image" bug).
Titles + `divisible_by: 16` on `ImageResizeKJv2` must survive every re-export.
