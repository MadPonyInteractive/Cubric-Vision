# MPI-600 Validation

## Leg 0 - PASSED 2026-08-22

Evidence: three runs on the standalone bench (:8188, ComfyUI 0.31.0, RTX 4060 Ti 16380 MiB) via
`research/run.py`. Full numbers and the measurement traps are in `research/format.md`.

- t2i 1024x1024, seed 2, 4 steps / cfg 1.0 - `execution_cached: 0 nodes`, 20.4 s, peak 15692 MiB
  against a 1511 MiB floor. Output `D:\WORK\Images\Outputs\klein_9b\leg0\t2i_00002_.png`,
  header-confirmed 1024x1024.
- kleinEdit 1024x1024, seed 3, off that plate - 20.2 s, peak 15574 MiB against a 1500 MiB floor.
  Output `...\klein_9b\leg0\edit_00001_.png`, header-confirmed 1024x1024. Garment changed,
  identity / pose / background / shadow held, no visible edit rectangle.

Exit condition met: INT8 ConvRot confirmed at 1024 on this card with no custom node, peak VRAM
recorded (~14.1 GB attributable, ~690 MiB headroom), CLIP fixed to
`qwen_3_8b_int8_convrot.safetensors` (type `flux2`) and VAE fixed to `flux2-vae.safetensors`.

Legs A, B and C are not started. This card stays in `doing`.

## Leg 0 addendum - localised masked edit (`wf_type` 5) - PASSED 2026-08-22

- Run 4: `wf_type` 5, seed 4, plate `t2i_00002_.png` + mask `plates/mask_standing_left.png`
  (10.0% of frame), 31.1 s. Output `...\klein_9b\leg0\inpaint_00001_.png`. A man in a denim
  jacket placed on the road, casting his own shadow in the scene's light direction, no visible
  rectangle.
- `seam.py` on that run: outside-mask mean signed shift **-0.021/255**; beyond 128 px the result
  is **byte-identical** to the plate (max delta **0**). All change confined to the designed
  <=64 px blend feather. Conclusion: **no colour cast** - the failure mode is a seam step at
  0-32 px.
- Graph safety re-verified after edit #8: branches 1, 4 and 5 each reach **zero**
  `LoraLoaderModelOnly`; all `Input_Lora` and style-LoRA slots `None`.

## Scenarios locked 2026-08-22

`research/scenarios.md` written and locked: 3 scenarios x 3 fixed seeds = 9 runs per candidate.
Scenario 1 (object / character replacement) dropped by Fabio - covered by the S2 localised edit.
Fixed plate and mask promoted to `D:\WORK\Images\Outputs\klein_9b\plates\`.

Legs A, B and C are not started. Card stays in `doing`.
