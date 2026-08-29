# MPI-623 Phase 0 measurements

**Read the caveat before quoting any number.** These are from a **Wan-free** dataset pass
on an **RTX 4060 Ti (16 GB)** with the **pure-torch** rasterizer (Triton unavailable on
Windows). They are a floor, not the shape of a production bake:

- No Wan i2v pass at all — the fly-through frames are MoGe reprojections, so the single
  largest cost in the real pipeline is **absent**.
- One camera rail of 81 frames. The reference workflow runs **five**.
- No HiRes Composite pass (the 8192x4096 reprojection).
- Triton off: SplatKit measures its own fly-through at ~1.9x faster with Triton.

Input: Poly Haven `abandoned_games_room_02` tonemapped JPG, 8192x4096, CC0.

## Dataset pass — ComfyUI, 139.0 s end to end

| Stage | Wall clock |
|---|---|
| MoGe depth (8192x4096 pano) | 36.5 s |
| Mesh render + merge, 81 frames @ 2048x1024 | 27.1 s |
| `render_control` total (incl. writes, preview, tensors) | 63.7 s |
| SfM feature extraction (1 hi-res sphere + 80 equirect) | 3.8 s |
| SfM sequential matching | 0.7 s |
| SfM mapper (spherical mapping + bundle adjustment) | 10.1 s |
| Sphere -> pinhole cube-face reprojection | 6.6 s |
| **Prompt executed** | **139.01 s** |

Peak VRAM during the dataset pass: ~4.8 GB of 16 GB (`nvidia-smi`, sampled mid-render).

**SfM is cheap — 21 s of the 139 s.** The cost sits in MoGe and the mesh render, and in the
real pipeline it will sit overwhelmingly in Wan. This matters for tiering: iteration count
and rail count are the levers, SfM is not.

## Dataset on disk — 143 MB total

| Path | Size |
|---|---|
| `images/` (96 pinhole cube faces) | 49 MB |
| `_spheresfm_work/` (intermediate, disposable) | 86 MB |
| `sparse/0/` (`cameras.bin` 104 B, `images.bin` 743 KB, `points3D.bin` 477 KB) | 1.2 MB |
| **total** | **143 MB** |

Confirms plan.md decision 1: the COLMAP dataset is disposable intermediate. `_spheresfm_work/`
alone is 60% of it and is never needed after training.

## Layout produced — matches Brush exactly

```
mpi623_gate/
  images/          96 x frame_NNNNN_perspective_NNNNNNNN.png
  sparse/0/        cameras.bin  images.bin  points3D.bin
  _spheresfm_work/ equirect/  cubic/  sparse/{0,1}     (disposable)
  camera_plot/  condition/  wan_inpaint/  _work/       (SplatKit staging)
```

No undistortion step, no conversion. Brush was pointed at the dataset root and accepted it.

## Brush training

Command actually used (note the corrections — `brush_app.exe`, `--total-steps`):

```
brush_app.exe <dataset> --total-steps 30000 --export-path <dir> \
              --export-name mpi623_{iter}.ply --export-every 30000
```

- **GATE PASSED.** Exit 0. Brush consumed SplatKit's COLMAP output with no conversion and
  no undistortion step.
- **468 s (7.8 min)** for 30000 steps. ~825 MB host RAM, ~5.5 GB VRAM, GPU 80-99%.
- Output `.ply`: **133.8 MB, 566,820 splats, SH degree 3**, `format binary_little_endian`,
  `comment Exported from Brush`, `comment Vertical axis: y`. Standard 3DGS ply.
- Core ComfyUI `RenderSplat` **loads and renders it** (`Load3DAdvanced` -> `File3DToSplat`
  -> `RenderSplat`), 4 frames at 1024x1024 in 16 s.

## FINDING — Brush trips over SplatKit's OWN intermediate SfM models

The second Brush invocation against the **same bytes** (dataset unmodified since 11:19:12,
before the first run even started) failed at load:

```
Error: Failed to load format.
Caused by:
    0: IO error while loading dataset.
    1: Invalid camera model
```

