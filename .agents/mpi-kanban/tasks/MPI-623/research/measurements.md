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

