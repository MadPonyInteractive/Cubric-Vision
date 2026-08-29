# MPI-623 Phase 0 — spike log

Bench: `G:\ComfyUi`, port **8188** (the app engine stays on 48188, untouched).
Spike scratch: `G:\MPI-623-spike\`. Nothing in the Vision repo is edited by Phase 0.

Machine: RTX 4060 Ti **16 GB VRAM**, 64 GB RAM, torch 2.12.0+cu130.
Disk at start: **G: 23 GB free of 239 GB (91% used)** — the binding constraint, see below.

## Pinned commits (recorded 2026-08-29)

| Pack | Commit | Date | Licence |
|---|---|---|---|
| `mickmumpitz/ComfyUI-SplatKit` | `f59de2529772b01ffa627545552a00d812af7475` | 2026-08-22 | MIT |
| `mickmumpitz/ComfyUI-Mickmumpitz-Nodes` | `4d5ff7c433884631599c3b2d82011a2cbbeea37e` | 2026-08-22 | MIT |
| Brush | tag `v0.3.0`, published 2025-09-14 | — | Apache-2.0 |

## Confirmed

- **SplatKit needs ZERO pip installs on the bench.** All six requirements
  (`opencv-python trimesh scikit-image click matplotlib huggingface_hub`) are already
  satisfied by the ComfyUI portable env. It pins no torch and compiles nothing.
- **Brush win-x64 SHA256 verified** against the published `.sha256`:
  `b68e3e9cf052d51bf3ee30776fa5a364de7f2ba13b58443128ff797bb7bcfcd6`.
  All three of Vision's targets are published (win x64, mac arm64, linux x64).
- **Poly Haven serves a tonemapped JPG per HDRI** — the `.hdr`/`.exr` worry in brief.md
  is a non-issue. `GET https://api.polyhaven.com/files/<slug>` returns a `tonemapped`
  entry with `url`, `size` and `md5`. `abandoned_games_room_02` is **8192x4096 RGB JPG,
  4.0 MB, exact 2:1**, and Poly Haven is CC0 — usable as a shipped sample.
- SplatKit registers **27 nodes**, not 6. All six names quoted in brief.md exist and are
  correct.

## Corrections to plan.md / brief.md

1. **The Brush binary is `brush_app.exe`, not `brush-app`.** Underscore.
2. **The iteration flag is `--total-steps`, not `--total-train-iters`.** Default 30000.
   Confirmed by `--help`; `--export-path`, `--export-name` (default `export_{iter}.ply`),
   `--export-every` (default 5000) and `--sh-degree` (default 3) are as planned.
3. **Brush v0.3.0 ships no NOTICE file** — only `LICENSE` (Apache-2.0), `README.md`,
   `CHANGELOG.md` and the exe. Apache-2.0 §4(d) only bites when the work carries a
   NOTICE, so shipping `LICENSE` alone discharges it. One less obligation than planned.
4. **There is a THIRD runtime download**, not two: MoGe checkpoint, the `colmap_sphere`
   SphereSfM binary, **and RAFT optical-flow weights** (first time HiRes Composite runs
   with `base_mode=wan`).
5. **The Matrix-3D pano LoRA must be CONVERTED, not just downloaded** —
   `tools/convert_pano_lora.py` rewrites it to ComfyUI's key convention producing
   `pano_video_gen_720p_comfy.safetensors`. Convert once, upload the converted file to
   R2; do not make users run a script.
6. **The shipped workflow is `1_generate-dataset-hires.json`**, not `3DGS-Dataset-Creator`.
   `0_generate_360_panorama-upscale.json` is the panorama graph (Phase 4).
7. SplatKit ships an **interactive in-graph camera path editor** (`web/camera_plot_geo.js`)
   that drags anchors over the panorama with the MoGe cloud behind it. The
   "canned presets, no spline editor" decision still stands for the Vision UI, but the
   editor exists on the bench and is worth seeing before finalising the preset set.

## New product constraint — macOS has no SphereSfM binary

SplatKit's README: the `colmap_sphere` auto-download covers **Windows and Linux only**;
macOS is "planned", and until then the SphereSfM nodes need a self-built binary via
`COLMAP_SPHERE_EXE`. Vision ships mac arm64. So on a Mac the 3D Scene Flow can only run
against a **remote RunPod pod** (Linux) — local-engine bake is unavailable there.
Not a blocker (Brush itself has a mac arm64 build; only the SfM step is affected), but it
must be stated in the Flow's requirements and is not in brief.md.

## The cheap gate — Wan is NOT needed to prove Brush <-> SplatKit

plan.md's gate assumed the full pipeline. It does not need to.

- `SplatKit_SphereSfMDataset` takes a plain `IMAGE` batch of equirect frames
  (`pano_frames_1..4`). Nothing in it requires the frames to have come from Wan.
- `SplatKit_CameraPlotRenderControlGeo` produces exactly such a batch from MoGe geometry
  alone, and `SplatKit_HiResPanoFlythrough` renders real pinhole views from the panorama
  with no video model at all (`edge_mode=fill|stretch|layered` closes disocclusions
  instead of punching them out for Wan).

So the gate — *does Brush consume SplatKit's COLMAP output* — is provable with **MoGe +
`colmap_sphere` only**: no Wan 2.1 14B (~16 GB), no Matrix-3D LoRA, no umt5, no
`wan_2.1_vae` (none of which are on the bench). Splat *quality* will be poor without Wan
filling the disocclusions; format compatibility is the unproven thing and quality is not.

Supporting signal: SplatKit's own tooltip for `AddHiResViewsToDataset.splat_mask` says
per-view masks land in `<dataset>/masks/` and "**Brush picks the folder up
automatically**" — the author already targets Brush.

## Open — the expensive leg needs a decision

Disk and VRAM both bind before the full Wan pass can run here:

- **Disk:** G: has 23 GB free. Wan 2.1 I2V 14B 720p fp8 is ~16 GB (GGUF `Q4_K_M` ~9 GB),
  plus MoGe, the colmap_sphere bundle, the dataset (5 rails x 81 frames at 1440x720 plus
  the HiRes composite pass) and the `.ply`. Solvable — K: has 251 GB free and the bench's
  `extra_model_paths.yaml` can point there — but it is a deliberate step, not a default.
- **VRAM:** 16 GB. Wan 2.1 14B fp8 weights alone are ~16 GB, so the fp8 tier will offload
  heavily. `Q4_K_M` (~9 GB) is the realistic local tier on this card. SplatKit quotes its
  own fly-through benchmark on a 5090.

Measurements (plan.md's "no number exists anywhere — measure it") therefore split in two:
the local run measures a 4060 Ti, which is a useful *floor* for the user-GPU story but is
not the number a RunPod bake would produce.

## Status

- [x] Both packs installed, commits recorded, licences confirmed, zero pip installs.
- [x] Brush downloaded, SHA verified, CLI contract read (3 corrections above).
- [x] Poly Haven 8K equirect JPG acquired -> `G:\ComfyUi\ComfyUI\input\mpi623_pano.jpg`.
- [ ] Wan-free dataset pass on the bench (MoGe + SphereSfM).
- [ ] THE GATE: Brush trains that dataset to a `.ply`.
- [ ] Brush stdout ANSI-strip / `N/M Steps` parse check.
- [ ] `RenderSplat` loads the Brush `.ply`.
- [ ] Full Wan pass + real measurements — pending the local-vs-RunPod decision above.
