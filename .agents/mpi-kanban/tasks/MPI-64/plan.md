# RunPod Remote Engine

## Current State

Project mode: scalable-foundation.

The approved product direction is a Secure Cloud-only RunPod remote engine for Cubric Vision. Community Cloud is out of scope because it is unstable and limited for this use case.

Cubric currently owns generation through `generationService -> commandExecutor -> ComfyUIController.runWorkflow`, with single-dispatch Cue queue semantics, title-based workflow injection, app-owned result capture, local project persistence, and lifecycle events. A remote path must preserve those contracts rather than exposing arbitrary remote ComfyUI URLs.

The v1 architecture is a Cubric-owned hidden RunPod Pod template with a small Cubric HTTP wrapper service exposed through RunPod's HTTP proxy. The wrapper talks to ComfyUI inside the Pod, enforces token auth and compatibility checks, and presents Cubric-specific endpoints to the desktop app.

Persistent remote state should live on a RunPod network volume mounted at `/workspace`. The volume stores model/cache/custom-node/runtime manifest data and survives Pod deletion, but it is Secure Cloud-only and must be attached during Pod deployment.

Known source files likely to matter:

- `js/services/generationService.js`
- `js/services/commandExecutor.js`
- `js/services/comfyController.js`
- `routes/comfy.js`
- `routes/engine.js`
- `routes/platformEngine.js`
- `routes/shared.js`
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js`
- `js/state.js`
- `dev_configs/system_dependencies.json`
- `docs/comfy.md`
- `.claude/rules/comfy_engine.md`
- `.claude/rules/comfy_injection.md`
- `.claude/rules/state.md`
- `.claude/rules/events.md`

## Completed

- [x] Investigated RunPod Pods, templates, exposed ports, network volumes, Pod lifecycle APIs, and GPU catalog.
- [x] Investigated OneTrainer's RunPod implementation pattern.
- [x] Chose Secure Cloud-only HTTP wrapper Pod architecture.
- [x] Captured the approved direction on the MPI board.

## Remaining Work

## Phase 1: Contract and Manifest Design

- [ ] Define the remote engine contract: wrapper endpoints, auth token flow, health/readiness, workflow submit/progress/result streaming, interrupt, queue clear, model/dependency status, and lifecycle error mapping. **Verify:** a written API sketch maps each existing local `ComfyUIController` capability needed by `commandExecutor` without bypassing Cubric's Cue queue or title-based injection.
- [ ] Define the remote volume manifest schema stored under `/workspace/cubric/`: Cubric template version, image digest/tag, ComfyUI version, Python, PyTorch, CUDA, custom-node bundle, workflow bundle, installed model state, volume ID, data center, and last-compatible GPU profile. **Verify:** manifest fields cover all compatibility gates found in the RunPod investigation notes.
- [ ] Decide the Pod lifecycle policy for app launch/generation/app quit: create vs start existing Pod, stop vs delete Pod, abandoned Pod detection, and user-visible billing warnings. **Verify:** lifecycle state table covers fresh install, existing stopped Pod, running Pod, failed start, app crash/relaunch, and user quit.
- [ ] Decide local secret persistence for the user-provided RunPod API key and per-Pod wrapper token. **Verify:** design keeps secrets out of project files and does not introduce a Cubric auth backend.

## Phase 2: Remote Runtime Prototype

- [ ] Build a minimal Cubric remote-wrapper prototype that runs inside a RunPod-compatible Linux container and forwards to local ComfyUI. **Verify:** local container or dev host can answer `/health`, reject missing token, and proxy a simple ComfyUI status call.
- [ ] Create the first hidden Cubric RunPod template definition using Secure Cloud-compatible ports and startup command. **Verify:** template exposes only the wrapper HTTP port and optional diagnostic SSH/TCP port, with no public raw ComfyUI endpoint in normal operation.
- [ ] Add remote readiness checks for ComfyUI and Cubric wrapper compatibility. **Verify:** a Pod reports not-ready until both wrapper and internal ComfyUI are ready and manifest version matches the desktop app.

## Parallel Batch: App Integration Surfaces

- [ ] Add backend RunPod client and lifecycle service. Ownership: `routes/runpodRemote.js`, `routes/remoteEngine.js`, `routes/logger.js`, package dependency/config files if needed. Briefings: comfy_engine, state/events as needed. **Verify:** mocked REST calls can create/start/stop/get Pod status and never log API keys.
- [ ] Add remote engine abstraction at the Comfy execution boundary. Ownership: `js/services/comfyController.js`, `js/services/commandExecutor.js`, new `js/services/remoteEngineClient.js` if needed. Briefings: comfy_injection, events. **Verify:** local mode behavior is unchanged and remote mode can be selected through a narrow adapter without direct component-to-Comfy calls.
- [ ] Add settings/state UX for Secure Cloud RunPod configuration. Ownership: `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js`, `js/state.js`, relevant settings services/routes. Briefings: components, state, events. **Verify:** user can enter/test RunPod API key, choose Secure Cloud GPU/data center/volume strategy, and cannot select Community Cloud.
- [ ] Add compatibility and manifest validation UI/backend. Ownership: `routes/remoteEngine.js`, `routes/platformEngine.js`, settings/status components. Briefings: comfy_engine, state/events. **Verify:** incompatible GPU/template/volume profile produces a clear gated state with repair/reinitialize action, not a failed generation.

## Phase 3: Storage, Models, and Workflow Bundle Sync

- [ ] Implement remote network-volume initialization and repair flow. **Verify:** a fresh volume receives the Cubric directory layout and manifest; an existing volume is validated before Pod creation.
- [ ] Map local model registry/dependency checks to remote volume state without hardcoding installed status. **Verify:** remote model availability follows the existing `modelRegistry`/dependency source of truth and reports partial/missing state coherently.
- [ ] Define workflow/custom-node bundle versioning for the remote template. **Verify:** desktop app refuses to run against a stale remote workflow/custom-node bundle and can trigger an approved repair path.

## Phase 4: End-to-End Remote Generation

- [ ] Run image generation through the remote wrapper and preserve local project save semantics. **Verify:** generated image is saved to the active project with prompt/model/seed/settings metadata exactly like local mode.
- [ ] Run video generation, including multi-stage preview/final where applicable, through the remote wrapper. **Verify:** video outputs, preview latents/assets, progress, cancel/interrupt, and project sidecars behave consistently with local mode.
- [ ] Verify lifecycle cleanup on app quit. **Verify:** the app stops or deletes the active Pod according to policy and warns clearly about remaining network-volume/storage costs.

## Phase 5: Hardening and Release Readiness

- [ ] Add integration tests/mocked tests for RunPod lifecycle and remote wrapper error states. **Verify:** tests cover bad API key, unavailable GPU, stale manifest, stopped Pod, wrapper not ready, interrupt, and app quit cleanup.
- [ ] Add user-facing documentation or settings copy for Secure Cloud remote engine costs and responsibilities. **Verify:** user sees that RunPod billing/API key/storage are theirs and that Community Cloud is unsupported.
- [ ] Preserve final architecture decisions in project memory or docs after validation. **Verify:** `mpi-end-session` can close the card with durable notes and no design knowledge stranded only in handoff files.

## Plan Drift

- None yet.

## Verification

Final verification requires a real Secure Cloud RunPod account test with a Cubric-owned template and network volume:

- Create or select a network volume in a Secure Cloud data center.
- Create/start a Pod from the Cubric template using the user's RunPod API key.
- Confirm wrapper token auth, readiness, and manifest compatibility.
- Run at least one image workflow and one video workflow from Cubric through the remote engine.
- Confirm outputs save into the local project with existing metadata/sidecar behavior.
- Stop/delete the Pod through the app and confirm no active GPU billing remains except intentional persistent storage.

## Preservation Notes

- Do not implement support for arbitrary remote ComfyUI URLs in v1.
- Do not expose raw ComfyUI publicly as the normal user path.
- Do not support RunPod Community Cloud for this feature.
- Keep the user's RunPod API key out of project JSON and logs.
- If the RunPod API or template docs change during implementation, re-check primary RunPod docs before coding lifecycle calls.
- OneTrainer is a reference for lifecycle/SSH edge cases, not a direct architecture match for Cubric generation.
