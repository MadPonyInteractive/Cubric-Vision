# Cubric Vision — Engineering Gotchas & Hard-Won Lessons

Non-obvious facts, gotchas, and hard-won lessons accumulated during development. Grouped by domain. Each entry = the fact + why it matters. Verify a named file/function/flag still exists before relying on it.

---

## RunPod / remote engine

### autoretry GPU wait — architecture

MPI-110 (live-verified 2026-06-17): opt-in "Auto-retry connection" picks an out-of-stock GPU and waits in the background. The wait LOOP lives in the SHELL (`js/shell.js`: `_startGpuWait`/`_stopGpuWait`/`_initGpuWaitBridge`/`_isGpuInStockBoot`), NOT in MpiSettings — so it survives navigation. `state.remoteWaitGpu` (transient, NOT persisted) mirrors the GPU being waited for. Settings emits `remote:wait-start {gpuType,datacenter}` on connect and `remote:wait-cancel` on cancel; the shell calls `_initRemoteBoot(cfg)` once the GPU frees. CRITICAL: during the wait never emit `phase:'connecting'` — that gate blocks local generation. Wait = pure frontend availability poll (15s), `phase:null`, mode stays `active:false`, NO Pod created. `autoRetry` must be in the `normalizeRunpodConfig` whitelist or it strips on persist.

### autoretry live-test bugs (all fixed)

`_bootWaitContinues` bailed on stale `wasConnected && podId` storage flags from a prior session → gave up on tick 1; bail ONLY on real intent change (flags off / GPU switched). Win path % stuck at 0 because the won-wait must route through `_pollRemoteReady` (drives the elapsed % climb). Clear `remoteWaitGpu` the moment the GPU frees (before the connect, not in finally). GPU-switch mid-wait: `remote:wait-start` self-cancels a prior wait.

### remote engine architecture doc

Durable architecture reference = `docs/runpod-remote-engine.md` (promoted from `.agents/mpi-kanban/tasks/MPI-64/current-architecture.md` when MPI-64 closed). Covers backend-proxy topology, Pod lifecycle, volume/DC rules, per-card image select (`podImageForCard`, cu124 default / cu128 Blackwell), universal-bake vs per-model-volume custom-node split, lazy-download weights as the remote-503 trap, secrets, billing. Read before any remote-engine work.

### RunPod branch = v1.1.0 trunk

As of 2026-06-14, `RunPod` is the active shared integration branch (v1.1.0). No one works on `master` (dormant, 1.0.0 line). Branch from `RunPod`, commit to `RunPod`, PR against `RunPod`. Because the branch is shared by concurrent agents, STAGE BY EXPLICIT PATH (never `git add -A`). `master` receives only minor patches for 1.0.x issues, which are then merged back into `RunPod`.

**RunPod must NOT merge INTO master until master's first PUBLIC release (~2026-07-09).** RunPod carries unreleased work (LTX, remote engine); the LTX feature drop ships to **Patreon/Pro ONLY off the RunPod branch** (Cloudflare/R2 link, no git tag, no GitHub publish). ONLY AFTER the first public master release does RunPod merge into master. So for any RunPod-branch work (LTX, Pod rebuilds e.g. MPI-131): stay on RunPod, no promote-to-master, no master merge, no public GitHub release. Don't auto-bump the app version for a small Pod-parity fix — ask the user whether it folds into the existing RunPod LTX drop. The first public master release (R2 dep links + master 1.0.x bump) is **MPI-129's** gate; dep weight re-host (HF→R2) is also **MPI-129**, not MPI-127/131.

### RunPod volume persistent — Reset does NOT wipe it

RunPod network volume (`/workspace/mpi_models/`, `/workspace/comfyui/...`) is PERSISTENT. Console "Reset" resets the container/ephemeral disk only — Uptime keeps climbing, Volume usage stays full, models survive. Confirmed live 2026-06-17. The only ways to clear the volume are manual file delete (wrapper/SSH `rm`) or destroying the network volume itself.

### RunPod REST Pod shape — no uptimeInSeconds

The app uses RunPod's REST API (`rest.runpod.io/v1`), NOT GraphQL. `GET /pods/{id}` has NO `runtime` object — `p.runtime?.uptimeInSeconds` is ALWAYS null. Fields that DO exist: `lastStartedAt` (UTC ISO — compute uptime as `now − lastStartedAt`), `costPerHr`/`adjustedCostPerHr`, `desiredStatus`. The remote connection feed (`remote:connection`) fires ONLY on the connected EDGE; any live-climbing value (uptime/cost) needs the specs fetch re-emitted on EVERY connected tick (5s `HEALTHY_MS`), else it paints once and freezes (MPI-80).

### RunPod download mode — CPU Pod constraints

MPI-88: CPU-only Pod to install models with no GPU bill. Trigger = `gpuType='__cpu__'`. A CPU Pod CANNOT run the GPU image (cu124/cu128) — container starts with 0 processes and hangs. The slim wrapper-only `-cpu` image (`mpi-ci Dockerfile.cpu` + `start-cpu.sh`) is MANDATORY. CPU Pods reject `containerDiskInGb > 20`. Three "connected" gates must branch on `noGpu`: (1) hero feed ORs `noGpu` into the comfy_ready check; (2) Settings connect; (3) boot reconnect. All three SKIP `ensureWsConnected()` when `gpuType==='__cpu__'`. Generation blocked by `_ensureRemoteReady` (`code:'pod_no_gpu'` toast).

### image/wrapper pin needs app restart

`POD_IMAGE_VERSION` / `WRAPPER_VERSION` in `routes/remoteProxy.js` are loaded into the running Express child at boot. Editing on disk does NOT change what a live app sends — `podImageForCard()` keeps returning the OLD tag until the app is fully restarted. During MPI-90 live testing this cost ~20 min (a fresh Pod booted old v0.4.7 because the running app still sent v0.4.7 despite the on-disk edit). Verify via the app log line `Pod image for <card>: ...:v<X>-cu124` and wrapper `/health` `wrapper_version`.

### OOM container self-heal — 503 is not a crash

A RunPod container OOM (exit 137) kills ComfyUI process, then `start.sh` supervisor restarts ComfyUI in-place. Pod stays alive (Uptime never resets). App loses only the preview WS and re-arms on next gen. A gen submitted during the ~few-second re-init window gets a 503 — classify as `comfy_not_ready` → soft toast, NOT the bug-reporter modal. Pod-DEATH is a separate, harder-to-force mode. Detail in `docs/runpod-remote-engine.md` §9.

### video gen RAM wall — RESOLVED (do not re-raise)

RESOLVED 2026-06-17. The Wan video-gen OOM was a model-SWITCH RAM leak: switching video models without clearing the previous model's RAM → OOM on next load. Fix shipped: RAM cleared before loading a new model on switch. An L4 runs video gen (incl. multi-stage I2V with preview) without OOM. **Stop telling users video needs 64GB+ RAM or that L4 OOMs on minimal settings — that guidance is obsolete.**

### watchdog is a crash backstop, not an idle timer

The Pod-side idle watchdog (`wrapper.py Watchdog`, self-stops after `IDLE_TIMEOUT_S`) resets on ANY authenticated traffic. The app's `MpiMemoryMonitor` polls authed `/wrapper/stats` every 2s — so the deadline NEVER expires while the app is alive. It fires only when the app dies (crash / close / PC off). MPI-103 live-verified: Pod stayed up 57min idle-with-app. **Never add "stop Pod after N min idle while connected" — it's architecturally impossible without making the stats poll stop touching the watchdog.** Watchdog is a fixed 10-min crash backstop (`CUBRIC_IDLE_TIMEOUT_S` default 600, not user-configurable).

### empty-media dispatch guard

MPI-109: pressing Cue/Q with an empty PromptBox on a media op dispatched a generation with no media injected. The workflow JSON ships baked-in default filenames on LoadImage/LoadVideo nodes (authoring residue) that exist locally but not on a clean Pod → `prompt_outputs_failed_validation` / 503 → bug-report dialog. Guard lives at the TOP of `startGeneration` (`generationService.js`) — single chokepoint covering Q hotkey / Cue button / loop re-fire. Required-slot unsatisfied → `ui:warning` toast + `return null`.

### remote route branch audit

In RunPod remote mode (`routes/remoteModels.isRemoteActive()`), model files live on the Pod VOLUME, not local disk. Any backend route that reads/writes/deletes local model files must have an `isRemoteActive()` branch. Grep `routes/` for local-fs ops (`fs.`, `_trash`, `managedModelsRoot`, `getDefaultModelsRoot`, `resolveComfyPath`) and confirm each has an `isRemoteActive()` short-circuit. Uninstall did NOT branch in remote mode (found 2026-06-13) and trashed local files while leaving the Pod volume untouched.

### remote restart poll — wrong flag (MPI-107)

MPI-107 (fixed 2026-06-17, app-side only). The remote per-model node-install restart poll in `js/services/comfyController.js` gated on `s.ready` (WRAPPER health) instead of `s.comfyReady` (`comfy_ready` = ComfyUI subprocess serving). A `/proxy/restart-comfy` reloads ONLY ComfyUI — the wrapper stays up — so `s.ready` is meaningless during a comfy restart. Fix: poll `s.ready && (s.comfyReady === undefined || s.comfyReady)`. `=== undefined` keeps old-image compat. Any remote readiness wait after a comfy-only restart must gate on `comfyReady`, never bare wrapper `ready`.

### remote cancel is soft and async (MPI-123)

`remoteCancelInstall(depId)` only POSTs `/wrapper/models/install/cancel`, which sets a flag and returns immediately. The wrapper's download loop sees it on its NEXT 1MB chunk write, then removes `<dest>.part`. So the `.part` lingers for a beat after cancel returns. `/wrapper/models/status` reports `partialBytes = getsize(<dest>.part)` — races the purge if `awaitReSync()` fires immediately after cancel. Fix: in the cancel route, follow `remoteCancelInstall(dep.id)` with `await remoteModels.remoteUninstallDep(dep).catch(() => {})` — `/wrapper/models/delete` synchronously removes both `<dest>` and `<dest>.part`. Best-effort, never hard-fail cancel.

### wrapper fetch 502 retry

`wrapperFetch` must retry transient proxy gateway statuses (404 AND 502/503/504). The proxy returns 502/503/504 when the Pod is warming (e.g. auto-reconnect at app start). Original retry budget of 8s surfaced a failure mid-resume; raised to ~30s (`retries=15, retryDelayMs=2000`). A genuine wrapper 4xx/501 (bad body, missing endpoint) is NOT in the retry set and still surfaces immediately. The remote-uninstall safe-abort must surface as `ui:warning` toast, NEVER `ui:error` (which shows MpiErrorDialog with "REPORT ON GITHUB"). Reserve the GitHub-report dialog for genuine reportable bugs.

### on-demand model auto-upload (MPI-82)

