# MPI-711 — plan

Opened 2026-09-09. `brief.md` is the record of WHY this card exists and what is settled;
this file is the running plan. Read the brief first — it carries the numbers.

**Verify mode:** user-ux

Verification on this card is the user's eyes on a benched clip, plus sourced numbers with
their URLs. There is no test to run.

## Current State

**UN-PARKED 2026-09-09/10 — the thesis is PROVEN and Bernini-R is the answer.** The card was
parked on 2026-09-09 (square mask on the H3/LanPaint route did not rescue it, `brief.md`
§ Square mask) and the board still says `todo`/`planned`, which is now WRONG: real work ran
on it on 09-09 and 09-10. **The board needs moving to `doing` — a handoff may not do it.**

What happened, in order:

1. **Bernini-R works.** The user ran ComfyUI's shipped template and got a clean localised
   edit — hair recoloured AND the background replaced, face/outfit/pose intact. H3 never
   moved hue off ~14 at any denoise; this did it in one pass. The "masking is a workaround
   imposed on a model with no native localised-edit task" framing in `brief.md` is
   vindicated.
2. **Masked beats unmasked.** The user's own finding: a full-frame edit degrades the image,
   a masked one holds. So masking still belongs on top — but as crop-and-composite
   (`InpaintCropImproved`/`InpaintStitchImproved`), NOT as H3's known-pixel conditioning.
   That answers Phase 4's first question ahead of time.
3. The user built their own bench graph, `flow_bernini_video_edit.json` (163 nodes), and it
   is reviewed and structurally clean as of 09-10 07:50.
4. **`MpiBerniniConditioning` was built** in the sibling node pack — committed as `20a8d4d`,
   **NOT pushed, and `dev_configs/node_lock.json` NOT bumped.** Both wait on the user.

The square-mask failure recorded in `brief.md` is H3-specific and does **not** transfer:
LanPaint hard-thresholds its mask and conditions on known pixels, so a square removes the
pixels it needs. Bernini has no mask input at all and conditions on in-context latents.

Next action: the user is porting speed tricks from their existing Wan 2.2 workflow, then
testing `reference_video` / `ref_image_*`. Phase 3 (rv2v character replacement) is the
first real use of the new node's slots.

The H3 + LanPaint masked route is closed on measurement (brief.md § The wall). The card is
now evaluating models with a **native localised-edit task**.

Phase 1 is done — `research/licence-and-weights.md`. It **inverts the order below**:
Capybara's MIT tag covers Glanty's project, not the weights. Its 16.7 GB transformer is
"built upon" HunyuanVideo-1.5, whose Tencent Hunyuan Community License reads
"THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH
KOREA" — the H3 restriction again. Bernini-R is Apache 2.0 at ByteDance and at the Comfy-Org
repack, no territory clause, no MAU cap.

Capybara is **dropped** (user, 2026-09-09): 200 stars, ComfyUI support last touched ~7
months ago, and the Tencent territory clause on top. Not being benched at all for now.

Bench setup is done — `research/bernini-bench-setup.md`. ComfyUI v0.34.2 on the bench has
`comfy_extras/nodes_bernini.py` in core; the 1.3B is downloaded and verified; the text
encoder, the lightx2v LoRA and the correct Wan 2.1 VAE were all already on disk.

Weights are down and verified: the **14B fp8 pair** (15,574,833,216 B each). The 1.3B was
pulled then deleted — the user runs Wan 2.2 A14B comfortably on the 4060 Ti because the MoE
loads one expert at a time, so the 14B is the real candidate and the 1.3B is not worth a run.

Next action: run the hair case as **v2v** on the 14B, in the user's own copy of ComfyUI's
shipped `video_bernini_r_video_editing` template, with `task_type` set to
**Video Editing (Style / Motion)** rather than the default Content Propagation.
Two things that run counter to the H3 experience: there is **no mask input on the node at
all**, and the risk therefore inverts — H3 failed by the plate winning, this can fail by the
whole frame moving.

## Phase 1 — Source the two candidates (no downloads)

**Verify:** a table with licence / weight files / total size / VRAM for both models, every
row citing its URL, and every figure the source does not state marked `unknown` rather
than estimated.