Cause: a SplatKit dataset root contains **four** COLMAP models, not one.

| Path | Camera model | Brush |
|---|---|---|
| `sparse/0/` | `SIMPLE_PINHOLE` (2 cams: 6 views @2048², 90 @512²) | fine |
| `_spheresfm_work/sparse/0/` | **model id 11 = SPHERE** | **"Invalid camera model"** |
| `_spheresfm_work/sparse/1/` | **model id 11 = SPHERE** | **"Invalid camera model"** |
| `_spheresfm_work/cubic/sparse/` | intermediate | — |

Brush does not deterministically read `sparse/0`; it picks one of them, so the **same
command succeeds or fails run to run.** The first 30000-step run got lucky. Verified by
copying only `images/` + `sparse/0` into a clean root — loads and exports instantly, every
time.

**This nearly read as a gate failure and is not one.** It is a directory-hygiene bug, and
the fix is free: `_spheresfm_work/` is disposable intermediate (86 MB of the 143 MB), so
the Brush trainer node must delete it — or hand Brush a clean root containing only
`images/` + `sparse/0/` — before invoking the trainer. Never point Brush at a raw SplatKit
dataset directory.

A nondeterministic loader also means **an intermittent "Invalid camera model" in the wild
is this**, not a corrupt dataset. Worth putting in `docs/splat-scenes.md` verbatim.

## FINDING — Brush writes nothing to stdout when it is not a TTY

Its entire stdout was **0 bytes** for the whole run, captured byte-by-byte with no
intermediate buffering on our side. `indicatif` suppresses its progress bar when stdout is
not a terminal, so **plan.md's "strip ANSI, then match `N/M Steps`" cannot work from a
shelled-out subprocess** — there is nothing to strip and nothing to match.

Consequences for the Brush trainer node (Parallel Batch, MpiNodes):

- Progress cannot come from parsing stdout. Options, cheapest first:
  1. Poll `--export-path` for `export_{iter}.ply` with a small `--export-every`, and drive
     the ComfyUI progress bar off the iteration numbers in the filenames. No pty, no
     parsing, and it works identically on all three platforms. Costs disk churn and gives
     coarse granularity.
  2. Allocate a pseudo-terminal so `indicatif` believes it has one. Platform-specific and
     the parse then has to survive ANSI redraws — the thing option 1 avoids entirely.
  3. Ask upstream for a `--progress-json` / machine-readable flag.
- Whichever is chosen, **the node must not treat silence as failure** — silence is the
  normal case here.

This is the one Phase 0 item that came back with a different answer than planned, and it
lands squarely in the not-yet-written Brush node, so it costs nothing to absorb now.

## Why the first render looked like floater soup

`RenderSplat` on the trained `.ply` produced streaky floaters, not a room. Two candidate
causes, and they are not equally likely:

1. The splat is genuinely thin. SfM registered only **16 of 81 frames** (81 equirect ->
   96 cube-face views, 4676 points). Without Wan, the disocclusion regions are smeared, and
   feature counts on those frames collapsed to ~50-350 against ~3300 on good ones. Cube
   faces are also only **512x512** (`face_size=0` auto = equirect_w/4).
2. `RenderSplat`'s orbit camera sits **outside** a room whose training views are all
   **inside** it. 3DGS is only valid near its training poses, so an outside-in orbit through
   the walls produces exactly this, even from a perfect interior splat.

