# MPI-600 Leg D — the KV multi-reference speed leg

Re-scoped by Fabio 2026-08-22, after Leg C ran with `FluxKVCache` **not in the graph** and
returned the 1.00x a disabled cache predicts. Q4 was deliberately not banked on that.

**Shape — edit only, no mask, multiple references.** `wf_type` 4 with `Input_Mask` empty. The
localised edit is finished and is not part of this leg. Three fixed images: an **empty**
background plate plus **two different people**, both placed into the plate. A single-reference
test is not worth running — `FluxKVCache` caches *reference* tokens, so the speedup scales with
reference count.

## The instrument is SAMPLER-ONLY seconds

Wall clock is the wrong number here. Measured on this bench, a 1024² 4-step run is **4 s of
sampling inside a 16.5 s wall clock** — roughly 73% of the wall is constant RAM→VRAM load, and
`sweep.py` frees the bench before every run precisely so the VRAM column is honest, which makes
that load unavoidable. A ratio taken on wall clock would be crushed toward 1.00x by a constant
that has nothing to do with KV.

`run.py` now reads the sampler's own tqdm bar (`4/4 [00:17<00:00, 4.45s/it]`) and ComfyUI's
`Prompt executed in X seconds` off `/internal/logs/raw`, marked **by timestamp** — that endpoint
keeps only the last 300 entries, so an index-based mark silently returns an empty list.

## Why the matrix is 2×2 and not "distilled vs kv"

`FluxKVCache` (`comfy_extras/nodes_flux.py`) is a plain `MODEL → MODEL` patch: it caches k/v for
the reference tokens on step 0, drops those tokens from `img` on steps 1+, and forces
`default_ref_method = "index_timestep_zero"`. **Nothing in it is weight-specific.**

A safetensors *header* diff of the two 9B weights confirms the other half: identical key set
(425 tensors), identical shapes and dtypes, identical quant metadata, and **no
`__index_timestep_zero__` marker buffer** in the `kv` file — the thing `model_detection.py:928`
looks for. Only the values differ (the sha256 split the card already recorded).

So the node is required for *either* weight to cache anything, and the product question — does
the separate 9.4 GB `kv` file earn its place in MPI-598 — is only answerable by crossing them:

| arm | weight | `FluxKVCache` |
|---|---|---|
| `distilled` | `flux-2-klein-9b-int8-convrot` | off — the baseline |
| `distilled+node` | `flux-2-klein-9b-int8-convrot` | **on** |
| `kv` | `flux-2-klein-9b-kv_int8_convrot` | off — control, isolates the weight |
| `kv+node` | `flux-2-klein-9b-kv_int8_convrot` | **on** |

## Fixed inputs

| | |
|---|---|
| **Plate** (node 474) | `plates/plate_empty_road_00001_.png` — 1024², **empty**, hard directional light from the left, long shadows, flat dirt ground. Generated on this bench (distilled, seed 8001, wf1). |
| **Person A** (node 236) | `plates/ref_man_00001_.png` — reused from the S2 leg. Denim jacket, jeans, plain light-grey studio background. |
| **Person B** (node 233) | `plates/ref_woman_00001_.png` — yellow raincoat, black boots, matched studio framing. Generated on this bench (distilled, seed 8002, wf1). |
| Steps / CFG | 4 / 1.0 on every arm — both weights are 4-step |
| Seeds | 101, 202 |
| CLIP / VAE | unchanged from `format.md`, never varied |

Person B is deliberately loud (yellow) against Person A (denim), so "it placed one person twice"
is visible at a glance rather than needing a face comparison.

**Reference count includes the plate.** Branch 4 chains `172 ReferenceLatent 1` (plate) →
`178 ReferenceLatent 2` (img2) → `176 ReferenceLatent 3` (img3), so plate + two people = **3
references**. The `2ref` cell drops img3.

Each ref is scaled to 1 MP by `ImageScaleToTotalPixels`, so at 1024² each contributes ~4096
tokens against the target latent's ~4096 — at 3 refs the reference tokens are two thirds of the
sequence, which is the shape KV is supposed to pay off on.

## Rows

One unrecorded warmup runs per arm before its cells (a weight swap makes the first run cold, and
this is a speed measurement — warm against warm).

