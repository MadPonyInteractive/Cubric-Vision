# docs/ — index & knowledge map

Where each kind of durable knowledge lives, so agents don't scan every file. For app
**architecture orientation** start at [PROJECT.md](PROJECT.md). For **non-obvious conventions +
expiring flags** see [gotchas.md](gotchas.md) (kept small on purpose — see the ≤200-line rule below).

## The ≤200-line-per-doc rule (MPI-170)

Docs should not exceed **200 lines**; over that = split into topic files. When you learn something
durable, write it to its **subsystem** doc (below), NOT into gotchas.md — gotchas is conventions +
temporary/unverified flags only. It was drained from 646 lines to ~100 in MPI-170 precisely because
agents kept dumping subsystem knowledge into it with nothing routing back out.

**Exempt from the 200-line rule** (append-only evidence / coherent single-subject contracts — do
NOT mechanically split these):
- `builder/research/pod-perf-investigation.md` — research lab notebook (evidence log)
- `builder/research/quant-and-coldstart-investigation.md` — evidence log (quantisation + cold-start investigation)
- `releases/build-experience-log.md` — build evidence log
- `project-integrity.md`, `runpod-remote-engine.md`, `releases/portable-distribution-contract.md`, `download-manager.md` — coherent single-subject contracts, near/over the line by design (download-manager: the full install/download/uninstall lifecycle + store/reconciler/snapshot, MPI-276)
- `versioning.md` — coherent single-subject contract (APP/SCHEMA/COMFY versioning + op registry)
- `models/ltx/audio-input.md` — research lab notebook (evidence log)
- `playbooks/add-model/` — end-to-end procedure split into a README hub + numbered section files; the README carries the mandatory step ordering

## Map — where knowledge lives

### Core app
| Topic | Doc |
|---|---|
| Orientation hub (architecture, invariants) | [PROJECT.md](PROJECT.md) |
| Conventions + temporary/unverified flags | [gotchas.md](gotchas.md) |
| Dev setup / commands | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Workspaces / routing | [workspaces.md](workspaces.md) |
| Data layer (registries, projectModel) + gen/prompt/sidecar gotchas | [data.md](data.md) |
| Project data model (.meta sidecars, reconciliation) | [project-integrity.md](project-integrity.md) |
| Versioning (APP/SCHEMA/COMFY, op registry) | [versioning.md](versioning.md) |
| Shell services (overlays, hotkeys, statusbar) | [shell.md](shell.md) |
| Events / EventBus | [events.md](events.md) |
| Utilities (dom, icons, ratios, seed, mediaActions save/download) | [utils.md](utils.md) |
| Worktrees / shared engine | [worktrees.md](worktrees.md) |
| UI & component contracts (18 gotchas) | [ui-gotchas.md](ui-gotchas.md) |
| Apps (App Library + App overlays; add-an-app procedure) | [playbooks/add-app/README.md](playbooks/add-app/README.md) |

### ComfyUI / generation
| Topic | Doc |
|---|---|
| ComfyUI integration + engine gotchas | [comfy.md](comfy.md) |
| **Latent-preview bus** (`preview:frame`, engine-tagged, broken-frame gate, last-latent hold — subscribe here to show latents anywhere) | [preview-bus.md](preview-bus.md) |
| **Workflow authoring + injection contract** (MpiNodes pack, injector target list, generator/tier patterns) — model/app-agnostic | [workflow-authoring/README.md](workflow-authoring/README.md) |
| Models-path / YAML / extra-folders | [models-path.md](models-path.md) |
| Download manager (resumable, NDH) | [download-manager.md](download-manager.md) |

### RunPod remote engine
| Topic | Doc |
|---|---|
| Architecture contract (topology, lifecycle, billing) | [runpod-remote-engine.md](runpod-remote-engine.md) |
| Fixed-bug traps + CPU download-mode | [runpod-troubleshooting.md](runpod-troubleshooting.md) |
| Engine-split (deps + workflow axis) | [.claude/rules/comfy_engine.md](../.claude/rules/comfy_engine.md) § Engine Split |

### Builder Pod / model onboarding
| Topic | Doc |
|---|---|
| **End-to-end model onboarding procedure** (deps, R2, registry, workflow, type sweep) — README hub + section files | [playbooks/add-model/README.md](playbooks/add-model/README.md) |
| **Per-model research** (LTX, Wan, Krea2, PiD) — authoring, tuning, measured data | [models/README.md](models/README.md) |
| Builder operational loop | [builder/README.md](builder/README.md) |
| Environments (ComfyUI portable, cu130) | [builder/01-environments.md](builder/01-environments.md) |
| Pod image / mpi-ci / version-lock / rebuild | [builder/02-image-and-rebuild.md](builder/02-image-and-rebuild.md) |
| Spin + install nodes/weights | [builder/03-spin-and-install.md](builder/03-spin-and-install.md) |
| Add models + GC ledger | [builder/04-add-models.md](builder/04-add-models.md) |
| Author + test workflows (gen system, node-naming, SaveVideo) | [builder/05-author-and-test.md](builder/05-author-and-test.md) |
| Teardown | [builder/06-teardown.md](builder/06-teardown.md) |

### Model research (concluded findings — read before re-testing)
Per-model authoring/tuning/measured data lives under `docs/models/<model>/` —
index: [models/README.md](models/README.md).
| Model | Home |
|---|---|
| LTX-2.3 (tiers, workflow authoring, model-set, LoRA strength/merge, prompt contract, audio, black-bars, strategy) | [models/ltx/](models/ltx/) |
| Wan 2.2 (tiers, two-stage sigmas) | [models/wan/](models/wan/) |
| Krea2 (samplers, conditioning, styles, resolution, injection, preview, int8-quant) | [models/krea2/](models/krea2/) |
| PiD upscaler | [models/pid/](models/pid/) |

### Builder/infra research (Pod-tied, not per-model)
| Topic | Doc |
|---|---|
| Research index | [builder/research/README.md](builder/research/README.md) |
| Pod perf (aimdo cold-fault) — evidence log | [builder/research/pod-perf-investigation.md](builder/research/pod-perf-investigation.md) |
| Quant + coldstart investigation | [builder/research/quant-and-coldstart-investigation.md](builder/research/quant-and-coldstart-investigation.md) |

### Build / release / distribution
| Topic | Doc |
|---|---|
| Release index (dev_mode, stage derivation, gating) | [releases/README.md](releases/README.md) |
| Patch/promote/public flow + R2 upload | [releases/patch-distribution.md](releases/patch-distribution.md) |
| Portable artifact contract | [releases/portable-distribution-contract.md](releases/portable-distribution-contract.md) |
| GitHub release checklist + macOS testing | [releases/github-release-checklist.md](releases/github-release-checklist.md) |
| Build evidence log + macOS fixes | [releases/build-experience-log.md](releases/build-experience-log.md) |
| Per-version release notes | `releases/YYYY-MM-DD-v<ver>.md` |

### Redesign spec (only when touching a new surface / follow-up phase)
See [redesign/PORTING.md](redesign/PORTING.md) — the Stage baseline is merged; routine work follows
`styles/01_base.css` + `.claude/rules/components.md`, not these docs.
