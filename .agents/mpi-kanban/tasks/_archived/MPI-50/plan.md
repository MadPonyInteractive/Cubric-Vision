# Superseded Draft: Explore Triton + SageAttention accelerator builds

> Status: superseded on 2026-06-10. This was a premature implementation plan.
> MPI-50 is back in brainstorm/idea state until the design question is resolved:
> whether Triton/SageAttention speed gains outweigh install, support, workflow,
> and cross-platform compatibility risks.

## Current State

Project mode: scalable-foundation.

Cubric Vision currently keeps accelerator risk out of the base engine. `routes/engine.js` explicitly notes that Triton/SageAttention are not installed during Linux/macOS uv bootstrap, and `.claude/rules/comfy_engine.md` records MPI-50 as the place to resolve this. The base engine path is split by platform: Windows extracts ComfyUI portable archives; Linux/macOS bootstrap with `uv`, `comfy-cli`, and a Python 3.12 venv. Comfy launch arguments are centralized in `routes/comfy.js`.

Upstream status changed since the original brief. `woct0rdho/triton-windows` is archived, but its README points to the maintained `triton-lang/triton-windows` repo. The maintained Windows Triton repo claims Windows 10/11 NVIDIA support, bundled CUDA toolchain/TinyCC for recent wheels, PyTorch/Triton minor-version coupling, and embedded-Python ComfyUI notes. `woct0rdho/SageAttention` now publishes Windows wheels and says recent wheels use ABI3, require manual wheel selection by PyTorch version, and still require `triton-windows`. Upstream `thu-ml/SageAttention` remains CUDA/NVIDIA-oriented, with base requirements `python>=3.9`, `torch>=2.3.0`, `triton>=3.0.0`, and CUDA floors that vary by GPU generation.

Current recommendation before implementation: do not add Triton/SageAttention to the default install. Investigate and prototype as an explicit optional accelerator lane for eligible NVIDIA GPUs only. Mac/Apple Silicon should likely remain on ComfyUI's MPS/pytorch attention path unless research proves a different maintained local accelerator exists. WaveSpeedAI is not the same kind of local accelerator: the ComfyUI plugin is an API-backed cloud model bridge requiring a WaveSpeed API key, so it competes with local-first product positioning rather than with Triton/SageAttention directly.

Key sources checked on 2026-06-10:

- https://github.com/triton-lang/triton-windows
- https://github.com/woct0rdho/SageAttention
- https://github.com/thu-ml/SageAttention
- https://raw.githubusercontent.com/Comfy-Org/ComfyUI/master/comfy/cli_args.py
- https://github.com/WaveSpeedAI/wavespeed-comfyui

## Completed

- [ ] Nothing yet.

## Remaining Work

## Phase 1: Decision Matrix And Compatibility Research

- [ ] Build a written accelerator matrix for Windows, Linux, and macOS covering GPU vendor/architecture, Python, PyTorch, CUDA/toolchain, wheel availability, install source, and ComfyUI launch flags. Preserve it under `research/`. **Verify:** the matrix names a supported, unsupported, and unknown path for each OS and explicitly states whether SageAttention is local, cloud, NVIDIA-only, or MPS-compatible.

- [ ] Audit ComfyUI's current attention options for the engine version in `dev_configs/system_dependencies.json`, including `--use-sage-attention`, `--enable-triton-backend`, `--use-pytorch-cross-attention`, and any model-specific overflow warnings for Wan/Qwen/Flux workflows. **Verify:** the plan records which flags are global launch flags, which require custom nodes/workflow changes, and which can be toggled per run.

- [ ] Define go/no-go gates before coding: install success rate, no base-install regression, no unsupported-GPU breakage, clean fallback, benchmark uplift, and image/video correctness thresholds. **Verify:** a short decision checklist exists in `research/decision-gates.md` and can be answered from prototype logs.

## Parallel Batch: Read-Only Prototype Design

- [ ] Design the Windows NVIDIA prototype lane. Ownership: `routes/platformEngine.js`, `routes/engine.js`, `routes/comfy.js`, task research only. Briefings: Critical Rules Snapshot, comfy_engine. **Verify:** the design names exact eligibility checks, PyTorch-to-`triton-windows` pinning, SageAttention wheel selection, embedded-Python install command shape, and rollback behavior without editing implementation files.

- [ ] Design the Linux NVIDIA prototype lane. Ownership: `routes/engine.js`, `routes/platformEngine.js`, task research only. Briefings: Critical Rules Snapshot, comfy_engine. **Verify:** the design names whether official `triton` or source builds are used, how uv/comfy-cli torch versions are detected, whether nvcc is required, and how install logs are surfaced.

