# MPI-623 checklist

Phase list and rationale live in [plan.md](plan.md) (see its Phase 0 amendments 6-10).
Evidence: [research/phase0-log.md](research/phase0-log.md),
[research/measurements.md](research/measurements.md).

## Phase 0 - prove the pipeline (bench only, NO product code)

- [x] SplatKit + ComfyUI-Mickmumpitz-Nodes installed on the standalone bench
      (`G:\ComfyUi`, port 8188). Commits `f59de25` / `4d5ff7c`, both MIT.
      **Zero pip installs needed** - the portable env already satisfies all six.
- [x] Dataset built end to end from a Poly Haven JPG equirect (`abandoned_games_room_02`,
      8192x4096, CC0) -> `images/` (96 pinhole cube faces) + `sparse/0/{cameras,images,
      points3D}.bin`. 139.0 s, 143 MB. **Poly Haven serves a tonemapped JPG** - the
      `.hdr`/`.exr` worry in brief.md is void.
- [x] SplatKit runtime downloads landed: MoGe checkpoint (1.26 GB) and `colmap_sphere`
      (37 MB, SHA-verified by the node). BSD-3-Clause notice at
      `docs/SPHERESFM-THIRD-PARTY-NOTICES.txt` in the pack.
      **A third download exists** that brief.md missed: RAFT weights, for HiRes Composite
      with `base_mode=wan`.
- [x] Brush v0.3.0 win-x64 downloaded and SHA256-verified
      (`b68e3e9c...fcd6`). All three of Vision's targets are published.
- [x] **THE GATE - PASSED.** Brush trained SplatKit's COLMAP output to a `.ply`
      (566 820 splats, SH degree 3) in 468 s, and a **held-out eval view at 5 000 steps is
      unmistakably the source room**. That is the gate on its actual wording, not merely
      format compatibility. Decision 3 in plan.md stands; no re-open.
- [x] Measurements recorded in `research/measurements.md`.
- [x] Brush stdout checked - see the finding below; the planned parse cannot work.
- [x] ComfyUI core `RenderSplat` loads and renders the Brush `.ply`
      (`Load3DAdvanced` -> `File3DToSplat` -> `RenderSplat`), 4 frames @1024 in 16 s.
- [x] Iteration tiers decided from the ladder: **Draft 5 000** (~1 min, 9 MB) and
      **Scene 30 000** (~8 min, 126 MB) - see measurements.md for why the middle tier is
      not worth shipping.

### Phase 0 findings that change the build

- [x] **Brush writes ZERO bytes to stdout when not a TTY.** `indicatif` suppresses its bar,
      so plan.md's "strip ANSI, match `N/M Steps`" has nothing to match. Poll
      `--export-path` for `export_{iter}.ply` instead. Silence is normal, not failure.
- [x] **Never point Brush at a raw SplatKit dataset root.** It holds four COLMAP models;
      the two under `_spheresfm_work/` use camera model 11 (SPHERE) and Brush picks
      **nondeterministically**, so the same command trains fine once and dies with
      `Invalid camera model` the next. Delete `_spheresfm_work/` (disposable, 60% of the
      dataset) or copy `images/` + `sparse/0/` to a clean root first.
- [x] **The Scene workspace camera must stay near the bake rail.** An outside-in orbit of
      an interior scene renders pure floaters while a held-out training view of the same
      `.ply` is a clean room. Inherent to 3DGS, not a renderer bug.
- [x] **macOS has no `colmap_sphere` build.** On Mac the 3D Scene Flow is remote-pod only.
      Not in brief.md; must reach the Flow's stated requirements.
- [x] Corrections to the plan: binary is `brush_app.exe`; flag is `--total-steps`; Brush
      ships no NOTICE (LICENSE alone discharges Apache-2.0). **Anchors: brief.md was right
      about 6 floats** - `look_forward` takes 3 (`x,y,z`), `per_point_look` takes 6
      (`x,y,z,lookx,looky,lookz`); the shipped workflow uses both, so a coverage preset
      must carry its orientation with its anchor text.

## Phase 0b - the Wan-inclusive pass (the last unmeasured term)

fp8 first per plan.md amendment 7. Weights land in folders the bench already scans.

- [x] `wan_2.1_vae.safetensors` (0.25 GB) -> `C:/AI/vae`
- [x] `clip_vision_h.safetensors` (1.26 GB) -> bench `models/clip_vision`
- [x] `umt5_xxl_fp8_e4m3fn_scaled.safetensors` (6.74 GB) -> `C:/AI/text_encoders`
- [ ] `wan2.1_i2v_720p_14B_fp8_e4m3fn.safetensors` (16.4 GB) -> `C:/AI/diffusion_models`
      (downloading)
- [x] `lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16` already present at
      `C:/AI/loras/Wan/`; `4x-UltraSharp.pth` already on the bench.
- [ ] **BLOCKED ON USER** - `pano_video_gen_720p.bin` (Matrix-3D pano LoRA, 0.61 GB) is in
      a **gated** HF repo. Fabio's token authenticates (403, not 401) but the account is
      not allow-listed: request access at `https://huggingface.co/Skywork/Matrix-3D`.
      **Matrix-3D is MIT**, so once fetched we convert with SplatKit's
      `tools/convert_pano_lora.py` and mirror the converted file to R2 - users never touch
      the gated repo. There is no substitute: without this LoRA, Wan emits ordinary
      perspective video, not equirect.
- [ ] Run `1_generate-dataset-hires.json` with Wan, one rail. Measure the Wan pass and the
      registered-frame count (Wan-free got 16 of 81).
- [ ] Re-check the tier ladder against the Wan dataset.
