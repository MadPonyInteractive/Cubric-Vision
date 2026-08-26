# MPI-623 - 3D scene generation

Bake a navigable Gaussian-splat scene from any 360 equirect image, then re-enter it
anytime to capture stills from new angles.

**The goal is environment consistency across a series.** A room that appears in
episodes 1-6 gets baked once; every shot of it is captured from the same real
geometry instead of re-prompted and re-drifted. Environment twin of the
LoRA-free character bet.

Source: Mickmumpitz, *"We Open Sourced World Generation"* (2026-08-25,
`youtube.com/watch?v=eJuYBNrD8HI`). Two free workflow JSONs from his Patreon post
`mickmumpitz.ai/posts/new-video-free-167647096` were read directly for the node/weight bill below.

---

## Shape (approved 2026-08-26)

| Piece | What |
|---|---|
| **Flow: 3D Scene** | any equirect image -> MoGe geometry -> canned coverage paths -> Wan 2.1 + Matrix-3D LoRA -> HiRes reproject -> SphereSfM COLMAP -> Brush -> `.ply` -> **Scene card** |
| **Flow: 360 Panorama** | Krea2 + two 360 LoRAs; text->pano or image->outpaint, seam fix, 8K upscale -> panorama card. **Optional, not a prerequisite** |
| **Workspace: Scene** | click Scene card -> `PAGE_SCENE` -> fly -> capture -> image card. **Runs no generation** |

Capture stills feed the existing surfaces unchanged - i2v, krea2Edit, composite,
control. No new "scene -> video" path is built; the app already is that path.

## Decisions and why

- **Scene is a project asset (not a library asset).** Cross-project reuse is already
  solved by the existing Add-to-project card copy (`routes/projects.js:2099`,
  `MpiGalleryBlock.js:355`). A dedicated "3D Scenes" project acts as the library.
  Zero new storage infra.
- **Two independent Flows, panorama optional.** The dataset workflow's input is a plain
  `LoadImage` - any equirect works, including a free Poly Haven HDRI. Confirmed in the
  video. **This takes Mickmumpitz's two LoRAs off the critical path**, so Phase 1 needs
  no permission from him.
- **Brush trains the splat, not gsplat.** Forced, not preferred - see the blocking
  finding below.
- **Capture renders in-app, not via `RenderSplat`.** Taking a photo of a scene you
  already own should feel like a screenshot, not a queued generation. Works with the
  engine down.
- **Two render paths in one renderer.** Interactive view may be fast and approximate;
  the **capture path must be exact global depth sort, full SH degree 3, fp32,
  arbitrary resolution**. All renderer quality gaps are framerate compromises, and
  capture is not framerate-bound. Without this the pond loses its reflections.
- **Pin SplatKit as a third-party node dep, do not vendor it.** No LICENSE file yet =
  all rights reserved by default, whatever the author's stated intent (he rejected
  Apple SHARP explicitly on licence grounds, and his other pack is MIT). Pinning is
  also less work than absorbing 6 nodes. Absorb into MpiNodes only if modification
  is needed, and only once a licence exists.
- **The drone paths are capture, not content.** Nobody watches the Wan clips - they are
  shredded into perspective views for COLMAP. So ship canned coverage presets, not a
  spline editor. Quality lever is coverage, not the pixel path: a capture looks bad
  when you fly where the drones never mapped.

## BLOCKING FINDING - gsplat is not viable here

`gsplat`'s PyPI wheel is `py3-none-any` (no kernels). Its prebuilt CUDA wheels
(`docs.gsplat.studio/whl/`) top out at **torch 2.4 / cu124 / cp310**.

**Vision runs torch 2.12.0+cu130.** No prebuilt wheel can apply; it would fall back to
a source/JIT build needing MSVC + the CUDA 13 toolkit on every user's machine.

Second, larger reason: a CUDA-extension trainer is **coupled to the torch version**, so
every `/mpi-bump-engine` would risk silently breaking splat training.

**Brush** (`github.com/ArthurBrussee/brush`) instead: Apache-2.0, reads COLMAP natively,
CLI/headless, **wgpu not CUDA** (AMD/Intel/NVIDIA/Mac), dependency-free binaries, immune
to engine bumps. It also compiles to WASM - a candidate for the Scene workspace renderer,
which would make it one dependency instead of two. Not decided.

## Weight and node bill (read from the two workflow JSONs)

**Already shipped by Vision** - `krea2-raw-transformer`, `qwen3vl-abliterated-clip`,
`wan_2.1_vae`, `krea2-lora-identity-edit` (this *is* the Ostris edit patch), `umt5`,
`lightx2v`, `ComfyUI-UltimateSDUpscale`, style-LoRA infra.

**New for the 3D Scene flow:**

