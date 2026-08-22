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

## Legs A / B / C - PASSED 2026-08-22

48 rows in `research/results.md`, sectioned CURRENT / SUPERSEDED / VOID so a voided row cannot be
read as a verdict. Placement scored by eye off `research/S2_contact_sheet.png`, because the
`guard` column reads a clean `green 0.00% / clip 0.1%` on all 18 S2 rows **including the nine
that placed the wrong person or nobody**. Q1, Q2 and Q3 answered in `research/verdict.md`.

## Leg D - the KV multi-reference speed leg - PASSED 2026-08-22

16 rows in `research/results_kv.md`. `wf_type` 4, no mask, an empty plate plus two different
people; `FluxKVCache` added as node 900 and reached only via `run.py --link 170.model=900,0`.
2x2 matrix (weight x cache node) x 2 reference counts x 2 seeds, plus one unrecorded warmup per
arm. Both seeds agreed within 1 s on every cell.

- **Speed:** 2.40x at 2 refs, 3.18x at 3 - **sampler-only**. End to end **1.27-1.46x**
  (38.2 s -> 26.2 s at 3 refs). Verified with `research/kv_ratios.py` re-run against the file.
- **The weight alone is 1.00x** - `kv` with the node off matches `distilled` to the second, so
  Leg C's earlier 1.00x was the correct reading of a graph with no cache node in it.
- **Quality parity, by eye** (`research/kv_adherence_sheet.png`, 16/16 scored): `distilled` 4/4,
  `kv` 4/4, `kv+node` 4/4, **`distilled+node` 1/4** - denim jacket becomes a denim shirt, the
  long yellow raincoat becomes a short cardigan and then a shirt with an olive skirt.
- **Plate preservation, measured** (`research/kv_preserve.py`, border delta /255): `distilled`
  9.25, `kv+node` 11.48, `kv` 13.35, **`distilled+node` 40.87**. The cache is quality-neutral on
  the KV weight and destructive on the distilled one.
- **VRAM:** the cache costs +600-800 MiB; worst peak **16037 / 16380 MiB**, 343 MiB headroom.
- One instrument (`research/kv_garment.py`) is recorded as **NOT WORKING** - a yellow-area proxy
  confounded by subject scale - and is explicitly not quoted.

## CLOSED 2026-08-22 - decided by Fabio

**Ship `flux-2-klein-9b-int8-convrot.safetensors` + CLIP `qwen_3_8b_int8_convrot.safetensors`.**
One transformer, one text encoder, 4 steps / cfg 1.0. No turbo LoRA, no `turboToggle`, no KV.

Fabio ran his own KV test the same day - a pose request inside painting - and was not impressed.
That agrees with the end-to-end figure above, which is the number a user feels. A correction was
made to this card's own reporting: the Leg D headline had led with the sampler-only 3.18x, which
overstated what KV delivers.

Rejected weights deleted from `G:\CubricModels\` on his instruction (bench freed first so no
handle was held), **~27.6 GiB**, verified by directory listing afterwards:
`flux-2-klein-9b-kv_int8_convrot`, both `base` copies, `loras/klein_9B_Turbo_r128`. Production
weights untouched. **Consequence: no leg on this card can be re-run** - `results.md`,
`results_kv.md` and the two contact sheets are the surviving record.

Verdict posted onto **MPI-598**: a brief section inserted above "Run the playbook" (near the top,
because the decision inverts two of the three things in that card's title) plus three events.

All four deliverable questions answered. Nothing outstanding.
