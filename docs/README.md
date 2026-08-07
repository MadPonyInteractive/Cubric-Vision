# docs/ — index & knowledge map

Where each kind of durable knowledge lives, so agents don't scan every file. **Match your task
in the map below and read ONLY the target(s).** For app **architecture orientation** start at
[PROJECT.md](PROJECT.md). Agent behavior rules live in `.claude/rules/`
([routing index](../.claude/rules/README.md)). Every docs/ subfolder has its own README routing
file — enter a folder through it.

## The ≤200-line-per-doc rule (MPI-170)

Docs should not exceed **200 lines**; over that = split into topic files. When you learn something
durable, write it to its **subsystem** doc (below) — there is no catch-all dump file, and none may
be created. Cross-cutting conventions go in `.claude/rules/dos_and_donts.md`.

**Exempt from the 200-line rule** (append-only evidence / coherent single-subject contracts — do
NOT mechanically split these):
- `builder/research/pod-perf-investigation.md` — research lab notebook (evidence log)
- `builder/research/quant-and-coldstart-investigation.md` — evidence log (quantisation + cold-start investigation)
- `releases/build-experience-log.md` — build evidence log
- `project-integrity.md`, `runpod-remote-engine.md`, `releases/portable-distribution-contract.md`, `download-manager.md` — coherent single-subject contracts, near/over the line by design (download-manager: the full install/download/uninstall lifecycle + store/reconciler/snapshot, MPI-276)
- `versioning.md` — coherent single-subject contract (APP/SCHEMA/COMFY versioning + op registry)
- `toasts.md` — coherent single-subject contract (the full toast/notification call-site map: `ui:*`, `StatusBar.notify`, `notificationService`, the sound model, and which events must NOT toast). Splitting it would scatter "does this fire a toast?" across files, which is the one question the doc exists to answer in one place.
- `models/ltx/audio-input.md` — research lab notebook (evidence log)
- `playbooks/add-model/` — end-to-end procedure split into a README hub + numbered section files; the README carries the mandatory step ordering

## Map — where knowledge lives