| Item | Note |
|---|---|
| `Wan2_1-I2V-14B-720P_fp8_e4m3fn` | ~16GB. **Wan 2.1, not 2.2.** A `Q4_K_M` GGUF loader is wired in the same workflow (~9GB) |
| `pano_video_gen_720p_comfy` | Matrix-3D LoRA. Matrix-3D is MIT |
| MoGe | Microsoft, MIT. Node does `auto (download)` - **pre-stage it into the dep system**, do not let a node fetch uncontrolled |
| Brush binary | Apache-2.0, per-platform |
| SplatKit nodes (6) | `CameraPlotRenderControlGeo`, `WanI2VMaskedConditioning`, `HiResComposite`, `SphereSfMDatasetDualRes`, `SphereSfMAddToDatasetDualRes`, `DatasetProject` |

**New for the 360 Panorama flow:** `krea2_t2i_360_erp_lora_v1`,
`krea2_oedit_360_erp_outpaint_lora_v1` (both Mickmumpitz, permission needed), plus 5
`MickmumpitzPano*` nodes and an upscaler (`4x-NMKD-Siax`, already shipped, can substitute).

**No engine bump needed.** The pinned engine (`v0.31.0`, commit `43cb4ff`, 2026-08-07)
already ships `comfy_extras/nodes_gaussian_splat.py` - load `.ply`/`.splat`/`.ksplat`/`.spz`,
`RenderSplat`, Transform/Merge/Info, Gaussian->Mesh. **COLMAP is embedded too** -
`SplatKit_SphereSfM*` runs SfM inside ComfyUI, so no external COLMAP binary.

## Camera path format

`SplatKit_CameraPlotRenderControlGeo` takes waypoints as **plain text, 6 floats per line**:

```
0.000, 0.000, 0.000, -1.195, 0.000, 0.124
-0.464, 0.387, 0.129, -1.564, 0.000, -0.245
```

`x,y,z, lookx,looky,lookz`, plus mode (`per_point_look` | `look_forward`) and frame count.
A Vision UI just emits that string - **zero node modification**. Coverage presets are four
hardcoded strings. The reference workflow runs 5 rails (4 + 1 optional), each 1440x720
equirect x 81 frames.

## Phasing

- **Phase 0 - spike, no product code.** Run both workflows on the bench/pod. Find where
  SplatKit ships and confirm its licence. Prove Brush CLI consumes SplatKit's COLMAP
  output. Confirm a Poly Haven JPG equirect works as input. **Measure the bake.**
  *Gate: if Brush cannot read that dataset, everything downstream shifts.*
- **Phase 1 - 3D Scene flow.** Pin SplatKit; Wan 2.1 dep (+GGUF variant); pre-stage MoGe;
  4 coverage presets; Brush binary dep + subprocess; `.ply` asset + Scene card.
- **Phase 2 - Scene workspace.** `PAGE_SCENE`, renderer, fly controls, dual render path,
  capture -> image card.
- **Phase 3 - 360 Panorama flow.** Independent of 1-2, parallelisable. Blocked on LoRA permission.
- **Phase 4 - camera-path video plates.** Same renderer in a loop; a dolly move with locked
  geometry is far stronger than a still for v2v.

## Open risks

Investigated 2026-08-26 - notes in `research/`, plan in `plan.md`. Status below.

- **RESOLVED - SplatKit ships at `github.com/mickmumpitz/ComfyUI-SplatKit`, MIT.** Not in
  the ComfyUI Registry or Manager list, so pin by git URL + commit. Requirements are light
  and **pin no torch**. But: it downloads a `colmap_sphere` SphereSfM binary at runtime
  which is **BSD-3-Clause, not MIT** - easy to miss because the pack around it is MIT.
- **RESOLVED - Brush is Apache-2.0 with prebuilt binaries for exactly Vision's three
  targets** (win x64, mac arm64, linux x64). Its expected COLMAP layout matches SplatKit's
  default output on paper. **No viable fallback exists** - the only other prebuilt,
  no-CUDA-toolchain trainer found is GPL-3.0. Brush is load-bearing.
- **STILL OPEN - Brush <-> SplatKit compatibility is unproven in practice.** Phase 0's gate.
- **STILL OPEN - bake time unmeasured.** No number is quoted anywhere in any source.
  Do not guess; Phase 0 measures it.
- Poly Haven serves `.hdr`/`.exr`; ComfyUI's `LoadImage` reads neither. Their JPGs work.
  Needs a converter or a format guard.
- **Known trap:** style LoRAs do not compose with the Krea2 edit LoRA (MPI-282). The
  panorama Flow's IMG2SPHERE path is exactly that combination - edit patch + outpaint
  LoRA. Test it before planning around it.

## Correction to this brief

The node names recorded above are **correct** - verified directly against `pano.json`.
An investigation agent reported them as wrong because the internal Python class names are
unprefixed (`PanoRollHorizontal` etc.). The `NODE_CLASS_MAPPINGS` key is what a workflow
binds to. **A ComfyUI node's registered type is not necessarily its class name - trust the
workflow JSON, not the source.**