MPI-82 (closed 2026-06-17, live-verified on L4): in remote mode, a selected LoRA/upscale present locally but NOT on the Pod is auto-uploaded at generate-time, then generation proceeds. Flow: `comfyController._uploadRemoteModels(params)` runs pre-`/prompt`. Wrapper endpoint: `POST /wrapper/models/upload` (shipped image v0.4.9 / wrapper 0.2.11). `_findMissingModel` guard in commandExecutor is mode-agnostic by design (local-missing = can't upload). `forceLocal:true` per-gen skips upload. Presence is a LIVE `os.path.exists` on the volume every gen (no app cache).

### remote install progress — 80% snap is aria2c (not a bug)

**The ~80% snap on pressing Install is an aria2c preallocation artifact, NOT an app bug — do NOT keep "fixing" the app for it.** aria2c preallocates the output file across 16 segments, so its first progress report already shows a large fraction before bytes have truly flushed. MPI-95 (commit dc27f33, app-side, NO image rebuild) fixed the real bugs: aggregate denominator `modelJob.totalBytes` was seeded once from rounded registry sizes and never updated; `models:install-verifying` used to flip the bar indeterminate. Both fixed — bar now stays determinate during hash verify.

### manifest compat gate (MPI-90)

Wrapper writes `/workspace/cubric/manifest.json` at first boot. App reads it in `routes/remoteProxy.js` `_evaluatePodHealth()` before the first remote generate. Blocks (409) only on `manifest_schema_version > MANIFEST_SCHEMA_MAX` (=1). 404 = fresh volume = OK. Today the gate is dormant (every real Pod reports schema 1). Tests: `tests/runpod-remote-hardening.test.cjs` + `wrapper/test_manifest_stamp.py`.

### Pod wrapper owns+supervises ComfyUI (v0.4.2)

MPI-81 v0.4.2 / wrapper 0.2.5: the wrapper now OWNS + supervises the internal ComfyUI subprocess so `POST /wrapper/restart-comfy` can restart ONLY ComfyUI without a Pod reboot. RunPod-op truth table: console "Restart Pod" = NO-OP (uptime unchanged, processes NOT restarted); "Reset Pod" = WIPES container; "Stop → Start" = ONLY console op that reloads ComfyUI. ComfyUI does NOT auto-restart after a node install (only after OOM). Architecture: `start.sh` resolves volume/sage setup then `exec`s the wrapper as the container main process. An UNEXPECTED ComfyUI death → `os._exit(1)` → container down (safety preserved); an intentional restart sets `_restarting` so the supervisor relaunches.

---

## LTX-2.3 workflow authoring

### LTX-2.3 workflow file paths

LIVE TEMPLATE: `G:\ComfyUi\ComfyUI\user\default\workflows\LTX_i2v_t2v_template.json` — edit IN PLACE on G (file open in ComfyUI being live-tested). Programmatic edits MUST write here or the user sees nothing different. Always re-read G first (user saves between turns; edits can revert yours). FINISHED COPY (backup): `D:\WORK\workflows\App\LTX_i2v_t2v_template.json` — SAME filename. `D:\WORK\workflows\App` is private pre-promote staging (NOT the repo builder flow; `comfy_workflows/` is the promote target). App workflow generation scripts consume `comfy_workflows/`. Make backups as timestamped `.bak.json` under `D:\WORK\workflows\App\backups\` before risky surgery.

### workflow generation system

Lives in `comfy_workflows/scripts/workflow_generation/`. `generate.bat` → `orchestrate.py` globs every `*_template.json`, sha256-change-detects via `.state.json`, routes to a handler by filename prefix (`registry.py HANDLERS = (prefix, handler)` list). Each handler `generate_<name>.py` exposes `build(source_path, out_dir) -> list[Path]`. Two shapes: SDXL fan-out (one template → N per-model files swapping `Checkpoint`); Stage derivation (one stage-1 API export → `<name>.json` verbatim + `<name>_stage2.json` derived — bypasses `Stage1_Bypass` node, flips `Is_Continue`). 100% title-keyed, NEVER node IDs (IDs change on re-export). Hard-fails on missing title. LTX is the next extension: add `generate_ltx.py`, register `("LTX23_","ltx")`. i2v/t2v ship as SEPARATE files.

### LTX-2.3 tier curve — /64 size rule and motion dial

/64 size rule (NOT /32): the multi-stage pipeline downscales ×0.5 then upscales ×2 — a size must stay on the /32 latent grid AFTER halving, so must be /64 at input. TIERS ARE A MOTION DIAL, not just detail: motion peaks at LOW (~448px) and monotonically DECAYS as resolution climbs; audio coherence IMPROVES with size. Measured on RTX 4060 Ti (1-sec video): very_low=384@58s (less motion, hallucinates audio), low=448@61s (PEAK motion — full body), medium=640@68s, high=704@82s, very_high=1088@124s (mouth only, best audio). Shipped as `LTX_RATIOS` in `js/utils/ratios.js`. 2K/4K tiers dropped (motion dies).

### LTX-2.3 model precision — gemma fp8, diffusion full bf16 only

Gemma text-encoder for both video and audio paths = **fp8** (fp4 degrades, full over-influences). Main diffusion = **full bf16 ONLY** (fp8 dropped). Full bf16 runs on 16GB VRAM via RAM offload (peaks 14.4/16.0 GB VRAM, ~24GB spills to system RAM). User explicitly rejected fp8 fallback: "the quality is crap on fp8." Full bf16 (16GB VRAM + ~32GB+ free system RAM) is the HARD minimum spec. Gen timings (full bf16, RTX 3090): i2v 2s≈60s; t2v 5s≈100s.

### LTX-2.3 cold-vs-warm load time — prompt→sampling gap is ALL model load, not compute

Measured live on RTX 4060 Ti (16GB), local engine, ComfyUI v0.26.0, i2v_ms ltx-23 (logs/app.log
2026-06-26): the gap from `got prompt` to the first sampler actually stepping is pure model
load/init. **COLD** (first gen after engine start): ≈**60s** (got prompt 12:33:14 → stage-1 "Model
Initialization complete!" 12:34:15). **WARM** (model already resident, 2nd+ gen): ≈**35-40s** (got
prompt 12:36:13 → init complete 12:36:53). The cold→warm delta (~20s) is disk/RAM warmup of the
~56GB model (42GB bf16 diffusion + 14GB gemma fp8); SAMPLING itself is identical both runs
(`Prompt executed in 138.81s` cold vs `138.34s` warm — same to <0.5s). So the cold penalty is
LOAD-bound, not compute-bound. **IMPLICATION for the Pod (the user's "better cards feel SLOWER"
observation):** a faster GPU does NOT shrink this gap — it is gated by storage→RAM→VRAM bandwidth.
The Pod's network-SSD is slower than the user's local M.2, so the cold-load penalty is BIGGER on a
Pod even with a 5090/4090, and every fresh Pod gen pays the cold price. Do NOT chase this as a
sampling/Pod-compute regression; it is the model-load floor. Levers: keep the model warm (avoid
MpiClearVram between gens), faster Pod storage if ever available. Sampling speed is a separate
lever (sage-attention, MPI-145).

### LTX-2.3 stage-1 = motion, stage-2 = upscaler

Stage-1 decides motion; stage-2 is a low-denoise latent UPSCALER (hi-res-fix) that re-denoises for spatial detail only and does NOT re-plan motion. **ALL LoRAs go STAGE-1 ONLY, bypass stage-2** — a stage-1 LoRA's effect is carried into stage-2 through the latent; duplicating into stage-2 = redundant cost. Live A/B (Soft LoRA stage-1+2 vs stage-1-only): difference marginal. Garment morph at stage-2 is an upscale/detail re-interpretation artifact — fix via prompt word or stage-2 denoise strength, NOT LoRA juggling. Step counts: terminal shows N-1 denoise steps for N scheduled (first sigma = start latent, not a bug).

### LTX-2.3 ship config — capability LoRAs dropped

MPI-4 ship config (2026-06-23/24): i2v + t2v ship as BASE distilled LTX-2.3 + prompt-contract, NO reasoning/anatomy LoRAs. VBVR (V4 i2v + V1 t2v) and Singularity OmniCine all dropped after exhaustive Pod testing — each marginal-to-negative. Soft_Enhance = KEEP as a normal stage-1 LoRA (one of 6 generic `Input_Lora_N` slots) at 0.5–0.7, NOT merged into weights. Transition LoRA (FL) works but delivery deferred to an effect-system decision. The merge was cancelled because all LoRAs are now stage-1-only and template carries generic loader slots.

### LTX-2.3 workflow deconstruction — monolith split

The NerdyRodent monolith is being deconstructed into separate per-operation workflows (separate files, plain direct-wired, no Get/Set/Any-Switch maze). ControlNet findings: Union 2.3 = SOFT control; `strength_model` is a dead knob — tighten via AddGuide params instead; TIER is the big lever (low 448 starved pose-lock, medium 640 → good dance adherence). Comfy node naming law: all new non-Tier-1 nodes MUST be `Input_*/Output_*`. See `mpi-kanban/tasks/MPI-4/`.

### Transition LoRA — two roles (short morph + lipsync enabler)

The Transition LoRA (`ltx2.3-transition`) has TWO roles: (1) SHORT ATOMIC A→B MORPH PRIMITIVE — always spans the whole clip; for transform-then-act, make the transition a short clip then continue as a separate shot. (2) I2V LIPSYNC/MOTION ENABLER — with it OFF, i2v audio gens FREEZE (no mouth motion regardless of audio influence). BAKED ON for all audio ops (mandatory dep, already re-hosted to HF `re-host/loras/ltx2.3-transition.safetensors`). Do NOT bake it OFF for audio i2v. Confirmed working on FL 2026-06-24.

### FF/LF wave distortion — wrong node, not model limit

MPI-4, 2026-06-24. The wave distortion at clip tail was from using the WRONG NODE: `LTXVImgToVideoInplaceKJ` (a multi-image SEQUENCE node). Fix = two chained `LTXVAddGuide` nodes — first @ `frame_idx=0`, last @ `frame_idx=-1`, strength 0.7. Applied to BOTH stages (S2 MUST re-lock the end frame or it hallucinates the tail). S2 AddGuide `latent` MUST come from `LTXVLatentUpsampler` (the upscaled stage-1 latent), NOT a fresh `EmptyLTXVLatentVideo`. Gated by `Input_Use_End_Image` boolean — NOT a separate file. Full record: `.agents/mpi-kanban/tasks/MPI-4/research/flf-addguide-splice.md`.

### voice-ID via LTXVReferenceAudio (not LTXVSetAudioRefTokens)

`LTXVSetAudioRefTokens` attaches ref_audio to BOTH positive AND negative conditioning → cancels in the (cfg-1)×(pos-neg) term → zero identity push. `LTXVReferenceAudio` (comfy-core `comfy_extras/nodes_lt.py`) patches the model with a post-cfg function that adds `(cond_pred - pred_noref) * identity_guidance_scale` — this does NOT cancel. Official recipe: 8 steps / cfg 1, ID-LoRA-talkvid-3k@1.0 via `LoraLoaderModelOnly` (MODEL-ONLY, no clip), `identity_guidance_scale` 1.5 (default 3 is often too much, overdrives/distorts), ~5s ref audio clip. Confirmed working 2026-06-24. Accents do NOT transfer — voice timbre carries; accent must be prompted.

### audio goals taxonomy — four distinct ops

Four distinct audio goals: (1) **Voice-as-reference** (`LTXVReferenceAudio` + ID-LoRA, goal 1). (2) **Direct input audio** — exact input audio frozen into video (goal 2). (3) **Lipsync v2v 1** (lipdub, built + deferred). (4) **Lipsync v2v 2** (future). Goals 1+2 both use `Input_Audio_File` #197 and conflict if both live in the same workflow — need a mode-switch gate. Ship decision: one "Audio" RADIO → `Reference` | `Original` is the gate. Voice-ID "dead on distilled" (old conclusion) was WRONG root cause — it was a wrong node, not a model limit.

### MpiClearVram forces full rerun

`MpiClearVram` has `OUTPUT_NODE = True` and calls `unload_all_models()`. Two effects: (1) always re-walked as terminal node; (2) next run must reload the model → stage-1 re-executes. Template has TWO instances (#58 + #65) — bypass BOTH to test cheaply. A stage-1 rerun on a stage-2-only edit may also be caused by RAM eviction. Workaround: bypass both ClearVram for tuning sessions.

### ComfyUI groups are position-based, not nodes[]

Workflow `groups` store `nodes: []` (empty) — group membership is computed at render time by which nodes fall inside the group's `bounding` box `[x, y, w, h]`. Adding a node to the `nodes` array does NOT place it visually; setting the node's `pos` inside the bounding box DOES. When a script adds a node that should land in a named group, read that group's `bounding` and set the new node `pos` to `[bounding.x + ~40, bounding.y + ~60]`.

### sage attention Windows JIT tax

On Windows embedded Python 3.13, `--use-sage-attention` makes gens ~2× SLOWER. SageAttention → Triton JIT-compiles `cuda_utils.c` per attention call → fails because embedded python ships NO `Include/Python.h` and NO `libs/python313.lib`. Fallback to pytorch attention anyway, with pure overhead from the failed compile + temp-file churn. Fix: remove `--use-sage-attention` from the launcher. Pod/Linux images unaffected (triton headers present, compiles fine). This tax is Windows-embedded-python-only.

### LTXVideo kornia pin — kornia==0.8.2

`ComfyUI-LTXVideo IMPORT FAILED: cannot import name 'pad' from 'kornia.geometry.transform.pyramid'` → fix is `pip install kornia==0.8.2`. kornia 0.8.3 removed that re-export; LTXVideo's `requirements.txt` leaves kornia unpinned so fresh installs resolve to 0.8.3. `pip install -U kornia` makes it WORSE. Re-cloning LTXVideo does NOT fix it (not a stale-clone problem). Builder's `install_nodes.sh` pins `kornia==0.8.2` after the per-node reqs loop. After installing nodes, do a REAL ComfyUI restart (Restart Pod), NOT the Manager "Restart" button.

### SaveVideo split contract

All video workflows output via the portable native pipeline `CreateVideo → SaveVideo`, NOT `VHS_VideoCombine`/`nvenc_h264`. NVENC fails on Blackwell Pod containers (`OpenEncodeSessionEx failed: unsupported device`). Capture-node titles: final = `Output_Video` (+ optional `Output_Audio`); two-pass `_ms` preview = `Preview` (no audio). The app captures by title workflow-agnostically via `_collectComfyOutputUrls` reading `videos[]`. Converted ops bumped `latestVersion` 1.0→1.1 in BOTH `js/core/operationRegistry.js` AND `operation_registry.json`. **Agents NEVER edit `comfy_workflows/*.json`** — they are the user's external ComfyUI template.

---

## Pod image / mpi-ci / version-lock

### node version-lock — dev_configs/node_lock.json

`dev_configs/node_lock.json` is the SINGLE source of truth for ComfyUI core + frontend + custom-node versions. Shape: `comfyui:{core:{tag,commit},frontend:{...}}` + `nodes:{<id>:{source,...}}`. Two consumers: (1) App — `js/data/modelConstants/dependencies.js` imports the lock + `lockUrl(id)` resolver; (2) Pod image — Dockerfile COPYs it and a python loop clones each pack. To bump: edit `node_lock.json` ONLY, then rebuild image. Do NOT hand-edit Dockerfile or `dependencies.js` urls. `dev_configs/node_lock.json` edit = bump AND rebuild BOTH images (Pod copies it, Builder `COMFYUI_REF` must match).

### bump/rebuild trigger table

Canonical trigger inventory at `.agents/mpi-kanban/tasks/MPI-119/research/trigger-table.md`. Maps `trigger path/pattern → bump? → rebuild? → which version field/image`. Non-obvious rows: `dev_configs/node_lock.json` = bump AND rebuild BOTH images (easiest rebuild to forget because it looks like a config edit). `comfy_workflows/*.json` = rebuild ONLY if a NEW custom node is introduced (param edits = patch bump, no rebuild). `models.js`/`universal_workflows.js` often need NO rebuild — on-demand auto-upload covers most model adds. Advisory: `.claude/hooks/bump-rebuild-reminder.py` (Stop event) path-watches this table's triggers and warns once at session end.

### mpi-ci Pod build procedure

Pod image lives in `c:\AI\Mpi\mpi-ci` (private). Steps: (1) edit `mpi-ci/cubric-vision-pod/` files; (2) COMMIT + PUSH mpi-ci main FIRST (workflow builds from pushed ref, not local tree — #1 gotcha); (3) trigger: `gh workflow run cubric-vision-pod-image.yml --ref main -f manifest_version=X -f wrapper_version=Y ...`; (4) cu128 is LOCAL-BUILD-ONLY (CI runner runs out of disk); (5) after build, make GHCR package PUBLIC; (6) anon-pull-verify all 3 tags before telling user to connect. `wsl --shutdown` after local Docker build. NEVER pass `only_profile=cpu` in dispatch — it SKIPS the cu124 leg while still reporting success (`IMAGE_NOT_FOUND` on RunPod). Always dispatch with `only_profile` BLANK. NEVER read `.secrets/runpod.env`. NEVER run autonomous Pod create/delete.

### Pod start.sh + wrapper.py are R2-fetched at boot — no rebuild for shell/wrapper edits (MPI-156)

`bootstrap.sh` is the image `CMD` (not `start.sh` directly). At boot it curls `start.sh` + `wrapper.py` (+ `manifest.json`) from the public R2 bucket **`cubric-pod-runtime`** at `https://pod.cubric.studio/vision/<channel>/` (channel default `stable`; `pod.cubric.studio` is SHARED Cubric infra → Vision is under the `vision/` prefix, other apps get their own top-level folder), validates them (non-empty + `bash -n` start.sh), and falls back to the **baked** copies (`COPY`'d into the image) on ANY failure — so a Pod always boots even with R2 down. To ship a start.sh/wrapper.py edit WITHOUT a rebuild: commit, then `bash cubric-vision-pod/publish-runtime.sh stable` (rclone push + public verify), then on a running Pod `POST /wrapper/restart-comfy` (or recreate the Pod). Image rebuild is needed ONLY for torch/sage/node/base changes (or the one-time rebuild that ships bootstrap.sh). **Version honesty:** the Dockerfile bakes `CUBRIC_WRAPPER_VERSION` as ENV and wrapper.py reads ENV-first; the bootstrap UNSETS that env when a fetched wrapper installs so `/health` self-reports the fetched version (kept on baked fallback). rclone remote `cubric-r2:`, token in `~/.secrets/rclone-r2.conf` scoped to BOTH `cubric-builds` and `cubric-pod-runtime`. Env knobs (no rebuild): `CUBRIC_RUNTIME_URL` (default `https://pod.cubric.studio/vision`), `CUBRIC_RUNTIME_CHANNEL`, `CUBRIC_RUNTIME_FETCH=0` (run baked). Keep the published `stable/` copy in sync with the committed files (publish after commit so baked fallback == R2 copy).

### v0.26 dynamic-vram (comfy-aimdo) needs torch ≥ 2.8 — else 6-min model loads (MPI-156)

ComfyUI v0.26 ships `comfy-aimdo` (v0.4.10), a dynamic-VRAM allocator that JIT-faults weights + keeps the encoder on GPU → "load" is a near-instant mmap. It is the SILENT DEFAULT on nvidia + not-WSL + **torch ≥ 2.8** — NO enable flag. The Pod Dockerfile pinned torch 2.6 (cu124 wheel ceiling) / 2.7.1 (cu128 — it deliberately UNINSTALLS the base's 2.8 nightly for a fixed release, MPI-70), so BOTH profiles fail aimdo's `< 2.8` gate → it falls back to legacy ModelPatcher; with `--lowvram` active the 15GB Gemma encoder goes to CPU + the 42GB transformer streams through RAM = **~6-min cold loads**, every model switch (unusable for a multi-model app). `--lowvram` does NOT disable aimdo — it's the FALLBACK behaviour when aimdo is already off. Confirm from the boot log: `DynamicVRAM support requires Pytorch version 2.8 or later. Falling back to legacy ModelPatcher` = OFF; `aimdo inited for GPU` = ON. FIX (MPI-156 Phase 2): torch 2.8 stable + cu128 (cu124 can't reach 2.8 on cu124 wheels → move base to cu128/cu130), then DROP `--lowvram`. Re-check kornia 0.8.2 + baked nodes still import after the torch bump (MPI-149 lesson).

### v0.26 + torch 2.8 aimdo REMOVED `--normalvram` — drop vram flags or the engine crash-loops (MPI-156)

Once torch >= 2.8 enables comfy-aimdo, ComfyUI v0.26 **removed `--normalvram`** from cli_args.py. Passing it = `main.py: error: unrecognized arguments: --normalvram` → ComfyUI exits code 2 → the wrapper's supervisor tears down → Pod boot-loops (confirmed live on a 5090, v0.10.3). The surviving vram flags are `--gpu-only/--highvram/--lowvram/--novram/--cpu` + new `--reserve-vram/--disable-dynamic-vram/--enable-dynamic-vram/--fast-disk`. `--lowvram` still PARSES but is a documented NO-OP under aimdo. aimdo is ON by default unless `--highvram/--gpu-only/--novram/--cpu/--disable-dynamic-vram` (see `cli_args.py enables_dynamic_vram()`). FIX: pass NO vram flag, let aimdo manage (start.sh `VRAM_MODE=""`; wrapper appends the flag only if non-empty, with an UNSET→`--lowvram` sentinel for legacy pre-aimdo images). This is the MPI-146 reframe: the per-card lowvram/normalvram split is moot under aimdo. If a big-model VAE-decode OOM appears, add `--reserve-vram <GB>` (R2 edit, no rebuild). NEVER reintroduce `--normalvram` on a torch>=2.8 image.

### Broad profile is tagged `cu124` but is cu126 INSIDE — torch 2.8.0+cu126 on a cuda-12.6 base (MPI-156, PROVEN)

The broad/low-floor GPU profile (4090/Ampere/Hopper, NOT Blackwell) gets aimdo via base `pytorch:2.6.0-cuda12.6-cudnn9-devel` + `torch 2.8.0+cu126` (NOT cu124 — cu124 wheels can't reach torch 2.8). aimdo's enable gate is **torch≥2.8 ONLY** (verified vs ComfyUI `main.py`: no `torch.version.cuda` check; the "CUDA 12.8+" on aimdo's PyPI is a tested-config note, not a code gate), so the cu126 wheel (reports cuda 12.6) PASSES → aimdo inits. The profile KEY + image TAG stay `cu124` (a rename to `cu126` is a DEFERRED TODO left in the Dockerfile — renaming touches `routes/remoteProxy.js podImageForCard` suffix logic + rollback-tag matching + the build matrix + README tags, so it's not worth doing mid-test). So: `…:v0.10.3-cu124` is a **cu126 image wearing a cu124 label, on purpose**. Don't "fix" the name. cu128 stays torch 2.8.0+cu128 (Blackwell sm_120). LIVE-PROVEN 2026-06-27 on a 4090 (drv 580) + A4500 (drv 550): aimdo inits on BOTH, fast dynamic-VRAM loads, image+video gens complete server-side. sage runs ON for sm_86 (A4500), gated OFF for sm_89 (4090) — see the sage-arch gotcha.

### Driver-floor: cu126 image (`cuda>=12.6`) connects on a 550-driver host that cu128 would refuse (MPI-156, PROVEN)

The cu126 image's `NVIDIA_REQUIRE_CUDA=cuda>=12.6` (from the cuda-12.6 base) is what RunPod's nvidia-container hook checks at Pod-create — plus the base ships forward-compat carve-outs for `driver>=470 / >=535 / >=550`. PROVEN live: an A4500 host on **driver 550.127.05 / host CUDA 12.4** connected, inited aimdo, and completed a gen on `v0.10.3-cu124` (cu126 guts). A cu128 image (`cuda>=12.8`, floor ~r570) would have REFUSED that host. So Option A's lower floor (~r550/r560 vs cu128's r570) = wider host coverage, the broad profile's whole purpose. NOT universal — hosts below the carve-outs still refuse; the ONLY way to answer "will datacenter X work" is to try (RunPod surfaces the refusal at create). A too-new host (e.g. the 580-driver 4090) can't probe the floor — it'd accept cu128 too; test the floor on OLDER-driver hosts (Ampere consumer/datacenter).

### Remote gen hangs on "Generating…" — broadcast=False terminal + wrong reconcile URL (MPI-156)

ComfyUI v0.26's terminal `execution_success` is sent `broadcast=False` (only to the submitting clientId's socket) and is NOT replayed. On the REMOTE engine the gen completes on the Pod (`Prompt executed in N seconds`) but the terminal can fail to reach the proxied renderer WS, and because the socket stays connected the whole gen there's no reconnect → the MPI-152 reconcile (gated on `comfyController` `onopen` reconnect) never fires → UI hangs forever even though outputs arrived via `executed`. Compounding bug: `_reconcileFromHistory` fetched `${httpBase()}/history/{id}`, but the Pod does NOT expose ComfyUI `/history` — the wrapper only proxies it at `/wrapper/history/{id}` — so remote reconcile 404'd silently. FIX (comfyController.js, app-side, no Pod rebuild): (a) reconcile uses `/wrapper/history/{id}` when `remoteEngineClient.isRemote()`, else `/history/{id}`; (b) a 4s safety-poll armed after `executed` (remote only), cleared by the live terminal/error, idempotent via the registered `_promptResolvers` entry. Live-verified on a 5090. The wrapper WS pump (wrapper.py:1503) is a transparent forward — it does NOT drop the terminal; the loss is broadcast-scoping + (historically) the dead-socket reconnect window. Capture WS frames per-clientId: a passive client with a different clientId sees only broadcast `status`, NOT the prompt-scoped progress/terminal.

### Remote progress SSE idle-aborts at ~128s + local gen wedges after Pod disconnect (MPI-156, open follow-up)

Two distinct remote-relay issues, both surfaced 2026-06-27 (NOT regressions; folded into MPI-156, no separate card). (1) **SSE idle-abort:** the progress relay `routes/remoteProxy.js GET /comfy/events/stream` is a dumb `Readable.fromWeb(upstream.body).pipe(res)` with NO keepalive. During quiet sampling/model-load stretches the upstream wrapper SSE emits nothing for >~128s and the socket gets reaped → `[runpod] remote SSE stream aborted: terminated` fires at a ~128s cadence → the live progress bar freezes WHILE CONNECTED (the gen still completes server-side, `Prompt executed in N s`). Fix: emit a `:ping\n\n` SSE comment every ~15-30s in the relay so the idle socket isn't reaped. (2) **Local-gen wedge after disconnect:** sequence = local works → connect Pod → test → disconnect+DELETE Pod → local gen HANGS (zero `[comfy]` log lines; restart clears it). Local ComfyUI was last started before the remote session and is NOT relaunched on return-to-local. The backend remote-mode DOES reset (`remoteProxy` delete-active → `setRemoteMode({active:false})`), `remoteEngineClient.refresh()` reads `/remote/mode` and clears `_active`, and `comfyController._ensureReady` ALREADY has a local-relaunch path (`if !status.running → /comfy/start + poll`) — but the renderer took the REMOTE branch (`if isRemote() return _ensureRemoteReady`, comfyController.js ~226) against the dead Pod, so the local-start path at ~278 was never reached. It's a state/timing edge (renderer `isRemote()` still true / `refresh()` not synced before that gen), not a single broken line — needs the renderer console at hang-time to pin. Fix direction: make return-to-local self-healing — if `isRemote()` but the wrapper is unreachable (Pod gone), force `refresh()` + fall through to local-start; a gen must never block on a torn-down engine. Detail in `.agents/mpi-kanban/tasks/MPI-156/validation.md`.

### Git-Bash curl on Windows — looped `curl -o` flakes (schannel) on pod.cubric.studio

Verifying public R2 URLs with `curl -o file -w '%{http_code}'` in a tight loop on this box returns false `HTTP 000` + writes no file (schannel TLS-renegotiation choke), while a SINGLE verbose `curl -sv URL` returns the real `200`. Verify public R2 with a single verbose curl, or with rclone's S3 API (`rclone cat`/`lsf` — bypasses schannel entirely). Don't trust a looped `curl -o` 000 as an outage.

### Pod v0.4.1 weight prebake

MPI-81 image v0.4.1 / wrapper 0.2.4: Dockerfile pre-bakes 5 lazy weights via `aria2c` + `sha256sum -c` at build time (rife47.pth, 4x_NMKD-Siax_200k.pth, 4x-AnimeSharp.pth, face_yolov8n.pt, sam_vit_b_01ec64.pth) to kill 503s; `--cache-lru 2` in `start.sh` to evict stale models on type-switch to prevent OOM. Audit rule: only bake weights that an actual workflow JSON names.

### Pod v0.4.3 stats + taesd prebake

MPI-98 / wrapper 0.2.6: (1) `GET /wrapper/stats` — truthful RAM (cgroup v2 working-set) + VRAM (nvidia-smi); NOT `free -h` (reports host); token-gated; v0.4.4/0.2.7 added cgroup v1 RAM fallback. (2) taesd preview prebake — 8 decoder/encoder pairs copied from local engine (not downloaded); `.gitattributes` pins `*.safetensors binary`.

### Builder image — thin base, zero baked nodes

Redesigned 2026-06-19 (v0.1.3-cu130): thin base bakes ONLY ComfyUI core (pinned SHA eca4757 / tag v0.25.1) + torch + sage + Manager + JupyterLab. ZERO custom nodes, ZERO weights baked — both install at Pod runtime via `/opt/install_nodes.sh` and `/opt/install_models_<wf>.sh`. Rebuild needed ONLY when ComfyUI core or torch changes. Base = `runpod/pytorch:1.0.7-cu1300-torch291-ubuntu2404` (Ubuntu 24.04, Python 3.12 — NOT 3.13 like local rig). torch re-pinned to 2.12.0+cu130; torchaudio LAGS by one minor → valid trio is `torch==2.12.0 / torchvision==0.27.0 / torchaudio==2.11.0` (torchaudio 2.12 does NOT exist for cu130 — first build hit this). Sage = SOURCE BUILD with `TORCH_CUDA_ARCH_LIST="8.6;8.9;12.0"` (Docker build has no GPU → must set arch list or sage silently falls back to SDPA). NEVER `pkill -f main.py` on the Pod to restart ComfyUI — low PID, kills Jupyter terminals (cascades). Restart via RunPod console → Restart Pod (models survive; Stop wipes container disk). KJNodes red-X after Manager "Restart" button = stale boot, not a dep bug — do a full REAL boot (Restart Pod).

### Builder install scripts — canonical location

CANONICAL location = `c:\AI\Mpi\mpi-ci\cubric-vision-builder\`. Other copies (`D:\WORK\workflows\App\`, `D:\WORK\workflows\RunPod\Install\`) are stale/secondary. Two kinds: (1) `install_nodes.sh` — all custom nodes, one shared script; (2) `install_models_<workflow>.sh` — model weights, one per workflow. Conventions: `cd /opt/ComfyUI`; `aria2c -c -x16 -s16`; tokens from Pod ENV `$HF_TOKEN`/`$CIVITAI_TOKEN`, NEVER hardcoded; `cupy-cuda13x` (prebuilt, NOT auto-build); `imageio-ffmpeg` for VHS. To update for a new workflow: add `install_models_<name>.sh`, add new nodes to `install_nodes.sh`. Rebuild to re-COPY changed scripts — OR drag-drop onto live Pod via Jupyter and run (no rebuild for script edits). After installing NODES do a REAL ComfyUI restart.

### ComfyUI portable ships cu130 (Windows)

The ComfyUI Windows portable (`ComfyUI_windows_portable_nvidia.7z`) at v0.25.1 ships Python 3.13.12 + torch 2.12.0+cu130 (CUDA 13.0). The user is right about this; prior agents wrongly assumed cu12x. RunPod host fleet is HETEROGENEOUS on drivers (535→12.2, 550→12.4, 570→12.8, 580→13.0). Decision: keep images cu128 + cu124 (cu128 covers ≥570, cu124 covers ≥550). Parity surface = ComfyUI core SHA + frontend + custom-node commits (MPI-117 lock), NOT torch/CUDA.

---

## ComfyUI engine / workflows / injection

### v0.26 dropped the `executing node===null` completion sentinel → use `execution_success` (MPI-152)

ComfyUI v0.26.0 no longer signals queue-item completion with `executing` `{node: null}`. Completion is now a dedicated **`execution_success`** `{prompt_id}` WS message (`execution.py:815`, `broadcast=False`). The app had TWO completion handlers both keyed on the dropped sentinel: `comfyController.js` (gen Promise resolve) and `commandExecutor.js` `exec.onComplete` (gallery placeholder→asset swap + status/clock clear). Symptom on v0.26: the gen COMPLETES on the engine and outputs land (via `executed`, still sent), but the app HANGS forever — gallery card spins, clock counts, status stuck. Fix: accept BOTH terminals (`executing node===null` legacy + `execution_success`) in both handlers; `commandExecutor` routes through an idempotent `_finishGeneration()`. The events were NOT renamed broadly (v0.26 still sends old `progress` alongside new `progress_state`) — only the terminal sentinel changed. ALSO: terminal events are `broadcast=False` (client-targeted) and are NOT replayed on WS reconnect, so a gen finishing during a remote WS reconnect blip loses its terminal → `comfyController._reconcileFromHistory` polls `/history/{prompt_id}` on reconnect and settles from it (needs the wrapper `/wrapper/history` endpoint, wrapper >= 0.2.15). `model_type FLUX` in the LTX load log is NORMAL (LTX uses the DiT/Flux arch class), not a bug.

### v0.26 product-Pod build: comfyui_ref MUST be the node_lock TAG, not the commit SHA (MPI-139)

The product Pod Dockerfile (`mpi-ci/cubric-vision-pod/Dockerfile`) clones ComfyUI with `git clone --depth 1 --branch ${COMFYUI_REF}`. `--branch` accepts a **tag or branch name ONLY — a commit SHA fails** (`fatal: Remote branch <sha> not found`, exit 128, build dies). When dispatching `build-pod-image`, pass `comfyui_ref` = `node_lock.json` `comfyui.core.tag` (e.g. `v0.26.0`), NOT `comfyui.core.commit`. The **Builder** Dockerfile uses `git checkout ${COMFYUI_REF}` instead, which DOES take a SHA — don't conflate the two. (Hit live: first v0.9.0 CI dispatch failed on the SHA; re-dispatch with the tag succeeded.)

### v0.26 dynamic-vram (aimdo) needs torch ≥ 2.8 — the Pod's torch downgrade DISABLED it → 6-min loads (MPI-146/156)

**CONFIRMED ROOT CAUSE of the ~6-min Pod model loads** (was previously guessed as a "CUDA/package mismatch" — it is NOT). ComfyUI v0.26's dynamic-vram allocator `comfy-aimdo` (JIT-faults weights into VRAM, keeps the encoder on GPU → "load" is a near-instant mmap) is the DEFAULT when nvidia + not-WSL + **torch ≥ 2.8**. It needs no enable flag. The Pod Dockerfile pins torch **2.6.0** (cu124, the cu124 wheel ceiling) / **2.7.1** (cu128 — it deliberately UNINSTALLS the base image's torch 2.8 nightly for a "fixed release", MPI-70). BOTH fail the `< 2.8` gate, so aimdo (installed, `comfy-aimdo version: 0.4.10`) refuses to init and ComfyUI falls back to legacy `ModelPatcher`. With `--lowvram` then active, the 15GB Gemma encoder goes to CPU + the 42GB transformer streams through system RAM = 6-min cold loads (every model switch reloads = ~7min per 2s gen). **Confirm from the Pod boot log:** `WARNING: Unsupported Pytorch detected. DynamicVRAM support requires Pytorch version 2.8 or later. Falling back to legacy ModelPatcher` = OFF; `DynamicVRAM support detected and enabled` / `aimdo inited for GPU` = ON. **Fix (MPI-156): pin torch 2.8 stable+cu128** (cu124 can't reach 2.8 on cu124 wheels → move to a cu128/cu130 base). Then DROP `--lowvram` — it's a no-op under aimdo (help text: *"Doesn't do anything if dynamic vram is enabled. If dynamic vram isn't being used this option makes the text encoders run on the CPU."*) and is the thing forcing the CPU encoder when aimdo is off. `--disable-dynamic-vram` is deprecated ("removed soon") — don't add it. fp8 transformer (~20GB) + fp8 encoder (~7GB) fits a 24GB 4090 with dynamic-vram.

### sage-attention crashes LTX-2.3 on Ada (sm_89), works on Blackwell (sm_120) — gate by arch (MPI-145)

`--use-sage-attention` **crashes the LTX-2.3 forward pass on Ada sm_89** (4090/4060Ti) with `CUDA error: unspecified launch failure` in `comfy/ldm/lightricks/model.py` → `Fatal Python error: Aborted` → the engine dies + the WS drops (the app shows a generic "engine disconnected / out of memory" dialog, which is MISLEADING — it's a kernel crash, not OOM; reproduces on a 2s low-res gen that can't OOM a 24GB card). The SAME sage build **runs clean on Blackwell sm_120** (5090 generated a full LTX video, `Prompt executed`). So sage is gated per-arch in `cubric-vision-pod/start.sh` via `SAGE_DISABLED_ARCHS` (default `sm_89`; Blackwell ON). The `CUBRIC_SAGE_DISABLED_ARCHS` Pod env **overrides the gate WITHOUT a rebuild** (e.g. `=""` to force sage on everywhere for a test, `="sm_89 sm_120"` to disable both). sage is BAKED per CUDA profile (Dockerfile source-build, `TORCH_CUDA_ARCH_LIST` cu124=`8.6;8.9` / cu128=`12.0`); the runtime probe just decides whether to enable it. Local engine is immune — it never installs sage (MPI-50) and never passes the flag.

### Pod VRAM total reports ~1GB UNDER nominal → per-card threshold must be ≥28, not ≥32 (MPI-146)

`torch.cuda.get_device_properties(0).total_memory` (and nvidia-smi) report **usable** VRAM, ~1GB below the nominal card size: a 24GB 4090 reads **23 GiB**, a 32GB 5090 reads **31 GiB**. So a per-card VRAM-mode split with threshold `>=32` wrongly classified the 5090 (31 GiB) as a `<32` card → forced `--lowvram` → it streamed 57GB of weights into system RAM → OOM-hung. Use **`>=28`** as the lowvram/normalvram cutoff (cleanly separates 23 from 31; no real card sits 24-31 GiB). NOTE: per the aimdo gotcha above, this whole lowvram/normalvram split is mostly MOOT once aimdo (torch ≥ 2.8) is running — kept here because it bit us live before the aimdo fix.

### v0.26 node renames (#14547) + category moves (#14460) = display-name only, NO workflow breakage

PR #14547 ("Rename a bunch of nodes") changes node **display_name** + `is_deprecated` flags ONLY — the `node_id`/`class_type` keys (what saved workflow JSON references) are UNCHANGED. #14460 category moves are UI-only (where a node appears in the add-node menu). Verified all baked LTX-2.3/Wan/SDXL workflow `class_type` refs survive v0.26 unchanged. Do NOT chase a "node rename" when migrating engine versions unless a PR actually changes `NODE_CLASS_MAPPINGS` keys (these two did not).

### workflow input validation trap

ComfyUI validates the file selector on EVERY `LoadLatent`, `LoadImage`, and `LoadAudio` node in a submitted graph — including nodes the data flow never reaches. A baked filename with no matching file in the engine `input/` → `Invalid latent/image/audio file` + kills the whole prompt. Invisible unless you test the no-input path (a gen WITH the input attached passes). Fix mechanism: flat `WORKFLOW_INPUT_DEFAULTS` list in `routes/comfy.js`; `POST /comfy/prepare-workflow-inputs` copies all of it from repo-owned `comfy_workflows/input/` into the engine `input/` before EVERY `_ms` submit. When adding a video/multi-stage model: every baked `LoadLatent.inputs.latent` and `LoadImage.inputs.image` name must have a real default file + be listed. LTX = 3 latents + `ltx_placeholder.png` + `ltx_silence.wav` (1s silent mono PCM — must be a VALID audio file, not an empty stub). Full contract in `.claude/rules/comfy_injection.md` § "THE VALIDATION TRAP". (MPI-127)

### ComfyUI models path — YAML is canonical

ComfyUI custom models root is stored in TWO places: frontend `localStorage["mpi_comfy_root_path"]` and backend `engine/ComfyUI/extra_model_paths.yaml` (`base_path:` line, read via `getCustomRoot()` in `routes/shared.js`). localStorage can desync (different Electron user-data dirs, manual clears). Any UI surfacing the models path MUST hydrate from `GET /comfy/get-path` and write back to localStorage if drift. `MpiSettings` does this via `_hydrateComfyPath()` on panel open. Never trust localStorage alone for this key.

### models path must be absolute + additive YAML

`base_path` in `extra_model_paths.yaml` must be absolute — relative paths resolve against server cwd in Cubric vs ComfyUI dir (two different folders). `resolveModelsRoot()` in `routes/shared.js` anchors to absolute. Custom folder is ADDITIVE — YAML always emits two top-level ComfyUI blocks (`comfyui_default` + `comfyui`). Never delete the YAML on revert — rewrite with default block.

### extra model folders persist separately

Additive model folders for `loras` and `upscale_models` are stored in `extra_model_folders.json`, not inferred from `extra_model_paths.yaml`. The YAML builder re-merges them into multiline entries whenever `/comfy/set-path` or `/comfy/extra-folders` rewrites `extra_model_paths.yaml`. Without the separate config, changing or clearing the primary models root would erase user-added read-only extra folders.

### ComfyUI cache dedupe — Seed node required

`commandExecutor.js` listens for `execution_cached` WS event. When ALL `outputNodeIds` appear in the cached set AND the workflow has no node titled `"Seed"` (case-insensitive), `exec.cacheHit = true` → `generationService.onComplete` short-circuits, no `saveGeneration`, no `addGroup`, toast "No changes, skipping...". Any workflow consuming a seed MUST include a node titled exactly `"Seed"` or cache-hit dedupe fires incorrectly. Replace mode (`config.replaceItemId`) bypasses dedupe so preview→final swaps still land.

### LoRA/upscale path separator — engine OS, not hardcoded

ComfyUI builds its `LoraLoader`/`UpscaleModelLoader` enum from `path.relative` against its OWN search roots, so the separator matches the ENGINE's OS: local engine = host (Windows `\`), remote Pod = Linux `/`. `GET /comfy/list-files` MUST emit the engine-native separator or subfolder models 400 with "Value not in list → Prompt outputs failed validation". Broke v1.0.0 for subfolder LoRA/upscale on Windows (fixed MPI-82 RunPod, hotfixed to master as MPI-67 → 1.0.1). Saved names in `project.json` may use a stale separator — resolve saved→list separator-agnostically and heal by UNIQUE basename (one match → update stored path; multiple same-name files → leave red `(missing)`, never silently pick the wrong file).

### ComfyUI launch PYTHONUTF8=1

MPI-118, fixed 2026-06-20. On Windows, embedded Python 3.13 defaults encoding to cp1252. A custom node with a non-Latin-1 char in a string literal (RES4LYF's `labels.append("$Δ \hat{t}$")`, U+0394) raises `SyntaxError` on import AND the traceback printer crashes on the same char → entire ComfyUI process exits. Fix: force UTF-8 on the ComfyUI spawn env in `routes/comfy.js`: `const baseEnv = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }`. Applied to ALL platforms; also prepended `set PYTHONUTF8=1` to the patched `run_nvidia_gpu.bat` in `engine.js`. RES4LYF was also removed from the app dep set in the same session.

### GPU build selection — architecture, not CUDA

`resolveDownloadConfig()` in `routes/platformEngine.js` selects the ComfyUI portable build via `selectNvidiaBuild(gpuName, cudaVersion)` using GPU ARCHITECTURE, not CUDA version. Default `nvidia.7z` supports "20-series and above"; `nvidia_cu126.7z` is for "10-series and older" (pre-Turing). RTX/GTX-16xx+ → default; GTX 10xx & older → cu126. Old logic parsed CUDA from `nvidia-smi` stderr but `--query-gpu=name` never emits the `CUDA Version:` header (it's on stdout from bare `nvidia-smi`) → CUDA was always `unknown` and everyone fell to cu126 including Blackwell. Never gate build choice on CUDA version; arch (GPU model name) is the signal.

### engine bootstrap retry contract

MPI-8 (2026-06-07): `_clearStaleWindowsEngineArtifacts(targetDir, filename)` runs BEFORE download — removes partial archive at final name, OS-renamed `(n)` download dups, partial `ComfyUI_windows_portable` extract folder with no embedded Python. Post-extract verify: assert `getPythonBin(targetDir)` exists; else scrub + throw. Retry button routes by `GET /engine/status`: `exists:false` → `/engine/download` (full re-provision); `exists:true` → `/engine/repair-deps` (pip only). Original bug: pause download at 5% → exit → reopen → truncated archive + `(1)` dup → no python → retry hit repair-deps → "cannot run pip".

### engine upgrade must preserve models path

MPI-118, fixed 2026-06-20. `/engine/upgrade` route (`routes/engine.js`) wipes the engine folder then reinstalls. It read `hasCustomRoot` (boolean: YAML exists?) but NEVER captured the YAML's `base_path` value — then `fs.remove(portableDir)` deleted the YAML and the fresh install's step 6 wrote the DEFAULT root. Symptom: user with custom models folder (`D:\CubricModels`) after engine upgrade → 0 installed image models → prompt box does not mount (gated on `installedImageModels.length > 0`). Fix: `const preservedRoot = await getCustomRoot(); await _runEngineDownload(preservedRoot || undefined)`. GENERAL LAW: ANY engine-wipe/reinstall op must capture the custom models root FIRST and re-apply it after.

### first-run install ignores models folder

Bug (found 2026-06-09, queued for 0.0.4): picking a models folder BEFORE pressing Install has no effect. Root cause: Install click handler correctly POSTs `/comfy/set-path` (writes YAML inside the ComfyUI repo dir), then POSTs `/engine/download` — but on fresh install that dir doesn't exist yet. `/engine/download` scrubs a partial comfy dir and extracts the archive, WIPING the YAML set-path just wrote. Post-extract step 6 writes the YAML with `getDefaultModelsRoot()` (hardcoded), discarding the user's choice. Fix direction: apply the user's chosen models root AT step 6 (after extraction), passed through `/engine/download` via `req.body.modelsRoot`.

### dep URL/filename integrity — cross-check content

`js/data/modelConstants/dependencies.js` deps have `filename` (what ComfyUI loads), `url` (HF download), and `sha256` (HF `X-Linked-ETag`, verify on-disk). The 4 Wan 2.2 UNet deps had `url`+`sha256` CROSSED against `filename`: saved `wan-22-i2v-*.safetensors` but downloaded from `wan-22-t2v-*` URLs. The cross was internally consistent (sha matched the wrong url-target) so downloads verified-PASS. `scripts/computeDepHashes.py` only fills `sha256: null` — it does NOT recompute existing wrong ones. Rule: trust `filename` + `origin` as intent; cross-check `url` basename matches `filename` basename, and `sha256` matches that file's HF ETag.

### dep re-host rule — supply chain

Before shipping any model dependency the app auto-downloads, re-host it to our own HF/R2 (`cubric-builds`) if it is NOT from an official, long-established source. Small/new third-party HF repos can vanish; gated repos can't be auto-downloaded for users. Current re-host list (2026-06-24, MPI-4): `anongecko/gemma-3-12b-it-heretic-ltx`, Singularity-OmniCine LoRA, ID-LoRA (`AviadDahan/LTX-2.3-ID-LoRA-TalkVid-3K` / `-CelebVHQ-3K`), lipdub IC-LoRA (`Lightricks/LTX-2.3-22b-IC-LoRA-LipDub`, GATED — re-host when lipdub v2v op ships). Logged in `docs/builder/research/model-set.md` § supply-chain.

### ComfyUI models path — canonical files

`GET /comfy/get-path` → `{ success: true, path: string|null }`. `POST /comfy/set-path` → writes YAML; clears YAML when no path body. Endpoint added 2026-05-22.

---

## UI / components

### status-bar progress — WS events are useless, ComfyUI stdout is the truth (MPI-147)

The status-bar progress bar is driven by **parsing ComfyUI's stdout**, NOT the WS `progress`/`progress_state` events. Why: ComfyUI 0.26's WS reports the SLOW phases (model-init, VAE decode) as binary `0/1` nodes, and LTX samplers are tiny (3-7 steps, done in seconds) — so a WS-weighted bar froze at 0%, snapped to a wrong %, or hung at 90%. The rich signal (tqdm `N/M [elapsed<eta]` per step + `Model Initializing` markers) exists ONLY on stdout. Flow: `routes/comfy.js _handleComfyOutput` parses tqdm → broadcasts `comfy:step-progress` (and `comfy:tile-progress` for `USDU:` bars, `comfy:segment-total` for detailer `# of Detected SEGS:`) over the `/comfy/events/stream` SSE → `commandExecutor.js` SSE listeners → `phaseProgress.js` (createStageProgress) → `tool:stage` + `tool:progress` → statusBar.

Model: the bar runs **0-100% PER tqdm bar** and the status bar shows `Stage N/M` so each reset reads as "next stage", not a bug. `M` (bar count) is RECORDED per workflow+run-mode in `js/data/progressStages.js` (can't be derived from JSON; same file = different count single/preview/stage2). Self-declaring nodes need no entry: UltimateSDUpscale (`USDU: t/T` = tiles), detailer (`SEGS: N` = areas). ImageUpscaleWithModel (ESRGAN) emits NO signal → indeterminate pulse (`shell-info__fill--indeterminate`). Which kinds open the SSE: `STEP_EMITTING_KINDS` in commandExecutor + `buildWeightMap` kinds in progressAggregator. Timer/card/toast all anchor at `prompt_ack` (`tool:accepted`) so they match + exclude ComfyUI cold-start boot. REMOTE (MPI-147, wrapper ≥0.2.19): the Pod wrapper now ALSO parses ComfyUI stdout — `wrapper.py` spawns ComfyUI with `stdout=PIPE` (stderr merged) and a reader task drains it as raw CHUNKS (not `readline` — tqdm `\r`-redraws a live bar with no `\n` until done, so readline would collapse per-step progress into one final event) and broadcasts the SAME `comfy:step/tile/segment` SSE events the local engine does (`_parse_comfy_line` is a direct port of `_handleComfyOutput`). `remoteProxy.js` relays `/wrapper/events/stream` → `/comfy/events/stream` unchanged, so the app's listeners are identical local vs remote — no app change. Verified live on an A4500 Pod: LTX t2v showed Stage 1→2→3 with per-step fill, same as local. (The old WS-aggregator fallback still kicks in only if a Pod runs a pre-0.2.19 wrapper that emits no step events.)

### MpiRadioGroup emits 'select' not 'change'

`MpiRadioGroup` emits `'select'` on user pick, not `'change'`. Listening for `'change'` results in silent no-op. Always use `.on('select', ...)`. Smoke-test that values round-trip to project.json before considering wiring correct.

### MpiInput size='sm' width cap

`MpiInput size='sm'` sets `.mpi-input--sm .mpi-input__field { width: 6ch }` on the `<input>` element directly, not the wrapper. Setting width on `.mpi-input` does nothing. To widen: target the field with equal-or-higher specificity (e.g. `.mpi-model-settings__lora-strengths .mpi-input--sm .mpi-input__field { width: 8ch }`). 8ch clears `-1.00`; 7ch still clips. Overlay renders 0-size on the landing page — don't measure through the overlay. CSS cache trap: edit + reload full page before measuring, not just re-mount.

### MpiCanvasViewer spinner flags

`MpiCanvasViewer` spinner visibility = `_isGenerating || _isLoading`. Two separate setters, both flip `.mpi-canvas-viewer__spinner--visible` via `_syncSpinner()`. `el.setGenerating(bool)` = model-driven generation flow; `el.setLoading(bool)` = internal-only async stalls (4K/8K decode + canvas remount). When adding any async path that leaves canvas blank, wrap with `_setLoadingSpinner(true/false)` via try/finally. Do NOT route through `setGenerating` — consumers (mascot peek) read it separately. `MpiVideoViewer` mirrors the same pattern.

### MpiSlideOver popup-open opt-out (MPI-79)

`Overlays.request()` fires `ui:close-all-popups { reason: 'overlay-open' }` on every overlay/modal open. `MpiSlideOver` ignores `reason === 'overlay-open'`; Escape and `Overlays.reset()` still close it. Click-away close was REMOVED entirely (per card: annoying). Transient popups (dropdowns, context menus) ignore the arg and still close on any pulse. Only long-lived panels opt out by checking `payload?.reason === 'overlay-open'`.

### MpiToast DOM as source of truth

MpiToast caps visible toasts at `MAX_VISIBLE_TOASTS = 2`. Visible count = live DOM query (`qsa(':scope > .mpi-toast:not(.mpi-toast--queued)', stack)`), NEVER a counter var. Queued toasts mount INSIDE `.mpi-toast-stack` hidden via `.mpi-toast--queued { display:none }` — NEVER park a toast in `document.body`. Queued toasts get NO timer until promoted. `dismiss()` is idempotent. One clean drain path. Verify any toast change with a burst test: fire 5+ toasts, assert never >2 visible, none at top-left/out-of-stack, full drain to zero.

### gallery video thumbnail pattern

Three-stage pattern in `MpiGalleryGrid.js`: (1) Poster paint — `<img src=thumbPath>` (256px JPG from `services/ffmpegThumb.js`) renders instantly. (2) Lazy promotion — grid-level `IntersectionObserver` (rootMargin 200px) calls `card.el.promoteVideo()` when wrapper enters viewport; creates `<video preload=auto>`, fades in once `loadeddata` fires. (3) Hover playback — `mouseenter` calls `play()`; `mouseleave` pauses + resets to frame 0. Element persists so replay works on second hover. `--hover-video-ready` class must NOT be removed on mouseleave — it keeps the paused still visible.

### gallery slider sizing — items-per-row bands

Drive seed from desired items-per-row, not pixel: `target = ((containerWidth - (N-1)*gap) / (N * aspectRef)) * 0.92`. `aspectRef` 1.6. Justified-layout per-row rescaling collapses any two seed pairs that land in the same items-per-row band → two adjacent pixel targets produce identical visual output. Current map: `ITEMS_PER_ROW_TARGET { 1:6, 2:4, 3:3, 4:2 }`. Recompute on BOTH slider input AND ResizeObserver.

### gallery card chrome — inverse info mode

`MpiGalleryGrid` card chrome uses inverse `galleryShowInfo` model: info OFF = clean media until hover reveals metadata/actions; info ON = metadata by default, hover hides metadata and shows actions. State/preview/selection badges stay persistent. Local chip/button backgrounds, not card-wide radial scrims. Prompt excerpts stay out of gallery cards; bottom metadata = compact dimensions/time only.

### gallery window-drop — no stopPropagation

`MpiGalleryBlock` binds `dragenter/dragleave/dragover/drop` on **`window`** to show/hide its `MpiMediaDropOverlay`. The window `drop` handler ONLY hides the overlay + resets a drag counter — actual import runs from the overlay element's own listener. Any other drop target must call `preventDefault()` but NOT `stopPropagation()` — swallowing the bubble starves the gallery's window-level cleanup, leaving the overlay stuck open. Found MPI-82.

### gallery hover audio + scroll-stop

MPI-132: hovering a gallery VIDEO card unmutes+plays its `<video>`; hovering an AUDIO card plays its hidden `<audio>`. Gated by `Storage.getPlayAudioOnHover()` (`mpi_play_audio_on_hover`, default true). One-card-at-a-time via `_stopOtherGalleryMedia(except)` covering BOTH `audio[data-src]` AND `video.mpi-group-card__thumb--video`. SCROLL BUG: `mouseleave` does NOT fire when the card scrolls out from under a STATIONARY cursor. Fix = a `scroll` listener on the grid scroll container that stops every playing media whose card is no longer `:hover`. Do NOT rely on mouseleave alone for "stopped hovering" in a scrollable list.

### download:complete lingers in state.downloadJobs

`download:complete` sets `status='complete'` but NEVER removes the job from `state.downloadJobs`. Any gate keyed on `downloadState !== 'idle'` will mis-wire a card with a lingering complete job (MPI-99: Uninstall button had no listener; MPI-102: Install button had no listener after reinstall). Gate on genuinely-ACTIVE states explicitly (`downloading`/`paused`/`installing`), NOT `!== 'idle'`. `MpiModelManager.renderList()` has TWO twin branches with this gate (installed ~L251, uninstalled ~L362) — both now use the identical `isActiveDownload` whitelist predicate. **Keep them in sync.**

### op-selectable models (MPI-122)

Model shape: flat (`dependencies: string[]`) OR operation-keyed (`commonDeps: string[]` + `operations: { <opKey>: { deps[], requiresOps?[] } }`). Resolver chokepoint = `js/data/modelConstants/resolveModelDeps.js` — NEVER read `model.dependencies` directly. Methods: `resolveDeps(model, selectedOps)`, `resolveFullUniverse(model)`, `deriveInstalledOps(model, depStatusFn)`, `canonicalModelId`. GOTCHA: model pickers must use `isModelUsable()` (modelRegistry), NOT `model.installed` — `installed` is false for a partial op-keyed install → model vanishes from dropdowns.

### queue panel diff render

`MpiQueuePanel._render()` uses signature-based diff render (identity + status + display fields + `previewUrl ? 1 : 0` flag). If sig matches, only `<img src>` is swapped via `_cardByJobId` map; if different, full rebuild. Why: Latent preview ticks fire `generation-queue:changed` rapidly — rebuilding the whole list each tick loses CSS `:hover` mid-frame → hover background flickered. Include "presence" boolean in signature so first-tick transitions (null → url) still force one rebuild.

### notes feature — project.md and card sidecar

MPI-76 (2026-06-14): two surfaces. Project notes = `project.md` per project; routes: `POST /project-notes` + `POST /project-notes/save` in `routes/projects.js`; triggered from project picker right-click. Card notes = `notes` field on card sidecar (`Media/.meta/<itemId>.json`); persisted via existing `POST /project-media/:id/update-meta`. Both use `MpiNotesEditor` (textarea + Save/Cancel over MpiModal). `grid.on('card-notes')` cleaned by `grid.destroy()` (not `_unsubs`).

### group field persist whitelist

Adding a new scalar field to an ItemGroup (e.g. MPI-130 `group.customName`) needs THREE edits: (1) `createItemGroup` factory in `js/data/projectModel.js`; (2) **`persistGroups()` in `js/services/projectService.js`** — the serialize map is an EXPLICIT WHITELIST (`{id, type, name, createdAt, selectedIndex, open, favourite, history}`), NOT a spread. Any key not listed is SILENTLY DROPPED on every save → field never survives reload. (3) Read-back is already safe (`projectReconciler.js` uses spread). Groups live INLINE in `project.json` `itemGroups[]`, NOT in `.meta/<uuid>.json` sidecars. When adding any group-level property, grep `persistGroups` first.

### import depth and case sensitivity

Relative import depth varies by how deep a component sits under `js/`. Reference depths to reach `js/` root: `js/components/Compounds/<X>/file.js` → 3 ups; `js/components/Compounds/LandingPages/<X>/file.js` → 4 ups (extra `LandingPages/` segment). Wrong-depth import → boot JS halts → app stuck forever on the landing spinner; server log stays clean (error is browser-side). Case sensitivity (Linux-only): dev box is Windows (case-insensitive); Linux portables are case-sensitive. A relative import whose CASE doesn't match the on-disk filename resolves fine on Windows but 404s on Linux → same spinner failure. SWEEP before any portable/Linux release: walk the whole `js/` import graph and verify EXACT-CASE existence.

---

## Generation / prompt / sidecar

### cue queue contract

Cue's user-visible queue state is owned by `generationService.getGenerationQueueSnapshot()` and `generation-queue:changed`, not ComfyUI queue polling. Snapshot carries stable `queueJobId`, display metadata, batch count, loop/source, thumbnails/previews, and cancel/stop affordances. PromptBox ratio injection includes `Ratio_Label` alongside `Width` and `Height`; Cue cards and saved sidecar metadata should display the selected label (e.g. `16:9`) rather than deriving labels from output pixels.

### reuse prompt recall

`state.promptReuseOptions` and `state.promptReuseSource`. Ask is a behavior flag; Gallery can reuse Original or Current. I2V prefers materialized snapshots in `Media/.preview-assets/<itemId>/startFrame.png` and `endFrame.png`. Gallery Reuse Prompt source `current` is strict and uses the card's active `selectedIndex` entry. MPI-127 (2026-06-25): reuse media resolution was EITHER/OR — preview-asset frames OR saved mediaItems, never both (dropped audio on i2v-with-audio). Fix = `_mergeReuseMedia(frames, saved)` in `js/utils/promptReuse.js`: preview-asset frames are authoritative for IMAGES, saved media supplies every OTHER type (audio, non-frame video); if frames present, saved images dropped to avoid dup start-frame chip.

### prompt draft persistence (MPI-113)

Prompt drafts survive navigation via two session-only state keys: `state.promptDraft` + `state.promptMedia`. Tagged-slot scheme: one slot per workspace, stamped with card id. Gallery slot: `id:null` (always matches = persistent). History slot: only last-touched card round-trips; other cards show clean box. PromptBox props: `workspaceKey` (`'gallery'`|`'history'`) + `workspaceId` (card id). Restore runs INSIDE `MpiPromptBox.mount()` BEFORE block subscribes to `media-change`.

### promptbox chip name nav survival

MPI-130 chip-label bug: `_saveMedia` serialized only `{url, mediaType, role}` and DROPPED `name` → chip label reverted to raw filename after nav. 4-hop round-trip must all carry `name`: (1) `_tryAddMedia({..., name})` sets `item.name`; (2) `_saveMedia` map includes `name`; (3) restore loop passes `m.name` to `injectMedia`; (4) `injectMedia({url, mediaType, role, name})` forwards `name` → `_tryAddMedia`. Rule: any per-chip field that must survive workspace nav must be added to the `_saveMedia` serialize map AND threaded through `injectMedia` → `_tryAddMedia`.

### extend reuse and sidecar (MPI-112)

Extend reuse-prompt was broken because the extended history item was built from `/extend-video` server sidecar which discarded the i2v generation's reuse metadata. Fix: extend sends `generationSettings` to `/extend-video`; server materializes the start-frame snapshot under the extended item's `.preview-assets/<id>/`. Duration drift fix: `buildPromptReuseSettings` now reads ONLY the saved `Duration` param (dropped `?? item.duration ?? videoMeta.duration` fallback). Control-refresh order bug: `setModel`/`setOperation` mount controls (reading OLD `project.shared`) BEFORE `applyPromptReuseSettings` writes recalled values → stale PromptBox. Fix: new `el.refreshControls()` on MpiPromptBox, called after `applyPromptReuseSettings`.

### sidecar controlState schema (MPI-115, SCHEMA_VERSION 3)

`.meta/<uuid>.json` sidecar has ONE source per field. Replayable PromptBox state = `generationSettings.controlState = { shared?, op?, model? }`, snapshotted at gen time. Buckets: `shared` = `project.shared[mediaType]` (ratioSelector/qualityTier, batch, duration, motionIntensity, previewStage); `op` = per-op (denoise/useGrid/upscaleFactor); `model` = `{loras, upscaleModel}`. Removed dups: top-level `ratioLabel`, `videoMeta`, `generationSettings.modelSettings`. Deliberate dups KEPT: `pixelDimensions` (UI render) vs `injectionParams.Width/Height` (reuse); `mediaItems` vs `previewAssets.snapshots`. Migration: `SCHEMA_VERSION = 3`; `migrateV2toV3` chains from any prior version.

### removeHistoryEntry empty-group guard

`removeHistoryEntry(group, index)` in `js/data/projectModel.js` has a hard guard: `if (group.history.length <= 1) return group;` — silently returns the original group when only one entry remains. Delete flows that may consume every remaining entry must detect this BEFORE looping and switch to `removeGroup(_group.id)` + `navigate(PAGE_GALLERY)`. Detect with `indices.length >= _group.history.length`. File DELETE fetches should still fire for each item.

### video trim frame semantics

Video trim out-points are frame-inclusive. Player frame stepping/display must use probed stream fps with `frameCount` bounds rather than `frameCount / HTMLVideoElement.duration`. Chromium can report a few milliseconds of duration tail after the final decoded frame, which can manufacture a fake one-past-last frame and make next/previous controls appear stuck at the end.

---

## Downloads / engine

### NDH resumable downloads

`node-downloader-helper` v2.1.11 key facts: writes straight to final filename (no .part suffix). `resume:true` is NOT a real NDH option (silently ignored) — the real flag is `resumeIfFileExists` but it makes `pause()` fail; leave `resume:true` (harmless, keeps `start()` synchronous so pause works). `pause()` mid-chunk can throw `ERR_STREAM_WRITE_AFTER_END` (defer via `setImmediate`). `models/check` uses bare `fs.pathExists` — partial-at-final-path reads as installed (false positive). MPI-54 (2026-06-09): implemented `<file>.cubricdl` sidecar marker + `isCompleteOnDisk()` + `routes/downloadCompletion.js` to fix this.

### external project registry

External project pointers persist in `<Documents>/Cubric Vision/project-paths.json` (`{ "paths": [parentDir...] }`), a server-owned atomic registry in `routes/shared.js`. The renderer's localStorage `extraProjectPaths` is a cache that `list-projects` migrates into the registry on every call (self-heal). Registry stores **parent dirs**, not exact project folders. Routes: `POST /add-project-path`, `POST /remove-project-path`. `build-portable.mjs` PRESERVE list includes both `<documents>/Cubric Vision/Projects/` and `project-paths.json`. Default Documents projects are durable by design.

---

## Build / release / distribution

### CI split to mpi-ci

MPI-55 (done 2026-06-08): `Cubric-Vision/.github/workflows/build-portable.yml` is now a DISPATCHER to private `MadPonyInteractive/mpi-ci` — NOT an artifact-producing build. Do NOT reintroduce `actions/upload-artifact` for early-access portable builds in Cubric-Vision. `workflow_dispatch` needs YAML registered on default branch (master), but dispatch against `RunPod` with `-f ref=RunPod`. Checkout@v4 rejects an explicit empty `token: ''` BEFORE trying `ssh-key` — never pass `token: ''`. Baselines must be committed+pushed BEFORE dispatching the next build.

### delta update bundles (MPI-56)

`scripts/build-portable.mjs --from-manifest <path>` emits a TRUE delta update bundle (only changed/added files). Diff is file-level SHA256 only — NOT binary delta (contract forbids binary deltas). A file is included iff its sha256 is absent/different vs baseline; baseline paths gone from the new set go in `manifest.delete[]`. `delete[]` always excludes PRESERVE prefixes (engine/, models/, user-data/, Documents). `alwaysKeep` = update-manifest.json + connector-manifest.json + launchers. Omitted `--from-manifest` = FULL update bundle (first-release safe, `fromVersion:null`).

### per-OS CI build

Portable artifacts built per-OS in CI; each matrix runner runs `npm ci` + `build-portable.mjs`. `--no-node-modules` for dev/test only, never ship builds. CI bundles `uv` at `<root>/uv/uv`. Verify exec bits on Linux tarballs before trusting.

### portable launcher split

Two launchers per desktop platform: Windows — `start.vbs` (default, hidden) + `start-with-terminal.bat`; Linux — `start.sh` (detached via `setsid nohup`) + `start-with-terminal.sh`; macOS — `start.command` only (true hide needs `.app` bundle, deferred). Windows `.bat` always shows console — VBS is the only true zero-flash path. App logs go to `logs/app.log` regardless.

### portable tar exec/symlink

Hand-rolled tar/zip writer: `listFiles()` uses `entry.isFile()` (false for symlinks) → every `node_modules/.bin/*` symlink dropped; tar writer only set mode 755 on `.sh`/`.command`. Fix: Linux/mac launchers call `node_modules/electron/dist/electron` directly, `chmod +x` it at startup (self-heal). `isExecutableEntry(relPath)` marks launchers, electron binary, `uv/uv`, `.bin/` entries as mode 755. Do NOT rely on `.bin/electron` surviving an archive. Windows works because `.bin/electron` is a real file (not a symlink), so `isFile()` is true.

### updater assumes no host tools

Portable online updater must assume NO host tools — `curl` is absent on minimal Linux installs. The ONLY runtime a portable install is guaranteed is its own bundled Electron binary. Do all network work via `scripts/portable/fetch-release.cjs` (pure Node `https`, redirect-aware) run with `ELECTRON_RUN_AS_NODE=1 <bundled electron>`. Exec-bit self-heal has THREE independent layers: (1) `restoreExecBit` per-delta-file; (2) `restoreLauncherBits()` final manifest-independent sweep in `apply-update.cjs`; (3) `chmod +x` sweep in `update-from-zip.{sh,command}`. Bootstrap trap: a broken updater can't self-deliver its fix. Permanent escape hatch = offline `update-from-zip.{sh,command}`.

### electron-as-node asar stall

`apply-update.cjs` runs via `ELECTRON_RUN_AS_NODE=1`. Electron's asar-aware `fs` hook intercepts writes to any file named `*.asar`. Update bundles contain `app/node_modules/electron/dist/resources/default_app.asar`. When extract-zip (yauzl `lazyEntries`) reaches that entry, the write is rejected and `lazyEntries` SILENTLY STALLS — no throw, no reject, process exits 0 with a partial tree. Fix: `process.noAsar = true;` at the very top of `apply-update.cjs`, before requiring fs / extract-zip. Why it hid: small delta bundles finish before reaching the asar entry, so they applied clean. Only large/full bundles hit the stall.

### dev_mode is derived from BUILD_HASH

`APP_CONFIG.dev_mode = (BUILD_HASH === 'dev')` in `dev_configs/app_config.js`. Source/dev runs (`npm start`) keep `js/core/buildInfo.js` at `BUILD_HASH = 'dev'` → dev_mode on. `scripts/build-portable.mjs` stamps a real Git hash into the STAGED COPY of `buildInfo.js` (never the repo source) → staged dev_mode off. `main.js` (CommonJS) re-derives by regex-reading `BUILD_HASH` from `js/core/buildInfo.js`. Never set dev_mode to a literal; never expect builds to edit source.

### app stage derivation

App release stage (`alpha` | `beta` | `release`) is derived purely from `APP_VERSION`: `0.x.x` → alpha; `X.0.0` → release; `X.Y.0` (Y>0) → beta; `X.Y.Z` (Z>0) → alpha. Frontend: `js/core/appStage.js` (`deriveStage()`, `APP_STAGE`, `APP_STAGE_LABEL`). Backend mirror: `routes/system.js` `/github/create-issue` re-implements `deriveStage()` server-side (CommonJS can't import the ESM helper); client-sent stage is advisory, never trusted. Keep both copies in sync if the rule changes. Do NOT hand-edit `APP_VERSION`/`SCHEMA_VERSION` — owned by `/mpi-version-bump` skill. Doc: `docs/versioning.md` § "APP_STAGE (derived)".

### changelog — two surfaces, accumulate

Changelog lives in TWO surfaces, both keyed by exact APP_VERSION string, both ACCUMULATE (never overwrite): (1) Runtime — `js/data/releaseNotes.js` map, consumed by `MpiChangelogDialog` overlay on startup (exact-key lookup). Users jumping versions see only the latest block — repeat important intermediate fixes in the latest block. (2) Archival — `docs/releases/YYYY-MM-DD-v<ver>.md`, one file per version. `npm run release:check` enforces 1:1 between runtime keys and archival markdown files. On every version bump you MUST add BOTH. `/mpi-version-bump` automates this.

### release skills — three skills own the flow

`mpi-version-bump` is now the file-edit mechanic only. Three skills: `mpi-apply-patch` (3rd-digit bump on master, rebuilds, refreshes current Cloudflare link in place, NO git tag); `mpi-merge-branches` (dev branch → master as next minor, rebuilds, mints NEW Cloudflare link, NO git tag); `mpi-release-public` (pushes `v*` tag → public GitHub release, reuses existing D: builds, accumulated changelog). Hard rules: prep-all-then-STOP before every live op; two mandatory user copy-review gates (in-app `releaseNotes.js` + Cloudflare `index.html`). Shared-tree commit hygiene (explicit pathspec). Doc ref: `docs/releases/patch-distribution.md`.

### R2 upload procedure

Patch loop self-contained in Cubric-Vision including R2 upload. Bucket: `cubric-builds`. Public host: `https://dl.cubric.studio/`. Tool: `rclone` (`C:\Users\Fabio\AppData\Local\Microsoft\WinGet\...\rclone.exe`). Config: `C:\Users\Fabio\.secrets\rclone-r2.conf`. Link model (new 2026-06-18): tier-neutral, minor-only path: `vision/v<major>.<minor>-<randomhex>/`. NO `pro/` segment. Patches reuse same link (swap files in place). New link minted only at promote (`mpi-merge-branches`). Update bundles are the ONLY way Pro users update (NOT the built-in GitHub updater — that's the public-release path). Approval gates required before uploading paid-member files.

### patreon patch train

Patch releases (1.0.x) go to Patreon Pro via Cloudflare with NO git tag and NO GitHub publish. A `v*` tag would trigger `push: tags: v*` and leak publicly. Public GitHub release (which pushes a `v*` tag) is done later, bundling all patches since last public version.

### repo distribution gating

One repo (AGPL-3.0). Gating = distribution + timing, not code: Tier-1 Patreons → alpha zip in Discord ~1 month pre-public; Tier-2 → beta zip ~2 weeks pre-public; Public → GitHub Release + tag at launch. HuggingFace write token scrubbed from all 622 commits via `git filter-repo --replace-text`. Versioning policy: `major.minor.patch` as release-cadence signal; Major starts at 1; patches for bug-fix builds only.

### v1.0.0 release complete

Cubric Vision 1.0.0 — first official public release — cut 2026-06-10 (commit `330e33d`, tag `v1.0.0`). Verified FULL portable installs for Windows (x64), Linux (x64), macOS (Apple Silicon/arm64). Updater validated offline + online (Windows + Linux end-to-end). macOS no-terminal `CubricVision.app` FAILED on M4 — DROPPED. macOS uses `start.command`. The ONLY working mac first-launch path: Terminal `xattr -dr com.apple.quarantine "<folder>"` then double-click `start.command`. `release-baselines/*.json` filenames must track the CI matrix `platform` (e.g. `win32-x64.json`, NOT `windows-x64.json`).

### disk layout — C constrained

User's C: drive (~8GB free as of 2026-06-11). Docker Desktop default data root (`docker_data.vhdx` under `C:\Users\Fabio\AppData\Local\Docker\wsl\disk\`) ballooned to ~31GB on first runpod/pytorch build, nearly exhausting C. The vhdx does NOT auto-shrink after `docker builder prune` / `docker rmi`. Solution: Docker Desktop → Settings → Resources → Advanced → Disk image location → set to `D:\DockerData` → Apply & Restart. Reclaim after heavy Docker work with `docker system prune -af` + `docker builder prune -af`.

---

## macOS / release ops

### macOS build fixes (1.0.0)

Eight bugs fixed 2026-06-10, ALL VERIFIED on M4 via 0.0.8 fresh install + 0.0.8→0.0.9 offline update: (#1) MPS/--cpu forced on every Mac; (#2) ZIP exec bits dropped; (#3) Gatekeeper unhandled; (#4) ffprobe config typo; (#5) ffmpeg/ffprobe non-executable; (#6) .app symlink-drop via ditto; (#7) Archive Utility strips exec bits; (#8) version display bug). arm64-only. MPI-60/61/62 closed. fp32-vae was tried + REVERTED (OOM + overrides per-workflow VAE).

### mac testing via rentamac

Rent a cloud Apple-Silicon Mac at https://rentamac.io; drive remotely via DeskIn. Subscription cancelled after 1.0.0 mac acceptance. Re-subscribe only when something specifically needs testing on real Apple hardware. GOTCHAS: rented Mac's datacenter IP shares GitHub's unauthenticated API rate limit (60 req/hr per IP) — the online updater 403'd there even though the code was fine. Check `curl -s https://api.github.com/rate_limit`. Gatekeeper quarantines any downloaded build — reliable clear: Terminal `xattr -dr com.apple.quarantine "<folder>"`.

---

## Conventions / gotchas

### backend logger arity

`routes/logger.js` public API: `logger.info(category, message)` — 2 args; `logger.warn(category, message)` — 2 args (3rd argument is SILENTLY DROPPED, not formatted, not logged); `logger.error(category, message, err)` — 3 args (`err.stack` appended). To attach structured detail to a `warn`/`info`, fold it into the message string yourself (e.g. `JSON.stringify(detail)`).

### kanban card shape rules

When creating or editing MPI Kanban cards (`.agents/mpi-kanban/tasks/<id>/task.json`), read the mpi-lib schema FIRST (`C:\Users\Fabio\.agents\skills\mpi-lib/task-board-ops/_schema.md`, `mutate.md`, `validate.md`). Common breakages: (1) `status` is NOT free-form — canonical values are `active`/`accepted`; put blocking info in `description` or `brief.md`. (2) `links` must be the full 8-key set for the board's TASK WORKSPACE panel to render. (3) `description` is a SHORT one-line card summary — long-form goes in `brief.md`. `maturity` enum: `idea`, `planned`, `in-progress`, `validating`, `complete`. LIFECYCLE: every card with real work passes `todo → doing → done`. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in BOTH event logs. The live board is `board.json` with `todo`/`doing`/`done` columns — NOT the legacy `kanban-ops/` Markdown board doc (5-column BACKLOG/PLANNING/… board that does NOT exist).

### shared-tree commit hygiene

The RunPod branch is shared by concurrent agents. Commit by explicit pathspec (`git commit --only <paths>`), NEVER `git add -A`/`git add .`. Push stays user-authorized (do not push unless asked).

### no toast on user Stop

User actions are self-evident — toasts for NON-user events only.

### error dialog vs toast

`ui:error` → MpiErrorDialog (GitHub-report dialog, for genuine reportable bugs). `ui:warning`/`ui:info`/`ui:success` → toast. Reserve the GitHub-report dialog for genuine bugs, not expected transient states.