| arm | kv node | cell | refs | seed | out-res | sampler s | prompt s | wall s | cached | VRAM | output |
|---|---|---|---|---|---|---|---|---|---|---|---|
| distilled | off | 2ref | 2 | 101 | 1024x1024 | 18 | 28.29 | 30.1 | 0 | 14692 MiB (15411 peak) | 2ref_101_00001_.png |
| distilled | off | 2ref | 2 | 202 | 1024x1024 | 18 | 28.09 | 28.6 | 0 | 14451 MiB (15499 peak) | 2ref_202_00001_.png |
| distilled | off | 3ref | 3 | 101 | 1024x1024 | 27 | 37.76 | 38.3 | 0 | 14826 MiB (15856 peak) | 3ref_101_00001_.png |
| distilled | off | 3ref | 3 | 202 | 1024x1024 | 27 | 37.39 | 38.2 | 0 | 14228 MiB (15597 peak) | 3ref_202_00001_.png |
| distilled+node | on | 2ref | 2 | 101 | 1024x1024 | 8 | 21.69 | 22.2 | 0 | 15218 MiB (15966 peak) | 2ref_101_00001_.png |
| distilled+node | on | 2ref | 2 | 202 | 1024x1024 | 7 | 23.58 | 24.2 | 0 | 15063 MiB (15928 peak) | 2ref_202_00001_.png |
| distilled+node | on | 3ref | 3 | 101 | 1024x1024 | 9 | 29.17 | 30.2 | 0 | 15174 MiB (16037 peak) | 3ref_101_00002_.png |
| distilled+node | on | 3ref | 3 | 202 | 1024x1024 | 8 | 26.17 | 26.8 | 0 | 15154 MiB (16006 peak) | 3ref_202_00001_.png |
| kv | off | 2ref | 2 | 101 | 1024x1024 | 18 | 28.65 | 30.2 | 0 | 14109 MiB (14996 peak) | 2ref_101_00001_.png |
| kv | off | 2ref | 2 | 202 | 1024x1024 | 18 | 27.7 | 28.2 | 0 | 14996 MiB (15681 peak) | 2ref_202_00001_.png |
| kv | off | 3ref | 3 | 101 | 1024x1024 | 27 | 37.31 | 38.2 | 0 | 15079 MiB (15750 peak) | 3ref_101_00001_.png |
| kv | off | 3ref | 3 | 202 | 1024x1024 | 27 | 37.19 | 38.2 | 0 | 14652 MiB (15334 peak) | 3ref_202_00001_.png |
| kv+node | on | 2ref | 2 | 101 | 1024x1024 | 7 | 20.9 | 22.1 | 0 | 15332 MiB (15997 peak) | 2ref_101_00001_.png |
| kv+node | on | 2ref | 2 | 202 | 1024x1024 | 7 | 20.9 | 22.1 | 0 | 15378 MiB (16006 peak) | 2ref_202_00001_.png |
| kv+node | on | 3ref | 3 | 101 | 1024x1024 | 9 | 25.69 | 26.2 | 0 | 15341 MiB (16011 peak) | 3ref_101_00001_.png |
| kv+node | on | 3ref | 3 | 202 | 1024x1024 | 8 | 25.68 | 26.2 | 0 | 15380 MiB (16004 peak) | 3ref_202_00001_.png |

## What these rows say

All 16 rows at **1024x1024**, 4 steps, cfg 1.0, two seeds per cell, sampler-only seconds.
Both seeds agreed to within 1 s on every cell, so these are medians of two, not one-shot reads.

### Sampler-only seconds

| arm | 2 refs | 3 refs |
|---|---|---|
| `distilled` | 18.0 | 27.0 |
| `distilled+node` | 7.5 | 8.5 |
| `kv` | 18.0 | 27.0 |
| `kv+node` | 7.0 | 8.5 |

### 1. KV is a real speedup, and a bigger one than the card expected

| refs | uncached | cached | speedup |
|---|---|---|---|
| 2 (plate + 1 person) | 18.0 s | 7.0-7.5 s | **2.40-2.57x** |
| 3 (plate + 2 people) | 27.0 s | 8.5 s | **3.18x** |

**And it scales with reference count, as predicted.** Going 2 -> 3 refs costs the uncached arms
50% more sampling (18 -> 27 s) and the cached arms ~13% (7.5 -> 8.5 s), because the extra
reference is paid once at step 0 instead of on every step.

