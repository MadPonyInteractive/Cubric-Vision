# Research — locked decisions & measured data

**Read the relevant file before re-testing anything.** These are concluded findings,
not open questions. They graduated here from the live MPI-4 task log so they survive
the card and don't get re-discovered.

| File | Holds |
|---|---|
| [ltx-2.3-tiers.md](ltx-2.3-tiers.md) | Resolution tiers, timing, the /32 size rule (+/64 pixel-exact), motion-vs-resolution dial. Drives `LTX_RATIOS`. |
| [wan-2.2-tiers.md](wan-2.2-tiers.md) | Wan 2.2 resolution tiers (14B + 5B), /16 grid, no native 2K/4K. Drives `WAN_RATIOS` + `WAN_5B_RATIOS`. |
| [wan-2.2-two-stage-sigmas.md](wan-2.2-two-stage-sigmas.md) | **Wan 2.2 two-stage manual-sigma schedule (MPI-126, live-proven 2026-07-02).** Shipped t2v 4+3@0.70 / i2v 2+4@0.85. Lever map (handoff = content dial; step count = preview legibility; cliff-split = consistency). Walls: sampler/shift can't fix specks, i2v eyes are 720p-bound, realistic look needs different weights. Read before re-tuning Wan sigmas. |
| [lora-strength-law.md](lora-strength-law.md) | Distilled-LoRA strength law (0.3–0.7, sweet spot 0.5); model-only; **+ CAPABILITY-LoRA VERDICTS (VBVR + Singularity DROPPED; ship base + prompt-contract)**. |
| [tested-loras-versions.md](tested-loras-versions.md) | **Exact LoRA versions + base tested** → re-test baseline when a NEW version appears. Don't re-litigate from zero. |
| [model-set.md](model-set.md) | The base weights + LoRAs (roles, sizes, status), merge-vs-switch delivery, mirroring TODO. |
| [prompt-contract.md](prompt-contract.md) | The LTX prompt SHAPE (front-loaded anchor + ordered steps) + audio rule → Cubric-Prompt recipe. |
| [audio-input.md](audio-input.md) | Input-audio gate + influence wiring; influence = denoise-preserve dial (not a mix); verdict = binary gate at fixed 1.0, slider not needed. |
| [strategy.md](strategy.md) | LTX>WAN moat, NSFW capability gap, future NSFW-motion-LoRA epic, release framing. |
| [quant-and-coldstart-investigation.md](quant-and-coldstart-investigation.md) | **Quant transformer + cold-start sweep (2026-06-29).** Headline: GGUF Q8_0 STRUCTURALLY bypasses aimdo's staging/re-fault tax (→ removes the cold tax, doesn't just shrink it). Corrects the aimdo mechanism (VMM API + memlock-fail-restage, NOT hardware UVM). Quant candidate ranking (Q8_0 prime; NVFP4 cu130-gated; nunchaku=dead). Read before any quant/cold-start work. **Research only — needs the §5 live Pod A/B.** |
| [pod-perf-investigation.md](pod-perf-investigation.md) | **Why the cloud 4090 isn't faster than a local 4060 Ti.** CONCLUDED: torch 2.8+cu126→2.12+cu130 bump is a DEAD END (cu130 gains are Blackwell-only, costs the r580 driver floor). OPEN: two unmeasured suspects (aimdo overhead on a card that doesn't need offload; cloud-host P-State/clock throttle) + the exact test plan. Read before proposing any torch/cu130 bump. |
| [lora-merge-ltx.md](lora-merge-ltx.md) | **Flatten a LoRA stack into ONE file (LTX). LIVE-PROVEN 2026-07-01.** Recipe: `LoraExtractKJ` (standard + svd_linalg, rank = max source LoRA rank) → union model+clip halves with `scripts/merge-loras/merge_lora.py`. Documents 4 dead ends: checkpoint save, native merge nodes (`.temp` on LTX MixedPrecisionOps), `lora_type: full` (40GB + meta-tensor crash), quantized bases break the extract (extract from BF16). Read before re-attempting a merge. |

## Live task log (NOT here — still on the card)

The blow-by-blow test queue, in-flight state, template node inventory, and held
reminders stay in the MPI-4 task spec (it's a *task* log, this is *findings*):

`Cubric-Vision/.agents/mpi-kanban/tasks/MPI-4/research/ltx-integration-spec.md`

When a finding there concludes and stops being task-specific, graduate it into one
of the files above and leave a pointer.

## Adding a new model's research

When onboarding a different model/workflow, add a sibling set here (e.g.
`research/<model>-tiers.md`, `<model>-lora-notes.md`) and a row in this table. Same
rule: concluded findings live here; the live test log stays on its task card.