- [ ] Design the macOS position. Ownership: `routes/comfy.js`, `routes/platformEngine.js`, task research only. Briefings: Critical Rules Snapshot, comfy_engine. **Verify:** the design either identifies a real maintained MPS-compatible accelerator path or records macOS as explicitly unsupported for SageAttention/Triton with current MPS launch behavior preserved.

- [ ] Design the WaveSpeed option separately from local accelerators. Ownership: product/engine research only. Briefings: Critical Rules Snapshot, comfy_engine. **Verify:** the design states whether WaveSpeed belongs in MPI-50, a separate optional cloud-provider task, or should be rejected for Vision's local-first engine.

## Phase 2: Spike Branch Implementation

- [ ] Implement an opt-in accelerator installer behind a disabled/default-off flag, with no base engine behavior changes. The installer must detect GPU/vendor/architecture, current torch version, Python ABI, and platform before attempting any pip operation. **Verify:** a fresh base install still follows the existing engine path and does not install Triton/SageAttention.

- [ ] Add launch-argument selection that only adds `--use-sage-attention` when the accelerator lane is installed, eligible, and user-enabled. **Verify:** unsupported systems launch with the existing args and log a clear "accelerator unavailable" reason rather than failing.

- [ ] Add repair/uninstall or at minimum a documented rollback path for accelerator packages. **Verify:** a failed accelerator install leaves ComfyUI startable and does not require deleting the full engine folder.

## Parallel Batch: Workflow And Node Prototypes

- [ ] Prototype SageAttention-aware image workflow variants. Ownership: `comfy_workflows/` prototype copies, `js/data/modelConstants/` mappings only if promoted. Briefings: Critical Rules Snapshot, comfy_injection, comfy_engine. **Verify:** workflow JSON validates in ComfyUI and keeps title-based injection contracts intact.

- [ ] Prototype SageAttention-aware video workflow variants, prioritizing WAN only if overflow workarounds are understood. Ownership: `comfy_workflows/` prototype copies, workflow injector notes only if needed. Briefings: Critical Rules Snapshot, comfy_injection, comfy_engine. **Verify:** at least one short video generation completes without black/noise output and captures the expected Output node.

## Phase 3: Cross-Platform Validation

- [ ] Validate Windows NVIDIA on at least one Ampere/Ada/Blackwell system and one unsupported/legacy path. **Verify:** install, launch, generation, benchmark, fallback, and rollback results are recorded in `validation.md`.

- [ ] Validate Linux NVIDIA on a clean machine or disposable VM/container with the Cubric uv-bootstrap path. **Verify:** the install works from Cubric's venv, not from a manually prepared system Python, and logs exact package versions.

- [ ] Validate macOS Apple Silicon remains stable with no SageAttention install attempt unless Phase 1 found a real supported route. **Verify:** MPS generation still starts with existing `--use-pytorch-cross-attention` launch args and no accelerator prompt is shown.

## Phase 4: Product Decision

- [ ] Decide one of: ship optional local SageAttention accelerator lane, keep as experimental/dev-only, split to a separate task, or reject for now. **Verify:** decision is supported by compatibility matrix, benchmark numbers, failure-mode notes, and workflow correctness results.

- [ ] If shipping, document user-facing eligibility, risk, rollback, and workflow-node behavior. **Verify:** docs identify that this is optional, NVIDIA-gated, and not required for normal generation.

## Plan Drift

- None yet.

## Verification

Final verification requires a written compatibility matrix, preserved prototype notes, and at least one clean base-install verification showing Triton/SageAttention remain absent unless explicitly enabled. If implementation proceeds, final validation must include Windows, Linux, and macOS outcomes with exact dates, GPU models, torch/Triton/SageAttention versions, ComfyUI version, install logs, and generation correctness results.

## Preservation Notes

- Do not mutate `.claude/rules/` unless the user explicitly asks for docs updates.
- Preserve all accelerator research under `.agents/mpi-kanban/tasks/MPI-50/research/`.
- Keep base engine install safe by default; accelerator install must be opt-in and recoverable.
- Any actual workflow changes must follow `.claude/rules/comfy_injection.md`: target nodes by `_meta.title`, not numeric IDs.
- If code changes alter engine provisioning or Comfy launch arguments, ask whether `.claude/rules/comfy_engine.md` should be updated at session end.