The card's expectation - "expect ~1.40x at 1 ref / 1024, not BFL's 2.5x" - was **too
pessimistic for our shape**, and the reason is the shape itself: a Klein edit feeds the PLATE in
as a reference too, so the cheapest real edit already carries 2 references, never 1. Each ref is
scaled to 1 MP by `ImageScaleToTotalPixels`, so at 3 refs the reference tokens are roughly two
thirds of the sequence and the cache is skipping most of the work.

**Do not quote these as a bare multiplier.** They are 1024x1024 at 2 and 3 references. A higher
output resolution raises the target-token share and drags the multiplier back toward 1.

### 2. The speedup is the NODE. The weight contributes nothing.

`kv` with the node off is **1.00x against `distilled` at both reference counts** - 18.0 s and
27.0 s, matching to the second. The separate 9.4 GB file buys no speed by itself, which is
consistent with its header: identical key set, identical shapes, no `__index_timestep_zero__`
marker.

So Leg C's earlier 1.00x was not a mismeasurement. It was correct **for a graph with no
`FluxKVCache` node in it**, and correctly not banked.

### 3. But the node alone is WRONG. It needs the KV weight to stay correct.

This is the finding of the leg, and no number in the table shows it - `distilled+node` and
`kv+node` post the same 8.5 s and the same VRAM. It is only visible in the pictures.

| | `distilled+node` | `kv+node` |
|---|---|---|
| the plate | **replaced** - different road, different sky (blue, not golden), different hills, farm buildings appear, the tyre tracks and long shadow are gone | **preserved** - same tracks, same tufts, same tree line, same golden light and long cast shadow |
| person A | denim jacket becomes a **denim shirt with a belt** (seed 202, 2 refs); grey tee becomes white (seed 202, 3 refs) | denim jacket over grey tee, same jeans, same brown shoes - as referenced |
| person B | yellow raincoat becomes a **yellow shirt with an olive skirt** (seed 202); a short cardigan (seed 101) | the long belted yellow raincoat, cuffed jeans, black boots - as referenced |

Both seeds, both reference counts, same direction. Meanwhile `kv+node` against `kv` with the
node off is near-indistinguishable: same plate, same framing, same garments, same shadows.

**So quality parity passes for `kv` + node and FAILS for `distilled` + node.** The weight and the
node are a matched pair, not two independent options - which is presumably why BFL shipped a
separate KV checkpoint rather than only a node. The 9.4 GB file earns its place, but it earns it
on *correctness*, not on speed.

The failure is exactly the class this card keeps hitting: plausible wall-clock, plausible VRAM,
a clean `status: success`, and an invalid image. Contact sheet: `kv_contact_sheet.png`.

### 4. The cache costs VRAM, and the headroom is thin

| arm | cell | peak (MiB) | headroom on a 16380 MiB card |
|---|---|---|---|
| `distilled` | 3 refs | 15597-15856 | 524 |
| `kv` | 3 refs | 15334-15750 | 630 |
| `distilled+node` | 3 refs | 16006-16037 | **343** |
| `kv+node` | 3 refs | 15997-16011 | **369** |

The cache holds the reference k/v tensors, so node-on costs roughly **600-800 MiB attributable**
(14.5-14.9 GB -> 15.1-15.4 GB). Worst peak measured across the whole leg is **16037 / 16380 MiB**.

For MPI-598 this is the real constraint, not the speed: 9B + KV + 3 references at 1024 sits
~340 MiB under the ceiling of a 16 GB card. A fourth reference, or a larger output, has nowhere
to go. Per `project_the_users_gpu_is_the_limit` that is a description warning, not a cap - but
it is a warning MPI-598 owes its users, and it is tighter than the ~690 MiB Leg 0 recorded.

### What was NOT measured here

- Higher output resolutions. Every row is 1024x1024. The multiplier moves with resolution and
  this leg does not describe 1536 or 2048.
- 4+ references, which is where BFL's own 2.5x headline sits, and where the VRAM ceiling above
  says we may not be able to go on a 16 GB card anyway.
- The localised (masked) edit. Finished on this card and deliberately out of scope.

---

## CORRECTION: 3.18x is the SAMPLER SLICE. End to end it is 1.27-1.46x.