**ANSWERED: cause 2. The splat is good.** A Brush run with
`--eval-split-every 8 --eval-save-to-disk` renders held-out views from real training poses.
At **5000 steps** those are unmistakably the source room — walls, doorway, windows with
foliage beyond, debris on the floor, ceiling — coherent geometry, no floaters. See
`G:\MPI-623-spike\brush_eval\eval_5000\`.

So the floater soup was **`RenderSplat`'s orbit camera sitting outside an interior scene**,
nothing more. 3DGS is only valid near its training poses.

**This is the gate passing on plan.md's actual wording** — "a `.ply` is produced and the
scene is recognisably the panorama's room" — not merely on format compatibility.

Worth registering how good this is: recognisable at 5000 steps, **with no Wan pass at all**,
with only 16 of 81 frames registered, and with 512x512 cube faces. Wan filling the
disocclusions and HiRes Composite reprojecting the 8K pano are both still to come, and both
push the same direction.

Product consequence either way: the Scene workspace's camera must be constrained to the
neighbourhood of the bake rail. An unconstrained fly-anywhere camera will show soup, and
that is inherent to 3DGS, not a renderer bug. brief.md already says "a capture looks bad
when you fly where the drones never mapped" — this is the measured form of that.

## Tiering — measured

One Brush run with `--export-every 5000` emitted the whole ladder, so this cost one run,
not six. Clean dataset, 4060 Ti, 96 views.

| Steps | Splats | `.ply` | Reached at | Quality |
|---|---|---|---|---|
| 5 000 | 41 219 | 9 MB | +1m00s | Recognisably the room, but soft and washed |
| 10 000 | 242 699 | 57 MB | +1m57s | — |
| 15 000 | **535 661** | **126 MB** | +3m19s | Growth complete |
| 20 000 | 535 661 | 126 MB | +4m49s | refinement only |
| 25 000 | 535 661 | 126 MB | +6m17s | refinement only |
| 30 000 | 535 661 | 126 MB | +7m47s | Markedly sharper — ceiling staining, wall texture, floor debris, window frames all resolve |

**The non-obvious result: splat count freezes at 15 000 and never moves again.** That is
Brush's `--growth-stop-iter` default. So:

- **Below 15 000 you are buying splats** (and disk: 9 MB -> 57 MB -> 126 MB).
- **Above 15 000 you are buying sharpness for free** — identical file size, identical splat
  count, ~90 s per additional 5 000 steps. 15 000 -> 30 000 costs 4.5 minutes and no disk.

### Recommended tiers

| Tier | Steps | Cost | For |
|---|---|---|---|
| Draft | 5 000 | ~1 min | Checking a coverage path actually covered the room, before committing to a bake |
| **Scene (default)** | **30 000** | **~8 min** | The durable asset |

Only two tiers are justified by this data. A "standard 15 000" middle tier would ship a
visibly softer scene for the same 126 MB and a saving of four minutes — bad trade for a
durable asset (see plan.md amendment 7). Draft earns its place because it is 13x smaller
and 8x faster, which is the right shape for validating a camera path.

`--max-splats` is the lever if 126 MB per scene turns out too heavy; it was not needed here
(default cap is 10 M, actual 536 k).

**Caveat unchanged: this is the Wan-free dataset.** Wan filling the disocclusions should
raise the registered-frame count well above 16/81, which changes splat counts and probably
these timings. Re-check the ladder after the Wan pass; the *shape* of the finding (growth
stops at 15 000, refinement is free on disk) is a Brush property and will hold.


---

# Phase 0b — the Wan-inclusive 4-rail bake (2026-08-29)

Same box (RTX 4060 Ti 16 GB), same bench, same 8192x4096 Poly Haven pano. This is the
**real graph**: 4 camera rails, Wan 2.1 I2V 14B fp8 + `lightx2v` 8-step distill + the
Matrix-3D pano LoRA @ 0.98, HiRes Composite at 8192x4096, exhaustive SfM.

**`Prompt executed in 02:18:16`** — 2 h 18 m for one scene, unattended, on a 16 GB card.
Per plan.md amendment 7 that is expected and acceptable: a scene is a durable asset.

> **Read every quality number below with plan.md amendment 15 in hand.** This bake used the
> shipped workflow's DEFAULT anchor strings, which are Mickmumpitz's hand-piloted village
> paths, flown unchanged through an interior. Rails leave the room. The timings, sizes and
> splat counts here are sound — they measure the pipeline's cost, which does not depend on
> where the rails point. The **quality** observations (the SfM split, the soft rails in
> § amendment 14) are measurements of a mis-piloted bake and must not be treated as the
> pipeline's ceiling. Re-measure quality once Phase 2 authors scene-relative paths.

## Where the 2 h 18 m actually goes

| Stage | x4 rails | Share |
|---|---|---|
| **Wan sampling** (8 steps, 1440x720, 81 frames) | 25:15 + 29:26 + 24:55 + 26:22 = **1 h 45 m** | **76 %** |
| HiRes Composite (41 of 81 frames @ 8192x4096) | 335 + 292 + 288 + 292 s = **20 m** | 15 % |
| SfM total (extract 7.2 s + exhaustive match 14.3 s + mapper 142.3 s) | **2 m 44 s** | **2 %** |
| MoGe, mesh render, camera plots, VAE decode, writes | remainder | ~7 % |

Wan rate: **182–225 s/it**, i.e. ~3 min per distilled step. Wan is the entire cost.

Per-rail HiRes coverage (fraction of each frame taken from the source rather than Wan):
mean 0.84 / 0.43 / 0.70 / 0.91. The 0.43 rail is the one leaning hardest on Wan.

### Correction to a Phase 0 prediction

`phase0-log.md` predicted SfM would "cost vastly more than the 0.7 s sequential run" because
the matcher is `exhaustive` and O(n²). **It does not.** Exhaustive matching of 164 frames
took **14.3 s** (vs 0.7 s sequential on 81). SfM is 2 % of the bake and is not a tiering
lever — the warning against extrapolating it was right, but in the opposite direction. The
dual-res node feeds SfM **41 frames per rail (164 total)**, not all 81 (324).

## Registered frames — Wan's actual payoff

| Run | Pano frames in the final model |
|---|---|
| Wan-free (1 rail, MoGe reprojection only) | **16 of 81** → 96 cube faces |
| Wan 4-rail | **164 fed, 164 registered** (split 152 + 12, see below) |

This is the number that justified the Wan pass: MoGe reprojection alone kept 16 frames;
with Wan filling the disocclusions, every fed frame registers.

## FINDING — the trajectories split SfM into two reconstructions

The bake ran to completion and then **stopped on purpose**. Not a crash:

```
[dualres] mapper produced 2 model(s):
    model 0: 152 images, frames [(0, 69), (82, 163)]
    model 1: 12 images, frames [(70, 81)]
