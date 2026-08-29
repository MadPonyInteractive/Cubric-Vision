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

- Accepted the SplatKit dataset with no error on load.
- ~825 MB host RAM, ~5.5 GB VRAM, GPU pegged 80-94%.
- Wall clock / final `.ply` size: **pending, run in progress.**

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

## Tiering — not yet decided

Deferred until the 30000-step wall clock lands, and until a Wan-inclusive run gives the
real dataset-pass cost. Recording a tier off the Wan-free number would be a guess dressed
as a measurement.