Added 2026-08-22 after Fabio ran his own KV test and was not impressed. He is right, and the
table above was framed misleadingly - it led with the sampler-only ratio, which is the most
flattering number on the page.

| pair | refs | sampler | `Prompt executed` | wall |
|---|---|---|---|---|
| distilled -> +node | 2 | 2.40x | **1.25x** | 1.27x |
| distilled -> +node | 3 | 3.18x | **1.36x** | 1.34x |
| kv -> +node | 2 | 2.57x | **1.35x** | 1.32x |
| kv -> +node | 3 | 3.18x | **1.45x** | 1.46x |

Absolute, 3 refs, 1024x1024: **38.2 s -> 26.2 s**. That is the number a user feels.

The sampler ratio is real, and it is also a *component*. Sampling is only ~27-45% of a run here;
the rest is text encode, three VAE encodes, decode, save, and a RAM->VRAM reload that this bench
pays on every single run because `free_bench()` runs first to keep the VRAM column honest.

**The app would land somewhere between 1.46x and 3.18x** - warm, the model is already resident,
so the reload constant shrinks and more of the sampler saving survives. **That was not measured
here and must not be quoted as if it had been.** The sampler ratio is a hard ceiling it cannot
exceed.

Both numbers were always in the table (`sampler s` and `prompt s` are separate columns). Leading
with the larger one was the error.

## Quality and reference adherence - the axis Fabio asked about

Scored by eye off `kv_adherence_sheet.png` (centre crops beside the two reference images), and
checked numerically for plate preservation.

### Reference adherence, 16/16 scored

Reference garments: man = denim jacket over a grey tee, blue jeans, brown shoes. Woman = a LONG
belted yellow raincoat below the knee, cuffed blue jeans, black lace-up boots.

| arm | correct | what goes wrong |
|---|---|---|
| `distilled` | **4/4** | nothing - jacket, tee, coat, boots all as referenced |
| `kv` | **4/4** | nothing |
| `kv+node` | **4/4** | nothing |
| `distilled+node` | **1/4** | seed 202 / 2 refs: the denim **jacket becomes a denim shirt with a belt**. seed 101 / 3 refs: the long raincoat becomes a **short cardigan**. seed 202 / 3 refs: it becomes a **yellow shirt with an olive skirt**, and the jeans are gone. The grey tee reads white on both 3-ref cells. |

Text adherence is **identical everywhere** - all 16 put the right number of people standing on a
dirt road. The axis that separates the arms is *reference* adherence, not the prompt.

### Plate preservation, measured (`kv_preserve.py`)

Mean |delta| against the plate over a frame-edge band that is background in all 16 outputs:

| arm | border delta / 255 |
|---|---|
| `distilled` | **9.25** |
| `kv+node` | **11.48** |
| `kv` | **13.35** |
| `distilled+node` | **40.87** |

`kv+node` sits *inside* the spread between the two uncached arms - so **the cache costs nothing
in preservation on the KV weight**. `distilled+node` is 3-4x worse than anything else: it rebuilds
the scene instead of editing it.

**So the cache is quality-neutral on the KV weight and destructive on the distilled one.** That
half of the leg is unaffected by the speed correction above.

### An instrument that did NOT work - do not reuse it

`kv_garment.py` measures the fraction of strongly-yellow pixels, on the theory that a long
raincoat covers far more area than a shirt. **It is confounded by subject scale in frame** and
should not be quoted:

    arm              3ref/101 3ref/202 | 2ref/101 2ref/202
    distilled           1.98%    0.98% |    0.53%    0.21%
    distilled+node      1.20%    1.57% |    0.01%    0.00%
    kv                  1.81%    0.88% |    0.51%    0.12%
    kv+node             5.73%    3.88% |    1.97%    1.07%

`kv+node` scores 3x the yellow of `distilled` while wearing the *same* coat - it simply renders
the people larger in frame. And `distilled+node` seed 202 scores *higher* than `distilled` while
having replaced the coat with a shirt and a skirt, because the olive skirt and the larger subject
make up the area. The 2-ref column is the only part that behaves (0.00-0.01% where there is no
woman at all), and that is the negative control, not the measurement.

Kept in the file as a worked example of this card's recurring failure: a number that looks
reasonable and is measuring something else. The by-eye scores above stand on their own.
