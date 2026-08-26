# SplatKit + Brush Investigation
*Research date: 2026-08-26. All claims verified against primary sources.*

---

## Blocking Findings

1. **MickmumpitzPano\* class names do NOT match.** The actual Python class names in `ComfyUI-Mickmumpitz-Nodes/nodes/panorama_tools/nodes.py` are `PanoRollHorizontal`, `PanoSeamMask`, `Krea2FullResReference`, `HarmonizeBoundary`, `PerspToErpWarp`, etc. — no `MickmumpitzPano` prefix exists in the code. The class names the planner recorded (`MickmumpitzPanoRollHorizontal`, etc.) appear to be wrong. Verify against the actual workflow JSON.

2. **SphereSfM binary is BSD-3-Clause, not MIT.** The SplatKit pack is MIT; its downloaded SphereSfM binary carries BSD-3-Clause. That licence is compatible with commercial use (no copyleft), but the NOTICE must be preserved in any redistribution. Treating SplatKit as "pure MIT" would be wrong.

3. **Brush progress output uses `indicatif` terminal control codes on stdout** — not plain line-by-line text. Parsing requires ANSI stripping first. The parseable pattern is `N/M Steps` from the training progress bar. A subprocess wrapper must strip escape sequences before matching.

4. **Brush prebuilt binaries are `brush-app` (GUI + CLI), not a separate `brush-cli` binary.** The releases ship `brush-app-*.{zip,tar.xz}`. The `brush-cli` is a separate Cargo crate that can be built from source for a headless-only binary. Bundling the full app binary works but is heavier; building brush-cli from Rust source requires a Rust toolchain on the build machine (not the user's machine).

5. **Spirula Studio (the main fallback) is GPL-3.0** — incompatible with commercial closed-source redistribution. No other prebuilt-binary, no-CUDA-toolchain trainer was found.

---

## A. SplatKit

### A1 — Where SplatKit ships

**Verified:** `https://github.com/mickmumpitz/ComfyUI-SplatKit`

Public repo under the same GitHub account as ComfyUI-Mickmumpitz-Nodes. 2 stars, 2 forks as of research date. **Not found in the ComfyUI Registry (registry.comfy.org) or ComfyUI-Manager's node list** — no evidence it has been submitted to either index yet.

Source: https://github.com/mickmumpitz

### A2 — Licence

**MIT** — confirmed from the `LICENSE` file.

Nuances:
- Vendored code in `vendored/` (MoGe from Microsoft, Matrix-3D utils): both MIT, with their own notice files.
- The **SphereSfM binary** (`colmap_sphere`) that downloads at runtime is **NOT part of the MIT licence** — it is BSD-3-Clause. The binary carries its licence in `bin/BUILD_INFO.txt` after installation.

Source: https://github.com/mickmumpitz/ComfyUI-SplatKit/blob/main/LICENSE
Source: https://github.com/mickmumpitz/ComfyUI-SplatKit/blob/main/docs/SPHERESFM.md (inferred from README reference)

### A3 — Python dependencies

From `requirements.txt` (verbatim):
```
opencv-python
trimesh
scikit-image
click
matplotlib
huggingface_hub
```

The pack explicitly notes that `torch`, `numpy`, `scipy`, `Pillow`, `tqdm`, and `huggingface_hub` (via transformers) already ship with ComfyUI. `pyproject.toml` requires Python >= 3.10.

**No torch version pin. No CUDA-compiled packages in the base requirements.** No conflict with torch 2.12.0+cu130 expected from these deps.

Optional/conditional: `triton` (for the GPU rasterizer fast path) is deliberately NOT in requirements.txt due to size and Windows install issues. On Linux, torch bundles triton; on Windows users need `pip install triton-windows`. The pack falls back silently to pure-torch if triton is unavailable.

Heavy call-outs: none of the listed deps are CUDA-compiled. `opencv-python` is CPU-only. `trimesh` is pure Python.

Source: https://raw.githubusercontent.com/mickmumpitz/ComfyUI-SplatKit/main/requirements.txt

### A4 — MoGe: bundled or runtime download?

**Runtime download.** MoGe checkpoint downloads on first use to `ComfyUI/models/MoGe`. It is not bundled with the pack.

The SphereSfM binary (`colmap_sphere`) also downloads on first use to `bin/`, with SHA-256 verification. The correct platform build is selected automatically (Windows CUDA, Linux CUDA, macOS planned).

Source: https://raw.githubusercontent.com/mickmumpitz/ComfyUI-SplatKit/main/README.md

### A5 — Training capability

**None.** Confirmed verbatim from README:

> "SplatKit produces **datasets, not trained splats** — training stays in whichever trainer you already like."

The workflow outputs a COLMAP-compatible dataset (`images/` + `sparse/0` + init point cloud). No 3DGS training code exists in the pack.

Source: https://raw.githubusercontent.com/mickmumpitz/ComfyUI-SplatKit/main/README.md

### A6 — MickmumpitzPano\* nodes — same pack or different? Licence?

**Different pack: `ComfyUI-Mickmumpitz-Nodes`**, in its `nodes/panorama_tools/` subdirectory.

Source: https://github.com/mickmumpitz/ComfyUI-Mickmumpitz-Nodes/tree/main/nodes

The **actual Python class names** (from `nodes/panorama_tools/nodes.py`) are:

| Actual class name | Likely corresponds to user's name |
|---|---|
| `PanoRollHorizontal` | MickmumpitzPanoRollHorizontal |
| `PanoSeamMask` | MickmumpitzPanoSeamMask |
| `Krea2FullResReference` | MickmumpitzPanoKrea2Reference |
| `HarmonizeBoundary` | MickmumpitzPanoHarmonizeBoundary |
| `PerspToErpWarp` | MickmumpitzPanoWarp |
| `EstimateFOV` | (no direct match) |
| `SeamRoll` | (no direct match) |
| `StageSwitch` | (no direct match) |
| `UnfilledMask` | (no direct match) |

**The `MickmumpitzPano` prefix does NOT exist in the actual class names.** The class names in the workflow JSON (which is what matters for ComfyUI) will be the unqualified names above. Verify the workflow JSON before wiring.

Licence of `ComfyUI-Mickmumpitz-Nodes`: **MIT** (confirmed from prior search results and the repo's stated licence).

Source: https://raw.githubusercontent.com/mickmumpitz/ComfyUI-Mickmumpitz-Nodes/main/nodes/panorama_tools/nodes.py

---

## B. Brush

### B7 — Prebuilt release binaries

**YES — prebuilt binaries exist** for three platforms.

Latest release: **v0.3.0**

| File | Platform |
|---|---|
| `brush-app-x86_64-pc-windows-msvc.zip` | Windows x64 |
| `brush-app-aarch64-apple-darwin.tar.xz` | macOS Apple Silicon (arm64) |
| `brush-app-x86_64-unknown-linux-gnu.tar.xz` | Linux x64 |

Each has a corresponding `.sha256` checksum file. Same asset set in 0.2.0 and 0.0.1.

**Not present:** Windows arm64, Intel/x64 macOS, Android, iOS.

The binaries are named `brush-app` — this is the **combined GUI+CLI binary**. A separate `brush-cli` crate exists in the repo (at `apps/brush-cli/`) for headless-only builds, but it is NOT in the releases as a separate binary. Building brush-cli headless requires a Rust toolchain.

Source: https://github.com/ArthurBrussee/brush/releases

### B8 — Full CLI contract for headless training

**Using the released `brush-app` binary as a CLI** (brush-app IS the CLI — pass args directly):

```
brush-app <PATH_OR_URL> [OPTIONS]
```

For headless operation (no viewer), omit `--with-viewer` or pass `--with-viewer false`. The `brush-cli` crate rejects `--with-viewer` outright.

**Positional arg:**
- `PATH_OR_URL` (optional) — path to a COLMAP dataset directory or a URL. If absent, opens the viewer.

**Iteration count:**
- `--total-train-iters <N>` — total training steps (default: **30000**)

**Output path:**
- `--export-path <DIR>` — export directory (default: `./{dataset}_exports/`)
- `--export-name <PATTERN>` — export filename pattern (default: `export_{iter}.ply`)
- `--export-every <N>` — write a checkpoint PLY every N iterations (default: **5000**)

**Dataset options:**
- `--max-resolution <N>` — cap image resolution (default: 1920)
- `--max-frames <N>` — limit number of frames to load
- `--subsample-frames <N>` — load every Nth frame
- `--subsample-points <N>` — subsample the SfM point cloud
- `--eval-split-every <N>` — hold-out eval set (every Nth image)
- `--invert-masks` — invert mask polarity
- `--alpha-mode <MODE>` — interpret alpha as transparency or masking
- `--max-scene-batch-cache-size <SIZE>` — e.g. `6G`

**Training hyperparameters (full list from `TrainConfig`):**
- `--lr-mean` (default 2e-5), `--lr-mean-end` (default 2e-7)
- `--lr-coeffs-dc` (default 2e-3), `--lr-coeffs-sh-scale` (default 10.0)
- `--lr-opac` (default 0.012), `--lr-scale` (default 5e-3), `--lr-rotation` (default 2e-3)
- `--max-splats` (default 10000000)
- `--ssim-weight` (default 0.2), `--lpips-loss-weight` (default 0.0)
- `--refine-every` (default 200), `--growth-stop-iter` (default 15000)
- `--growth-grad-threshold`, `--growth-select-fraction`, `--split-at-screen-size`
- `--opac-decay` (default 0.004), `--match-alpha-weight` (default 0.1)
- `--background-color` (default "0,0,0"), `--background-noise-strength`
- `--seed` (default 42)
- `--render-mode`

**Misc:**
- `--eval-every` (default 1000) — run eval every N iters
- `--eval-save-to-disk` — write eval images to disk
- `--with-viewer` — open viewer UI (brush-cli rejects this; brush-app accepts it)

Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/apps/brush-cli/src/lib.rs
Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/crates/brush-train/src/config.rs
Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/crates/brush-process/src/config.rs
Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/crates/brush-dataset/src/config.rs

### B9 — COLMAP layout Brush expects

**Expected structure (confirmed from test code in `crates/brush-dataset/src/formats/colmap.rs`):**
```
<dataset_root>/
├── sparse/
│   └── 0/
│       ├── cameras.txt   (or .bin)
│       ├── images.txt    (or .bin)
│       └── points3d.txt  (or .bin)
└── images/
    ├── frame_0001.png
    └── ...
```

- **Both `.txt` and `.bin` COLMAP formats are accepted.** The parser handles both.
- If images are not found, they are skipped with a warning (graceful degradation).
- If multiple reconstructions exist, the one with the most registered images is selected.
- No undistortion is required — the dataset loader uses whatever camera models are in the COLMAP file.

**SplatKit output compatibility: CONFIRMED.** SplatKit README states: "The COLMAP output is ordinary — point any 3DGS trainer at the dataset folder (`images/` + `sparse/0`). The default output uses ordinary **pinhole cameras**, so no special projection support is required."

Pinhole cameras are the baseline COLMAP model. Brush handles them natively.

Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/crates/brush-dataset/src/formats/colmap.rs

### B10 — Output format and path

- Output files: **`.ply`** (standard Gaussian splat format)
- Default output directory: `./{dataset_name}_exports/`
- Default filename pattern: `export_{iter}.ply` (e.g. `export_5000.ply`, `export_10000.ply`, ...)
- **Intermediate checkpoints** are written every `--export-every` iterations (default 5000)
- Final export at training end
- Output path is fully controlled via `--export-path` and `--export-name`

Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/crates/brush-process/src/config.rs

### B11 — Progress to stdout/stderr — parseable?

Brush-cli writes progress to **stdout** using `env_logger` + `indicatif` progress bars.

**What is emitted:**
1. **Training progress bar** — 40-character bar with format: `[elapsed] ████░░ N/M Steps (iter/s, ETA remaining)` — cyan/blue
2. **Refinement spinners** — splat count updates during growth/pruning steps
3. **Eval result spinners** — PSNR and SSIM when eval runs (every `--eval-every` iterations)
4. **Status text** — phase labels like "Loading dataset", "Training", completion

**Parsing challenge:** `indicatif` emits ANSI terminal control codes (cursor movement, colour codes) to animate the bars in-place. Capturing stdout from a subprocess will include these codes. They must be stripped (e.g. with a regex `\x1b\[[0-9;]*m` or similar) before parsing.

**Parseable pattern for iteration count:** `(\d+)/(\d+) Steps` appears in the training bar. This is stable enough to drive a progress bar by matching `current_iter / total_iters`.

**Alternative:** Brush integrates with **Rerun** for structured telemetry (`--rerun` flag) — if a Rerun server is running it receives structured events. But this adds an external dependency.

Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/apps/brush-cli/src/lib.rs

### B12 — Licence and commercial redistribution

**Apache-2.0.**

The README notes: "not an official Google product" and "a forked public version of the google-research repository."

Apache-2.0 explicitly permits:
- Commercial use
- Distribution
- Sublicensing
- Patent use

**Redistributing the Brush binary inside a commercial closed-source desktop application IS permitted** under Apache-2.0, provided:
- The `LICENSE` file is included with the distribution
- The `NOTICE` file (if present in the repo) is included
- No trademark claim is made

No copyleft, no source disclosure obligation.

Source: https://github.com/ArthurBrussee/brush (repo licence badge)

### B13 — WASM/web viewer for in-app splat rendering

**A WASM build exists** via the `brush-js` crate (compiled with `wasm-pack`). The demo uses Next.js.

**Spherical harmonics:** Brush evaluates SH **up to degree 4** (25 coefficients per colour channel). Degree 3 is fully covered. Source: DeepWiki/search results confirming `sh_coeffs_to_color()` uses Sloan 2013 up to degree 4.

**Depth sorting:** Confirmed — the rendering pipeline uses **GPU radix sort** for tile-based rasterization. Full correct alpha-blended depth order is maintained.

**Embedding:** The `brush-js` bindings expose `training.currentSplats().buffers()` which returns live GPU buffers (transforms, SH coefficients, opacities) as `GPUBuffer` objects for use in custom WebGPU pipelines. The `web/src/main.ts` in the repo demonstrates end-to-end rendering.

**Browser support constraint:** WebGPU is required. As of the README: **Chrome 134+ on Windows and macOS only.** Firefox and Safari do not support WebGPU sufficiently. This is a significant embedding risk if the Electron app's Chromium version is older than 134.

**Training vs. viewing:** The `brush-js` bindings expose training API, not a pure viewer. A viewer-only embed would require using the `buffers()` API and writing custom WebGPU rendering code, or shipping the brush-app binary and opening it locally.

Source: https://raw.githubusercontent.com/ArthurBrussee/brush/main/apps/brush-js/README.md
Source: https://deepwiki.com/ArthurBrussee/brush/5.3-wgsl-shader-system

---

## C. Fallbacks

### C14 — Next-best headless splat trainer, no CUDA toolchain on user's machine

Context: Brush (Apache-2.0, prebuilt binaries, no CUDA/PyTorch) is the clear first choice. If it proves unsuitable:

| Candidate | Prebuilt binary? | CUDA toolchain? | Licence | Notes |
|---|---|---|---|---|
| **Spirula Studio** (github.com/harry7557558/spirula-studio) | Yes (Windows/Linux/macOS) | No — Vulkan backend | **GPL-3.0** | BLOCKS commercial closed-source redistribution. Vulkan runs on NVIDIA/AMD/Intel/Apple. |
| **LichtFeld Studio** | Yes (Windows, via paid portal) | Yes for training | Proprietary | Registration + donation required. CUDA still needed for training even in 0.5.3. |
| **nerfstudio splatfacto** | No (pip package) | Yes | Apache-2.0 | Requires Python venv + CUDA toolkit on user machine. Not bundleable. |
| **3DGS original** (graphdeco-inria) | No | Yes (CUDA build) | Gaussian-Splatting Research License | Non-commercial only anyway. |
| **gsplat** | Pip wheels only (tops at torch 2.4/cu124) | Yes | Apache-2.0 | Ruled out by task definition. |

**Practical fallback if Brush fails: NONE without user-side build steps.** Spirula Studio is the only other prebuilt-binary option, but GPL-3.0 blocks commercial redistribution. All other trainers require CUDA toolkit installation on the user's machine.

**Recommendation:** Brush is the only viable choice for a bundled commercial app. If Brush is unsuitable (e.g. quality gap on equirectangular cameras, MCMC artifacts), the only path is to either:
(a) accept a user-side Python/CUDA setup step (and wrap nerfstudio/gsplat), or
(b) ship training as a cloud API call rather than a local process.

Sources:
- https://github.com/harry7557558/spirula-studio
- https://radiancefields.com/platforms/lichtfeld-studio
- https://radiancefields.com/brush-0-2-released

---

## UNKNOWN / Could Not Verify

- **Exact SplatKit Python class names** for the `SplatKit_*` nodes: The README lists display names (e.g. "SphereSfM Dataset (Dual-Res)") not Python class names. The `nodes/__init__.py` dynamically aggregates from submodules; the submodule source files (spheresfm.py, hires.py, etc.) were not fetched. The user's class names (`SplatKit_SphereSfMDatasetDualRes`, etc.) follow a plausible convention but were not verified against the actual `NODE_CLASS_MAPPINGS` in each submodule.

- **Brush release year for v0.3.0:** The releases page showed "September 14" with no year. Given 0.2.0 was January 2025, v0.3.0 is likely September 2025. Not confirmed to the year.

- **SplatKit in ComfyUI Registry:** No evidence it is registered. Not confirmed absent — the registry was not exhaustively searched.

- **Brush COLMAP equirectangular camera support:** SplatKit by default emits pinhole cameras (compatible). The equirect camera type it can ALSO emit (`Build Equirect Dataset` node) would require a trainer that supports equirectangular projection. Brush's ModelConfig was not inspected for equirectangular support — UNKNOWN whether Brush handles non-pinhole cameras from SplatKit.

- **Brush NOTICE file contents:** Apache-2.0 requires preserving NOTICE if present. Not verified whether the repo has a NOTICE file.
