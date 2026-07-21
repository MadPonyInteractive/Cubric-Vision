# Model research — per-model authoring, tuning & measured data

**Read the relevant file before re-testing anything.** These are concluded findings,
not open questions. They graduated here from live task logs so they survive the card.

One folder per model. Add a sibling folder when onboarding a new model. The
model-agnostic *how* (deps, R2, registry, workflow split) is NOT here — that's the
[add-model playbook](../playbooks/add-model/README.md). This tree is the model-specific
*what*.

## Models

### [krea2/](krea2/) — Krea2 (Flux-lineage arch, Qwen conditioning)
Samplers, conditioning & control, style-LoRA set, resolution (÷16), injection seam,
preview/taesd landmine, int8-quant candidates. Hub: [krea2/README.md](krea2/README.md).

### [ltx/](ltx/) — LTX-2.3 video
| File | Holds |
|---|---|
| [tiers.md](ltx/tiers.md) | Resolution tiers, timing, the /32 size rule (+/64 pixel-exact), motion-vs-resolution dial. Drives `LTX_RATIOS`. |
| [workflow-authoring.md](ltx/workflow-authoring.md) | Template-wiring research for the LTX-2.3 workflow. |
| [model-set.md](ltx/model-set.md) | The base weights + LoRAs (roles, sizes, status), merge-vs-switch delivery. |
| [lora-strength-law.md](ltx/lora-strength-law.md) | Distilled-LoRA strength law (0.3–0.7, sweet spot 0.5); capability-LoRA verdicts. |
| [tested-loras-versions.md](ltx/tested-loras-versions.md) | Exact LoRA versions + base tested → re-test baseline when a NEW version appears. |
| [prompt-contract.md](ltx/prompt-contract.md) | The LTX prompt SHAPE (front-loaded anchor + ordered steps) + audio rule → Cubric-Prompt recipe. |
| [audio-input.md](ltx/audio-input.md) | Input-audio gate + influence wiring; verdict = binary gate at fixed 1.0. |
| [black-bars-and-nag.md](ltx/black-bars-and-nag.md) | t2v black-bar compositional artifact + NAG findings. |
| [lora-merge.md](ltx/lora-merge.md) | **Flatten a LoRA stack into ONE file (LTX). LIVE-PROVEN.** `LoraExtractKJ` recipe + 4 dead ends. |
| [strategy.md](ltx/strategy.md) | LTX>WAN moat, NSFW capability gap, release framing. |

### [wan/](wan/) — Wan 2.2 video
| File | Holds |
|---|---|
| [tiers.md](wan/tiers.md) | Wan 2.2 resolution tiers (14B + 5B), /16 grid, no native 2K/4K. Drives `WAN_RATIOS` + `WAN_5B_RATIOS`. |
| [two-stage-sigmas.md](wan/two-stage-sigmas.md) | **Wan 2.2 two-stage manual-sigma schedule (MPI-126, live-proven).** Lever map + walls. Read before re-tuning Wan sigmas. |

### [pid/](pid/) — NVIDIA PiD (PixelDiT) 4× upscaler
| File | Holds |
|---|---|
| [upscaler.md](pid/upscaler.md) | Source-verified compat/tier/knobs; `degrade_sigma` is the only tuning knob; image-only. Read before building/testing PiD. |

## Pod/infra research (NOT per-model) → `docs/builder/research/`

Pod-perf + cold-start investigations live in
[../builder/research/](../builder/research/) — they're tied to the RunPod engine, not
to a model.