1. Capybara (Glanty, HunyuanVideo-1.5 base) — <https://huggingface.co/Glanty/Capybara>.
   Licence is recorded as MIT in the brief; confirm on the repo itself, not a mirror.
   Enumerate the weight files and their sizes. Establish the VRAM floor at the recommended
   480p / 50 steps, and whether FP8 is required (brief notes CUDA 12.6, compute >= 8.9).
2. Bernini-R (ByteDance, Wan 2.2 renderer-only) —
   <https://docs.comfy.org/tutorials/video/bytedance/bernini-r>. **Licence is the hole**:
   the tutorial does not state one. Chase the model repo itself. A territory-restricted or
   non-commercial licence is disqualifying at product level, so this is the gate.
3. Report to the user before any weight is pulled.

## Phase 2 — Bench Capybara on the hair case

**Verify:** the user's eyes on the clip, plus hue measured inside the mask against the
brief's table. Pink is hue ~150; every H3 run landed 10.1-19.2.

Same clip, same ~1s window, instruction "make her hair pink". Judge on the numbers in
`brief.md`, not by eye alone. The ~1s window is the design point — do not raise it.

## Phase 3 — Bench Bernini-R rv2v

**Verify:** the user's eyes on a reference-guided character replacement.

The original goal, not the narrowed hair case: change this character using this image.

## Phase 4 — Decide

Only if one wins: whether masking is still wanted on top, and whether the
`MpiH3EncodeAV` / `MpiH3DecodeAV` pair carries over or is H3-specific.

## Remaining Work

- [x] Phase 1 — licence + weights + VRAM for both, sourced (`research/licence-and-weights.md`)
- [ ] Phase 2 — Capybara on the hair case
- [ ] Phase 3 — Bernini-R rv2v on character replacement
- [ ] Phase 4 — decision
- [ ] Separate card for VOID as an object-removal Flow (removal-only; NOT this card)
- [ ] At the very end: one MpiNodes release + one `dev_configs/node_lock.json` pin bump
      (commits through `287edb8` / v1.2.11 are local and unpushed by standing instruction)

## Completed

- 2026-09-09 Phase 1. Licence, weights, sizes and GPU floor sourced for both candidates,
  every figure carrying its URL — `research/licence-and-weights.md`. Nothing downloaded.
- 2026-09-09 Bench setup. Bernini-R 1.3B downloaded to `C:/AI/diffusion_models/` and
  verified on disk (2,838,276,200 B). Bench ComfyUI v0.34.2 already carries the native
  `BerniniConditioning` node. Node contract, task-inference table and the no-mask finding
  written up in `research/bernini-bench-setup.md`.

## Plan Drift

- 2026-09-09: plan.md created. The card ran on `brief.md` alone from its creation on
  2026-09-08 until now, which left `mpi-handoff` with no running notes to read.
- 2026-09-10: **Phase 2 is dead and Phase 3 is what remains.** Capybara was dropped, so
  "bench Capybara on the hair case" will not happen; Bernini-R already passed the hair case
  as v2v, which was Phase 2's actual purpose. What is left of the plan is Phase 3 (rv2v with
  references) and Phase 4 (decide), plus the two carried items — a VOID card, and the
  MpiNodes release + pin bump.
- 2026-09-10: a **dependency cycle** was found and fixed in the bench graph. The trim that
  sizes the plate had been wired to `MpiBerniniConditioning`'s `length` OUTPUT, but the trim
  feeds SAM3 → crop → packer → back into that same node's `source_video`. ComfyUI would have
  refused the graph. Repointed to `Snap length to 4n+1#1070`, which derives the same number
  from `frame_count` alone and sits upstream of everything. **General rule the node's
  docstring does not say: the `length` output may only feed things DOWNSTREAM of
  `source_video`.**
- 2026-09-09: **Phase order swapped, Bernini-R before Capybara.** The brief's licence row
  for Capybara ("MIT") is true of the project and not of the weights. Licence-first, as the
  handoff demanded, puts the Apache-2.0 model first. `brief.md` § The new direction has the
  Capybara licence cell wrong and should be corrected at close-out — leaving it as written
  is how this trap gets re-walked in three weeks.
