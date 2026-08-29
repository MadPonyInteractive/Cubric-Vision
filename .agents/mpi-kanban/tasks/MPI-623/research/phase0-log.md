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
6b. **Anchor format depends on `orientation` — brief.md was RIGHT, an earlier note in this
   file saying "3 floats, not 6" was wrong and is retracted.** Both forms are real and the
   shipped workflow uses both:
   - `look_forward` / `look_at_target` -> **3 floats** per line, `x, y, z`
     (rails 1-3 of `1_generate-dataset-hires.json`).
   - `per_point_look` -> **6 floats** per line, `x, y, z, lookx, looky, lookz`
     (rail 4). `look_at_target` is a separate widget used only by that mode.
   Phase 2's coverage presets are literally these strings, so a preset must carry its
   orientation alongside its anchor text - the two cannot be chosen independently.
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

## The real graph, read from the converted API JSON

`1_generate-dataset-hires.json` -> 51 API nodes. Shape:

**4 rails**, each: `CameraPlotRenderControlGeo` -> `WanI2VMaskedConditioning` -> `KSampler`
-> `VAEDecode` -> `HiResComposite`, all four feeding one `SphereSfMDatasetDualRes`.

Settings that decide the cost:

| Setting | Value | Why it matters |
|---|---|---|
| Wan sampling | **8 steps, cfg 1, euler/normal** | `lightx2v_T2V_14B_cfg_step_distill_v2` is loaded at strength 1. This is a **distilled 8-step** sample, not a 30-step one - Wan is far cheaper here than a naive estimate |
| Pano LoRA | `pano_video_gen_720p_comfy` @ **0.98** | the Matrix-3D LoRA, the gated one |
| Wan output | 1440x720, **81 frames**, x4 rails | |
| `ModelSamplingSD3` shift | 5 | |
| HiRes Composite | `output_width` **8192**, proxy 2048, `frames 0-80/2` (= 41 of 81), `base_mode=geometry` | `geometry` is the splat-correct mode per docs/HIRES_COMPOSITE.md |
| SfM matcher | **`exhaustive`**, not `sequential` | 4x81 = 324 equirect frames plus 4x41 hires views. Exhaustive is O(n^2) pairs, so SfM will cost vastly more than the 0.7 s the Wan-free single-rail sequential run took. Do not extrapolate SfM from Phase 0's number |
| `on_split` | `stop` | |

**Consequence for measuring:** "one rail and multiply" is wrong for this graph. Wan and the
HiRes composite scale linearly with rails, but SfM scales roughly quadratically with total
frames because the matcher is exhaustive. Measure the 4-rail run as a whole.

## Two gaps in Vision's own tooling, found converting this graph

`scripts/workflow-to-api.mjs` could not convert the shipped workflow. Neither is a SplatKit
bug; both will recur in Phase 2 and Phase 4.

1. **Frontend-only annotation nodes are rejected.** `MickmumpitzLabel` (and
   `MickmumpitzMultilineLabel`) are registered in the pack's `web/js/label.js` via
   `LiteGraph.registerNodeType` and have **no `NODE_CLASS_MAPPINGS` entry** - no backend,
   0 inputs, 0 outputs, never executes. The converter treats them as unknown node types and
   aborts. It already skips `Note`/`MarkdownNote`; it needs to skip any node absent from
   `/object_info` that has no ports at all.
2. **rgthree `Bundle` / `UnbundleByName` cannot be followed.** The shipped graph uses one
   `Bundle` feeding **11** `UnbundleByName` nodes as wire tidying. rgthree carries the
   bundle over a virtual link (`Bundle`'s output `links` is `null` in the export), so a
   plain graph walk sees every `UnbundleByName` as missing its required `bundle` input.

Worked around for Phase 0 **without touching product code** (both scripts are outside this
card's ownership): strip the label nodes, then short-circuit the bundle by resolving each
`Bundle` input to its real origin and repointing every link that originates on an
`UnbundleByName` output to that origin, by slot NAME. 72 links rewired, 12 nodes dropped,
conversion then clean. Scripts kept in the session scratchpad; they should become a proper
fix in `workflow-to-api.mjs` when Phase 2 starts.

## Status

- [x] Both packs installed, commits recorded, licences confirmed, zero pip installs.
- [x] Brush downloaded, SHA verified, CLI contract read (3 corrections above).
- [x] Poly Haven 8K equirect JPG acquired -> `G:\ComfyUi\ComfyUI\input\mpi623_pano.jpg`.
- [x] Wan-free dataset pass on the bench (MoGe + SphereSfM) — 139 s, 143 MB.
- [x] THE GATE: Brush trains that dataset to a `.ply` — passed, 566 820 splats.
- [x] Brush stdout ANSI-strip / `N/M Steps` parse check — **impossible, and that is the
      finding**: Brush writes zero bytes when not a TTY. Poll the export dir instead
      (plan.md amendment 9).
- [x] `RenderSplat` loads the Brush `.ply` — 4 frames at 1024x1024 in 16 s.
- [x] Full Wan pass + real measurements — **done 2026-08-29**, run locally on the 4060 Ti.
      `Prompt executed in 02:18:16`; Wan is 76 % of it, SfM 2 %. See measurements.md
      § Phase 0b.

## Phase 0b (2026-08-29)

- [x] Wan-inclusive 4-rail bake, end to end, 2 h 18 m. 164 frames registered vs 16
      Wan-free.
- [x] Brush re-run against the Wan dataset — exit 0, 44.8 min, 1 641 469 splats, 387 MB.
      Growth still freezes at 15 000, so the Phase 0 *shape* held and only the counts moved.
- [x] Tier ladder re-measured on the real dataset: Draft 5 000 (48 MB) / Scene 30 000
      (387 MB). Two tiers still the right call.
- [x] **SfM split diagnosed by controlled test, not by guess.** 4x `max_num_features` and
      4x `max_num_matches` reproduce the split byte-for-byte, so the matcher is not the
      cause and overlapping coverage presets are a hard Phase 2 requirement.

### Not done, and deliberately so

- [ ] A held-out eval render of the **Wan** `.ply`. Phase 0's gate already proved a Brush
      `.ply` renders as the source room, and the gate does not need re-proving; the open
      question was cost and frame count, which is now measured.
- [ ] A merged single-model bake. Cannot be tested against the cache — fixing the overlap
      means changing the camera rails, which invalidates the Wan samples and costs a fresh
      2 h 18 m. That belongs to Phase 2, with the preset work it is testing.
- [ ] RunPod comparison. Every number here is a 4060 Ti floor (see the caveat at the top).
