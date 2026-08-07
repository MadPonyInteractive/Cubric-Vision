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
Slot semantics: [slot-order.md](krea2/slot-order.md) — scene chip 1 / subject chip 2 is
load-bearing, plus the 2-reference face wall and its ruled-out list.

### [klein/](klein/) — FLUX.2 Klein 4B (Apache-2.0, fastest image model we ship)
| File | Holds |
|---|---|
| [README.md](klein/README.md) | Hub: what ships (distilled int8, ONE tier), weights, the ONE-master-template `Input_wf_type` architecture, step counts, known limits. |
| [removal.md](klein/removal.md) | The object-removal op — green plate, crop/stitch, 4 steps, the two traps. Klein's headline capability. |
| [refcontrol.md](klein/refcontrol.md) | The depth op — the grayscale root cause (cost a day, do NOT re-derive) and the style×depth exclusivity rule. |
| [licences.md](klein/licences.md) | Community-LoRA licence method + table. Klein's Apache-2.0 does NOT extend to them. |

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

### [h3/](h3/) — MiniMax H3 video **+ native audio** (the first territory-restricted licence we ship)
| File | Holds |
|---|---|
| [README.md](h3/README.md) | Hub: what ships (fl2va; ref2va is a second card), the LICENCE constraints that are baked into the wiring and must not be tidied away, the 4 publisher-hosted weights, the no-`_stage2`-twin two-stage design with measured bar counts, media-derived routing, the 17k+5 frame grid, and why `capabilities.audio` is OFF on a model that outputs audio. |
| [ref2va.md](h3/ref2va.md) | The REFERENCE card (`minimax-h3-ref2va`): the judged results, slot-numbered prompt tags and the audio ordinal shift, what a reference costs per step, why the 2K clips online are the hosted API, and the hi-res-fix investigation — including why it does NOT work here (ref2va composes for the stage-1 canvas, and the joint video+audio latent breaks a split trajectory). |
| [performance.md](h3/performance.md) | Measured-and-REJECTED optimisations — the KJNodes H3 VRAM patches and the Sage attention patch. Read before wiring an optimisation into either H3 graph. |

### [pid/](pid/) — NVIDIA PiD (PixelDiT) 4× upscaler
| File | Holds |
|---|---|
| [upscaler.md](pid/upscaler.md) | Source-verified compat/tier/knobs; `degrade_sigma` is the only tuning knob; image-only. Read before building/testing PiD. |

### [chroma/](chroma/) — Chroma (pruned FLUX.1-schnell, Apache-2.0, T5-only)
| File | Holds |
|---|---|
| [README.md](chroma/README.md) | Hub: Flash and Hyper are SEPARATE checkpoints (why the tier is a per-file bake, not a runtime inject), the ONE-master-template `Input_wf_type` map, the RES4LYF `ClownModelLoader`, the FLUX-ControlNet depth op and its measured 0.5 strength ceiling, the style rack, and the ruled-out list (no editing route, no Chroma-native ControlNet, Radiance incompatible). |
| [licences.md](chroma/licences.md) | Style-LoRA licence table **and the corrected method** — the CivitAI API is blind to the page licence badge, which outranks the permission flags. Read this before checking ANY community weight, Chroma or not. |

### [sdxl/](sdxl/) — SDXL family (sdxl-realistic, sdxl-nsfw, ill-anime-beauty, ill-anime, pony-mix)
| File | Holds |
|---|---|
| [depth-control.md](sdxl/depth-control.md) | The Depth op — reuses Krea2's `poseReference` key, but the mechanism is a real **ControlNet weight** (the app's first non-LoRA controlnet dep), the graph path, and why the yaml needs zero edits. |

### [community-merges-licences.md](community-merges-licences.md) — the nine picked community checkpoints
Licence table + creators for `sdxl-realistic`, `sdxl-nsfw`, `ill-anime`, `ill-anime-beauty`,
`pony-mix` and the four `wan-22-*`. No folder of their own — they are picked merges, not
researched models. Read it before touching their deps: eight of the nine now carry a
**required** `credit` block, only two resolved by hash, and two withhold the `Image` flag.

## Pod/infra research (NOT per-model) → `docs/builder/research/`

Pod-perf + cold-start investigations live in
[../builder/research/](../builder/research/) — they're tied to the RunPod engine, not
to a model.
