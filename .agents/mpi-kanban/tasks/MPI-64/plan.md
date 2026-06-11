# RunPod Remote Engine

## Current State

Project mode: scalable-foundation.

The approved product direction is a Secure Cloud-only RunPod remote engine for Cubric Vision. Community Cloud is out of scope because it is unstable and limited for this use case.

Cubric currently owns generation through `generationService -> commandExecutor -> ComfyUIController.runWorkflow`, with single-dispatch Cue queue semantics, title-based workflow injection, app-owned result capture, local project persistence, and lifecycle events. A remote path must preserve those contracts rather than exposing arbitrary remote ComfyUI URLs.

The v1 architecture is a Cubric-owned hidden RunPod Pod template with a small Cubric HTTP wrapper service exposed through RunPod's HTTP proxy. The wrapper talks to ComfyUI inside the Pod, enforces token auth and compatibility checks, and presents Cubric-specific endpoints to the desktop app.

Persistent remote state should live on a RunPod network volume mounted at `/workspace`. The volume stores model/cache/custom-node/runtime manifest data and survives Pod deletion, but it is Secure Cloud-only and must be attached during Pod deployment.

### Local-coupling inventory (verified against source 2026-06-11)

These are the exact seams a remote engine must cross. Every Phase 1 design decision must account for all of them.

1. **Renderer talks to ComfyUI directly, not through Express.** `js/services/comfyController.js:40` hardcodes `serverAddress = "127.0.0.1:8188"`. Workflow submit is a renderer `fetch` to `http://127.0.0.1:8188/prompt` (`comfyController.js:501`); events arrive over a renderer-opened `new WebSocket('ws://127.0.0.1:8188/ws?clientId=...')` (`comfyController.js:291`). Express (`routes/comfy.js`) only manages the local subprocess (`/comfy/start|stop|status|unload`). The Settings field `mpi_comfy_url` exists in localStorage but is **not read** by the controller — it is dead config today.
2. **Latent previews are binary WebSocket frames.** 8-byte header + JPEG → blob URL → `onPreview` (`comfyController.js:270–297`, `commandExecutor.js:805`). TAESD is enabled via the `--preview-method taesd` launch arg (`routes/comfy.js:245`). Any remote transport must carry binary frames or re-encode them.
3. **Handled WS JSON event types:** synthetic `prompt_ack`, `preview`, `execution_cached`, `executing` (node and node=null completion), `executed`, `progress`, `progress_state` (`commandExecutor.js:779–881`). This list is the wrapper's minimum event contract.
4. **Model-init readiness comes from process stdout, not the ComfyUI API.** Express watches the local ComfyUI process stdout for `"Model Initializing"` / `"Model Initialization complete!"` and rebroadcasts as SSE on `GET /comfy/events/stream` (`routes/comfy.js:66–77, 115`); `commandExecutor.js:768` subscribes for terminal-phase sampler workflows. A remote Pod has no stdout visible to the app — the wrapper must synthesize an equivalent signal.
5. **Images/masks upload; videos/audio/latents do NOT.** Images and masks go through ComfyUI `POST /upload/image` with static cache-friendly filenames `mpi_<param>.png` (`comfyController.js:539–566, 377–415`). Videos/audio are injected as **absolute local filesystem paths** (`_resolveMediaPath`, `comfyController.js:574–596`) read by VHS nodes from disk. Trimmed video inputs are written as local temp files by `POST /api/video/trim-input` (`commandExecutor.js:117–172`). Multi-stage preview latents are copied into the local ComfyUI `input/` dir by `POST /comfy/stage-preview-latent` (`routes/comfy.js:170–195`). All path-injection flows break on a remote Pod and need wrapper upload/staging endpoints.
6. **Output capture streams from ComfyUI's `/view` endpoint.** `executed` messages → view URLs built against the hardcoded address (`commandExecutor.js:33–49`) → `POST /project/save-generation` → backend `streamDownload` from that URL into `<project>/Media/` + `.meta/` sidecars + ffmpeg thumbnails (`routes/projects.js:1324–1500`). Remote mode means the backend must stream from the wrapper with auth, and view URLs must not leak unauthenticated.
7. **Interrupt/queue ops are renderer-direct too:** `POST /interrupt`, `POST /queue {clear:true}`, `POST /queue {delete:[id]}` (`comfyController.js:150–221`).
8. **Boot gating assumes a local engine.** `shell.js:_bootApp` (≈140–224) blocks on `/engine/version-check` → install modal → `engine:ready` → `/engine/deps-status` → `comfy:ready` → model registry sync. Remote mode needs a parallel gate path that skips local install checks.
9. **Model/dependency status is local-filesystem-only.** `POST /comfy/models/check` resolves paths from `extra_model_paths.yaml` and calls `isCompleteOnDisk` (`routes/comfy.js:409–466`). Remote mode needs a wrapper-side equivalent against the volume.
10. **No secret-storage pattern exists in the app.** No keytar/safeStorage/electron-store anywhere; localStorage keys are enumerated in `js/core/storageKeys.js` and none are secret-bearing. The RunPod API key + wrapper token design starts from zero.