RuntimeError: [dualres] SfM did NOT merge into one model -- 2 separate reconstructions
formed (trajectories don't share enough overlap). STOPPING before reprojection/training
as requested.
```

The shipped workflow sets `on_split='stop'` (node enum is `['stop','largest']`, default
`stop`). A 12-frame island broke off — frames 70–81 failed to tie back to the other 152.

**Product consequence for Phase 2:** Vision's camera *coverage presets must be authored to
overlap*, or a user's Flow run hits this on real input. The node's own remedies, in
preference order: overlapping trajectories (fixes the cause), raise `max_num_features` /
`max_num_matches`, or `on_split='largest'` to train the biggest model and discard the
island (the node calls this "legacy behaviour"). Only the first is a real fix; the third is
what Phase 0b used to get an unblocked measurement.

**Re-queue is cheap; restarting the bench is not.** ComfyUI caches node outputs by input
hash inside the live process, so flipping only node 84's `on_split` re-ran SfM alone — the
four Wan samples and four HiRes composites were cache hits. Killing the bench would have
thrown away 2 h 18 m of compute.

## The dataset Wan actually produced

| | Wan-free (1 rail) | Wan 4-rail |
|---|---|---|
| Registered images (cube faces) | 96 | **912** |
| Cameras | 2 | 1 |
| `points3D` | 4 676 | **28 911** |
| `images/` on disk | 49 MB | **3.3 GB** |
| Whole dataset dir | 143 MB | **14 GB** |

`_spheresfm_work/` is 5.3 GB of that 14 GB and is still disposable — the same 60 %-ish
share as Phase 0. Confirms plan.md decision 1 at production scale: a Scene bake needs
~14 GB of scratch it can throw away, and that is a real disk-headroom requirement for the
Flow, not a rounding error.

## Brush on the Wan dataset — the re-run tier ladder

One training run, `--export-every 5000`, so each row is a model trained that many steps
(an export at iteration N *is* the N-step model — no need to train six times).

```
brush_app.exe G:/MPI-623-spike/wan_clean --total-steps 30000 \
              --export-path <out> --export-name wan_{iter}.ply --export-every 5000
```

**Exit 0, 2 690 s (44.8 min)** for 30 000 steps on 912 images — vs 468 s on 96 images.

| Steps | Splats | Size | Cumulative wall clock |
|---|---|---|---|
| 5 000 | 201 806 | 47.6 MB | 312 s |
| 10 000 | 843 925 | 199.2 MB | 691 s |
| **15 000** | **1 641 469** | **387.4 MB** | 1 170 s |
| 20 000 | 1 641 469 | 387.4 MB | 1 685 s |
| 25 000 | 1 641 469 | 387.4 MB | 2 192 s |
| 30 000 | 1 641 469 | 387.4 MB | 2 689 s |

**The Phase 0 shape held exactly.** Growth freezes at 15 000 (`--growth-stop-iter`) —
identical splat count and byte-identical size from 15 000 on, so steps past it buy
refinement at zero disk cost. That is a Brush property, not a dataset property, and it
survived a 9.5x bigger dataset. After the freeze the rate is flat at ~505 s per 5 000 steps.

**The counts did not hold, as predicted.** Every figure is far larger:

| | Wan-free | Wan 4-rail | Ratio |
|---|---|---|---|
| Splats at 30 000 | 566 820 | **1 641 469** | 2.9x |
| `.ply` size | 133.8 MB | **387.4 MB** | 2.9x |
| Train time, 30 000 steps | 468 s | **2 690 s** | 5.7x |

### Tiers, restated for the real pipeline

| Tier | Steps | Train time | Size | For |
|---|---|---|---|---|
| Draft | 5 000 | ~5 min | 48 MB | Validating a coverage path before committing |
| **Scene (default)** | **30 000** | **~45 min** | **387 MB** | The durable asset |

The two-tier decision (plan.md amendment 7) survives: a 15 000 middle tier would ship a
softer scene for the *identical* 387 MB, saving 25 minutes on a job whose dataset pass
already cost 2 h 18 m. Still a bad trade.

**387 MB per scene is the number the product has to live with**, and it is 2.9x what
Phase 0's Wan-free measurement suggested. It lands on project zip-export
(`routes/projects.js:1491/1552`), cross-project copy, and any sync. `--max-splats` is the
lever if that proves too heavy — untouched here (default cap 10 M, actual 1.64 M), so there
is room to cap without hitting the ceiling.

### Total cost of one scene, end to end

| | |
|---|---|
| Wan 4-rail dataset bake | 2 h 18 m |
| Brush, Scene tier | 45 m |
| **Total, unattended, on a 16 GB card** | **~3 h** |
| Scratch disk consumed | ~14 GB (disposable) |
| Delivered asset | 387 MB `.ply` |

## Controlled test — matcher limits are NOT the cause of the split

The node offers three remedies for a split. Two were testable against the live cache for
165 s, so the guess did not have to stand. Only node 84's two limits changed, leaving the
Wan samples and composites as cache hits:

| | Run A | Run B |
|---|---|---|
| `max_num_features` | 8 192 | **32 768** (4x) |
| `max_num_matches` | 32 768 | **131 072** (4x) |
| Models formed | 2 | **2** |
| model 0 | 152 frames, `[(0,69), (82,163)]` | **152 frames, `[(0,69), (82,163)]`** |
| model 1 | 12 frames, `[(70,81)]` | **12 frames, `[(70,81)]`** |

**Byte-for-byte the same split.** Not a near-miss the matcher could be coaxed past — 4x the
features and 4x the matches changed nothing at all, down to the frame ranges. Frames 70–81
do not fail to match for want of features; they have **no overlapping geometry to match
against**.

### What this settles for Phase 2

Of the node's three suggested remedies, one is real:

1. **Overlapping trajectories — the only actual fix.** Vision's camera coverage presets
   must be authored so consecutive rails see shared geometry.
2. ~~Raise `max_num_features` / `max_num_matches`~~ — **measured, does not work.** Do not
   ship this as a retry, a fallback, or an "advanced setting"; it costs SfM time and buys
   nothing.
3. `on_split='largest'` — silently discards the island (the node's own word for it is
   "legacy behaviour"). Acceptable as a Phase 0 measuring device. As product behaviour it
   means a user's scene quietly loses a chunk of what they asked to cover.

The shipped workflow's four independent rails radiating from the origin are exactly the
shape that splits, and Phase 2's plan is to ship four canned rails. **Authoring the presets
to overlap is a Phase 2 requirement, not a nice-to-have** — with the graph's default
`on_split='stop'`, a user hitting this gets a hard error instead of a scene.

Note the split is *not* rail-aligned: model 0 spans `(0,69)` and `(82,163)`, so it holds
parts of several rails and the island is a 12-frame stretch *within* one. Whatever preset
work happens must be verified by re-running SfM, not by eyeballing the rail layout.

**Cost of getting this answer: 165 s**, because the bench process was left alive and its
node cache still held the 2 h 18 m of Wan sampling. Restarting the bench to "clean up"
would have made the same question cost 2 h 18 m.

## Looking at the thing — exit 0 is not evidence

Everything above is a measurement. None of it says the scene is a *room*. It is, but the
first render said otherwise, and the way that resolved is worth keeping.

### The default orbit libels every interior scene

`RenderSplat` with no `camera_info` (6 frames, `render_style=color`) on the 387 MB Wan
`.ply`: unreadable soup — spikes, fog, no structure.

That is **not** a verdict on the bake. The control proves it: the *Wan-free* `.ply`, whose
held-out view Phase 0 confirmed was a clean room, rendered through the identical orbit is
**also soup, and visibly worse** (more spiking, more black voids). Same camera, same
settings, one known-good splat and one unknown — both unreadable. So the orbit is the
liar, exactly as amendment 10 predicts for an outside-in camera on an interior.

Side by side the Wan splat is the *better* of the two orbits — more coherent surfaces,
fewer spikes — which is weak evidence in its favour but not the answer.

### The honest test: a held-out view

Brush's own eval split renders from camera poses it never trained on:

```
brush_app.exe <clean> --total-steps 5000 --eval-split-every 8 \
              --eval-every 5000 --eval-save-to-disk --export-path <out>
```

359 s, 114 held-out images. **The Draft tier — 5 000 steps — is unmistakably the source
room**: boarded windows with the graffiti legible, debris floor, the yellow wall, correct
ceiling line. The gate now holds for the *Wan* pipeline, not just the Wan-free one.

### Quality is not uniform, and one confound nearly hid it

| Frame range | Held-out view at 5 000 steps |
|---|---|
| 0–69 | crisp, sharp detail |
| 82–163 | recognisably the same room, visibly softer |

This tracks the per-rail HiRes coverage spread (0.84 / 0.43 / 0.70 / 0.91). Lead, not
conclusion — it is the Draft tier, and the cause is not isolated.

**The confound:** the first two soft frames sampled were both `perspective_00000004` and
the first two sharp ones both `perspective_00000000`. Face 4 points at a blank ceiling and
renders as mush on *good* frames too. Comparing like-for-like face is what turned a false
"the second half is broken" into the real, milder finding above.

### The discarded island is visible on disk

Eval frame indices run `0…69` then jump straight to `82`. That gap **is** the 12-frame
island `on_split='largest'` threw away — the data loss amendment 11 warns about, sitting
right there in the filenames.

### Consequence for Phase 1

Amendment 6 makes a Scene card an image card carrying a `.ply`. These renders decide where
that image comes from: **the bake must emit its own still from a training pose.** A
thumbnail generated by a naive orbit would make every correctly-built scene look broken in
the gallery. See plan.md amendment 13.