### Core app
| Topic | Doc |
|---|---|
| Orientation hub (architecture, invariants) | [PROJECT.md](PROJECT.md) |
| Dev setup / commands / reading `logs/app.log` | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Tests — both suites, the release gate, writing a desktop spec | [testing.md](testing.md) |
| Workspaces / routing | [workspaces.md](workspaces.md) |
| Data layer (registries, projectModel, resolver, persist whitelist, reuse/sidecar) | [data.md](data.md) |
| Project data model (.meta sidecars, reconciliation) | [project-integrity.md](project-integrity.md) |
| Versioning (APP/SCHEMA/COMFY, op registry) | [versioning.md](versioning.md) |
| Shell services (overlays, hotkeys, statusbar) | [shell.md](shell.md) |
| Events / EventBus | [events.md](events.md) |
| **Toasts & notifications** (full call-site map, sound model, `ui:*`/`StatusBar.notify`/`notificationService`) | [toasts.md](toasts.md) |
| Utilities (dom, icons, ratios, seed, mediaActions save/download) | [utils.md](utils.md) |
| Worktrees / shared engine | [worktrees.md](worktrees.md) |
| **Generation lifecycle** (dispatch guard, progress pipeline, Stop/lanes identity doctrine, queue-drain notifications) | [generation-lifecycle.md](generation-lifecycle.md) |
| **Op & model selection** (op strip's two mounts, absent-vs-dim gating, op memory, media transitions, model picker, bar order) | [op-model-selection.md](op-model-selection.md) |
| **Gallery** (cards, thumbnails, selection, drag-drop, hover media) | [gallery.md](gallery.md) |
| **Masking** (layer model, the display-vs-export split, overlay draw, mask storage) | [masking.md](masking.md) |
| **Canvas tool family** (Mask/Paint/Composite taxonomy, the preview contract, Add/Subtract, who owns which panel, the PromptBox contract) | [masking-tools.md](masking-tools.md) |
| **SAM3 masking** (click-point + open-vocabulary text tools, their graph branches, the `name:N` trap) | [masking-sam3.md](masking-sam3.md) |
| **Shape gizmo** (rect/triangle/ellipse, the two mounts, handles + ALT-rotate, shape-local hit-testing) | [masking-shapes.md](masking-shapes.md) |
| **Mask adjust** (grow/shrink/edge band off one distance field, why it is not a blur, Fill Holes' two passes) | [masking-adjust.md](masking-adjust.md) |
| **Canvas undo** (the shared command stack, what it stores and why, dirty rects, the Ctrl+Z typing trap) | [masking-undo.md](masking-undo.md) |
| **Painting** (the RGBA layer, the shared dab, image-native resolution, per-entry persistence, the server-side Apply) | [painting.md](painting.md) |
| **Composite** (the two front ends, the scratch cut, the inverted brush, cover-fit on BOTH ends, pasted slots) | [composite.md](composite.md) |
| **Crop** (ratio/free/exact-resolution, cropping PAST the image edge + fill colour, edge snapping, pad-then-extract) | [crop.md](crop.md) |
| **Model Library UI** (usable-vs-installed, featured, install-button gates, tile patching) | [model-library.md](model-library.md) |
| **Per-component behavioral contracts** (PromptBox, MpiToast, MpiPopup, MpiInput, …) | [component-contracts.md](component-contracts.md) |
| **Video player** (frame-accurate hybrid: `<video>` plays / mediabunny canvas owns paused-step; color matrix rule; frame-index coordinate law; sub-range loop) | [video-player.md](video-player.md) |
| Flows (Flow Library + Flow overlays; add-a-flow procedure) | [playbooks/add-flow/README.md](playbooks/add-flow/README.md) |

### ComfyUI / generation
| Topic | Doc |
|---|---|
| ComfyUI integration + engine traps | [comfy.md](comfy.md) |
| **Latent previews** (`preview:frame` bus, engine-tagged, broken-frame gate, last-latent hold — subscribe here to show latents anywhere; ALSO the TAESD decoders: which model uses which, why a missing one silently downgrades to a colour blob, and the `lighttaew*` landmine — read before adding any `vae_approx/` dep) | [preview-bus.md](preview-bus.md) |
| **Workflow authoring + injection contract** (MpiNodes pack, injector target list, generator/tier patterns) — model/flow-agnostic | [workflow-authoring/README.md](workflow-authoring/README.md) |
| Models-path / YAML / extra-folders | [models-path.md](models-path.md) |
| Download manager (resumable, NDH) | [download-manager.md](download-manager.md) |
| **Bumping the engine users run** (the two engines off one pin, the Pod-version assert, the executing smoke gate) — NOT `/mpi-bump-local-comfy`, which is bench-only | [playbooks/bump-engine/README.md](playbooks/bump-engine/README.md) |

### RunPod remote engine
| Topic | Doc |
|---|---|
| Architecture contract (topology, lifecycle, billing) | [runpod-remote-engine.md](runpod-remote-engine.md) |
| Fixed-bug traps + CPU download-mode | [runpod-troubleshooting.md](runpod-troubleshooting.md) |
| Engine-split (deps + workflow axis) | [.claude/rules/comfy_engine.md](../.claude/rules/comfy_engine.md) § Engine Split |
| **Vast.ai as a 2nd provider — research (PARKED, MPI-344)** | [vast-ai-research/README.md](vast-ai-research/README.md) |

### Builder Pod / model onboarding
| Topic | Doc |
|---|---|
| **Playbook routing** (add-model, add-flow, shared invariants) | [playbooks/README.md](playbooks/README.md) |
| **Per-model research** (Krea2, Klein, Chroma, SDXL, LTX, Wan, PiD) — authoring, tuning, measured data | [models/README.md](models/README.md) |
| Builder operational loop | [builder/README.md](builder/README.md) |
| Environments (ComfyUI portable, cu130) | [builder/01-environments.md](builder/01-environments.md) |
| Pod image / mpi-ci / version-lock / rebuild | [builder/02-image-and-rebuild.md](builder/02-image-and-rebuild.md) |
| Spin + install nodes/weights | [builder/03-spin-and-install.md](builder/03-spin-and-install.md) |
| Add models + GC ledger | [builder/04-add-models.md](builder/04-add-models.md) |
| Author + test workflows (gen system, node-naming, SaveVideo) | [builder/05-author-and-test.md](builder/05-author-and-test.md) |
| Teardown | [builder/06-teardown.md](builder/06-teardown.md) |

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
| Release flow (GitHub-only: bump digit → build → publish) | `.claude/skills/mpi-release/SKILL.md` |
| Portable artifact contract | [releases/portable-distribution-contract.md](releases/portable-distribution-contract.md) |
| GitHub release checklist + **where to rent/spin a test machine** (clean Windows w/ GPU, Linux, macOS) | [releases/github-release-checklist.md](releases/github-release-checklist.md) |
| Install-test a fresh portable (per-folder data trap, RunPod key carry-over) | [playbooks/install-test/README.md](playbooks/install-test/README.md) |
| Build evidence log + macOS fixes | [releases/build-experience-log.md](releases/build-experience-log.md) |
| Per-version release notes | `releases/YYYY-MM-DD-v<ver>.md` |

### Redesign spec
Read **only** for a new surface with a matching mockup, a follow-up phase (beyond 10.2), or a
Stage audit — routine styling uses `styles/01_base.css` tokens + `.claude/rules/components.md`
§ "Stage design baseline". Routing + read order: [redesign/README.md](redesign/README.md).

### Historical
[archive/README.md](archive/README.md) — closed tasks and superseded docs; not current knowledge.