Known source files likely to matter:

- `js/services/generationService.js`
- `js/services/commandExecutor.js`
- `js/services/comfyController.js`
- `js/shell/shell.js`
- `routes/comfy.js`
- `routes/engine.js`
- `routes/platformEngine.js`
- `routes/projects.js` (save-generation streaming)
- `routes/shared.js`
- `routes/downloadManager.js` (SSE event shape for download progress)
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js`
- `js/state.js`
- `js/core/storageKeys.js`
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
- [x] Mapped the exact local↔ComfyUI coupling inventory (transport, previews, input assets, outputs, boot gate, model checks, secrets) — see Current State.

## Remaining Work

## Phase 1: Contract and Manifest Design

> Phase 1 output is design documents, not code. Each decision to-do must produce a markdown file under `research/` in this task workspace (filenames given per item) so later phases and parallel workers can be briefed from it verbatim.

- [ ] Decide the transport topology: does the desktop app reach the wrapper renderer-direct, or via an Express backend proxy that mirrors the local route shapes? Recommended default: **backend proxy** — Express forwards to the RunPod proxy URL with the wrapper token attached server-side, so (a) the token never lives in the renderer, (b) `save-generation` streaming keeps working against localhost URLs, (c) `comfyController.js` changes shrink to a base-URL/adapter swap instead of CORS + WSS + auth-header work in the renderer. Document the chosen topology, including how the WebSocket channel is bridged (Express WS proxy vs renderer WSS direct as the one exception). **Output:** `research/transport-topology.md`. **Verify:** the doc traces every item in the local-coupling inventory (1–7) through the chosen topology with no unauthenticated remote endpoint and no token in renderer-accessible storage.
- [ ] Define the remote engine contract: wrapper endpoints, auth token flow, health/readiness (including a synthesized model-init signal replacing the stdout watcher — inventory item 4), workflow submit, the WS/streamed event channel carrying all event types from inventory item 3 **including binary preview frames**, output fetch (auth'd `/view` equivalent), interrupt, queue clear/delete, upload/staging endpoints for images, masks, video, audio, and `.latent` files (inventory item 5), model/dependency status, and lifecycle error mapping. **Output:** `research/wrapper-api-contract.md`. **Verify:** a written API sketch maps each existing local `ComfyUIController` + `commandExecutor` capability 1:1 without bypassing Cubric's Cue queue or title-based injection; every endpoint states its auth requirement.
- [ ] Decide template ownership and image distribution. Constraint to resolve first: a user's RunPod API key can only deploy templates visible to that account — confirm against current RunPod docs whether a Cubric-account private/"hidden" template is deployable by other users' keys, or whether the app must programmatically create the template in the **user's own account** via `POST /templates` (referencing a Cubric-published Docker image), or use a public community template. Also decide where the Docker image is hosted (GHCR/Docker Hub; public pull required by RunPod) and how it is built/published (candidate: private `mpi-ci` repo workflow, consistent with the existing CI split). **Output:** `research/template-distribution.md`. **Verify:** doc names the template creation path that works with only a user API key, the image registry, the image tagging scheme tied to the manifest version, and the publish pipeline.
- [ ] Define the remote volume manifest schema stored under `/workspace/cubric/`: Cubric template version, image digest/tag, ComfyUI version, Python, PyTorch, CUDA, custom-node bundle, workflow bundle, installed model state, volume ID, data center, and last-compatible GPU profile. **Output:** `research/volume-manifest-schema.md`. **Verify:** manifest fields cover all compatibility gates found in the RunPod investigation notes and every field has a defined comparison rule (exact match / minimum / informational).
- [ ] Decide the Pod lifecycle policy for app launch/generation/app quit: create vs start existing Pod, stop vs delete Pod, abandoned Pod detection, and user-visible billing warnings. Must include a crash-safety net: Electron quit handlers cannot reliably await network calls, so design a Pod-side idle watchdog (wrapper self-stops the Pod after N minutes without authenticated traffic) as the backstop for app crash/kill. **Output:** `research/pod-lifecycle-policy.md`. **Verify:** lifecycle state table covers fresh install, existing stopped Pod, running Pod, failed start, app crash/relaunch, network loss mid-generation, and user quit — each row names who stops billing.
- [ ] Decide local secret persistence for the user-provided RunPod API key and per-Pod wrapper token. Starting facts: the app has **no** existing secret store (inventory item 10); candidates are Electron `safeStorage` (preferred, OS-keychain-backed) with a documented fallback, vs an encrypted file under the app's user-data dir. Plaintext localStorage is not acceptable for the API key. **Output:** `research/secret-storage.md`. **Verify:** design keeps secrets out of project files, localStorage, logs, and bug reports, and does not introduce a Cubric auth backend.

## Phase 2: Remote Runtime Prototype

- [ ] Build a minimal Cubric remote-wrapper prototype that runs inside a RunPod-compatible Linux container and forwards to local ComfyUI. Must demonstrate the hard parts of the contract, not just REST proxying: token-gated WS event channel relaying binary preview frames intact, an upload endpoint that lands a file where a ComfyUI loader node can read it, and a synthesized model-init/readiness signal (no stdout dependency). **Verify:** local container or dev host answers `/health`, rejects a missing/wrong token on both HTTP and WS upgrade, relays a `progress` event and one binary preview frame end-to-end, and accepts an image upload that a workflow can consume.
- [ ] Create the first Cubric RunPod template definition (per the Phase 1 template-distribution decision) using Secure Cloud-compatible ports and startup command. **Verify:** template exposes only the wrapper HTTP port and optional diagnostic SSH/TCP port, with no public raw ComfyUI endpoint in normal operation; a Pod deployed from a plain user API key reaches ready state.
- [ ] Add remote readiness checks for ComfyUI and Cubric wrapper compatibility. **Verify:** a Pod reports not-ready until both wrapper and internal ComfyUI are ready and manifest version matches the desktop app; readiness polling tolerates RunPod's known stale-runtime-payload window after start/resume (OneTrainer finding).

## Parallel Batch: App Integration Surfaces

> Brief each worker with the Critical Rules Snapshot, the listed rule briefings, the local-coupling inventory from Current State, and the relevant Phase 1 `research/*.md` decision docs. Do not dispatch this batch until Phase 1 docs exist — every item below consumes at least one of them.

- [ ] Add backend RunPod client, lifecycle service, and secret storage. Ownership: `routes/runpodRemote.js` (new), `routes/remoteEngine.js` (new), secret-storage module per `research/secret-storage.md`, `routes/logger.js` touchpoints, package dependency/config files if needed. Briefings: comfy_engine, state/events as needed. Consumes: `pod-lifecycle-policy.md`, `secret-storage.md`, `template-distribution.md`. **Verify:** mocked REST calls can create/start/stop/get Pod status; API key round-trips through the secret store; no code path logs the API key or wrapper token (grep test on logger calls).
- [ ] Add remote engine abstraction at the Comfy execution boundary. Ownership: `js/services/comfyController.js`, `js/services/commandExecutor.js`, new `js/services/remoteEngineClient.js` if needed, plus the Express proxy routes if the backend-proxy topology was chosen. Key facts: the boundary today is renderer-direct with `serverAddress` hardcoded (`comfyController.js:40`) and view URLs built in `commandExecutor.js:33–49`; the unused `mpi_comfy_url` localStorage key should be retired or repurposed deliberately, not left half-wired. Briefings: comfy_injection, events. Consumes: `transport-topology.md`, `wrapper-api-contract.md`. **Verify:** local mode behavior is byte-identical (same URLs, same event flow); remote mode is selected through a narrow adapter; no component talks to Comfy directly.
- [ ] Add settings/state UX for Secure Cloud RunPod configuration plus the remote-mode boot gate. Ownership: `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js`, `js/state.js`, `js/shell/shell.js` (`_bootApp` gate path — inventory item 8), relevant settings services/routes. Briefings: components, state, events. Consumes: `pod-lifecycle-policy.md`, `secret-storage.md`. **Verify:** user can enter/test a RunPod API key, choose Secure Cloud GPU/data center/volume strategy, cannot select Community Cloud; in remote mode the app boots past the local-engine install gate without requiring a local engine.
- [ ] Add compatibility and manifest validation UI/backend. Ownership: `routes/remoteEngine.js`, `routes/platformEngine.js`, settings/status components. Briefings: comfy_engine, state/events. Consumes: `volume-manifest-schema.md`. **Verify:** incompatible GPU/template/volume profile produces a clear gated state with repair/reinitialize action, not a failed generation.

## Phase 3: Storage, Models, and Workflow Bundle Sync

- [ ] Implement remote network-volume initialization and repair flow. **Verify:** a fresh volume receives the Cubric directory layout and manifest; an existing volume is validated before Pod creation; an incompatible volume routes to the repair/reinitialize decision from the manifest design.
- [ ] Implement remote model download/install onto the volume, executed Pod-side by the wrapper (datacenter bandwidth, not the user's connection), with progress streamed to the app in the existing download-event shape (`routes/downloadManager.js` SSE conventions) so current download UI components can render it. **Verify:** a model absent from the volume can be installed from the app's model UI in remote mode, with live progress, cancel, and a completed-state check that survives Pod stop/start.
- [ ] Map local model registry/dependency checks to remote volume state without hardcoding installed status. Remote mode must route `models/check`-style queries to the wrapper's volume inspection instead of local `isCompleteOnDisk` (inventory item 9). **Verify:** remote model availability follows the existing `modelRegistry`/dependency source of truth and reports partial/missing state coherently in both modes.
- [ ] Define workflow/custom-node bundle versioning for the remote template. **Verify:** desktop app refuses to run against a stale remote workflow/custom-node bundle and can trigger an approved repair path.

## Phase 4: End-to-End Remote Generation

- [ ] Implement remote input-asset transfer for all non-image inputs: video/audio upload replacing local path injection (`_resolveMediaPath`), the trimmed-video flow (trim locally via existing `/api/video/trim-input`, then upload the trimmed file), and remote `.latent` staging replacing `/comfy/stage-preview-latent` (inventory item 5). **Verify:** an I2V workflow with a trimmed local video input and a two-stage preview-latent workflow both run remotely with correct inputs; re-running with unchanged inputs preserves ComfyUI execution-cache behavior where the static-filename convention allows.
- [ ] Run image generation through the remote wrapper and preserve local project save semantics. **Verify:** generated image is saved to the active project with prompt/model/seed/settings metadata exactly like local mode; `save-generation` streams the output through an authenticated path (inventory item 6).
- [ ] Run video generation, including multi-stage preview/final where applicable, through the remote wrapper. **Verify:** video outputs, preview latents/assets, latent preview frames in the queue panel, progress, cancel/interrupt, and project sidecars + ffmpeg thumbnails behave consistently with local mode.
- [ ] Verify lifecycle cleanup on app quit and crash. **Verify:** the app stops or deletes the active Pod according to policy on clean quit; on a simulated crash (kill the app process), the Pod-side idle watchdog stops the Pod within its window; user warnings about remaining network-volume/storage costs are shown.

## Phase 5: Hardening and Release Readiness

- [ ] Add integration tests/mocked tests for RunPod lifecycle and remote wrapper error states. **Verify:** tests cover bad API key, unavailable GPU, stale manifest, stopped Pod, wrapper not ready, mid-generation network loss, interrupt, and app quit cleanup.
- [ ] Audit secret hygiene end-to-end: logger output, `logs/app.log`, bug-reporter payloads, and any persisted state must never contain the RunPod API key or wrapper token; add redaction where a code path could carry them. **Verify:** a grep/runtime sweep over logs and bug-report payloads after a full remote session finds zero secret material.
- [ ] Add user-facing documentation or settings copy for Secure Cloud remote engine costs and responsibilities. **Verify:** user sees that RunPod billing/API key/storage are theirs, that stopped Pods may still bill storage, and that Community Cloud is unsupported.
- [ ] Preserve final architecture decisions in project memory or docs after validation. **Verify:** `mpi-end-session` can close the card with durable notes and no design knowledge stranded only in handoff files.

## Plan Drift

- 2026-06-11: Pre-execution plan revision. Added verified local-coupling inventory; added Phase 1 decisions for transport topology, template ownership/image distribution; expanded wrapper contract to cover binary preview frames, synthesized model-init signal, and upload/staging endpoints; added remote model download to Phase 3; added input-asset transfer and crash-watchdog items to Phase 4; added secret-hygiene audit to Phase 5. No scope change to the approved direction.

## Verification

Final verification requires a real Secure Cloud RunPod account test with a Cubric-owned template and network volume:

- Create or select a network volume in a Secure Cloud data center.
- Create/start a Pod from the Cubric template using the user's RunPod API key.
- Confirm wrapper token auth, readiness, and manifest compatibility.
- Install at least one model onto the volume from the app and confirm it persists across Pod stop/start.
- Run at least one image workflow and one video workflow (including an I2V or multi-stage case with uploaded inputs) from Cubric through the remote engine.
- Confirm outputs save into the local project with existing metadata/sidecar behavior.
- Stop/delete the Pod through the app and confirm no active GPU billing remains except intentional persistent storage.
- Kill the app while a Pod is running and confirm the idle watchdog stops it.

## Preservation Notes

- Do not implement support for arbitrary remote ComfyUI URLs in v1.
- Do not expose raw ComfyUI publicly as the normal user path.
- Do not support RunPod Community Cloud for this feature.
- Keep the user's RunPod API key and wrapper token out of project JSON, localStorage, logs, and bug reports.
- The wrapper token must gate the WebSocket upgrade, not just HTTP routes.
- If the RunPod API or template docs change during implementation, re-check primary RunPod docs before coding lifecycle calls — especially whether private templates are deployable cross-account (this gates the whole distribution design).
- OneTrainer is a reference for lifecycle/SSH edge cases (notably stale runtime payloads after resume), not a direct architecture match for Cubric generation.
- Phase 1 `research/*.md` decision docs are the briefing source for the Parallel Batch; do not dispatch workers before they exist.
