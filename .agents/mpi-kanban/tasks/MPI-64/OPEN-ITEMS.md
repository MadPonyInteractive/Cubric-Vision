# MPI-64 — Consolidated Open Items Register

> **SINGLE SOURCE OF TRUTH for everything still OPEN on MPI-64 (RunPod Remote Engine) and its connected work.**
> Built 2026-06-14 by sweeping `plan.md` (Phase checkboxes + Plan Drift prose), `current-architecture.md` §10,
> `checklist.md`, `validation.md`, and the latest handoff. **Every session MUST update this file** when an item
> opens, closes, or changes — instead of re-scattering notes across the Plan Drift log. The detailed root-cause
> narrative stays in `plan.md` Plan Drift / `current-architecture.md`; THIS file is the index + status.
>
> **Tags:** `[app]` app-side, no image rebuild · `[rebuild]` needs MPI-75 wrapper/Dockerfile rebuild (USER-run) ·
> `[decision]` needs a user decision first · `[verify]` code done, needs live verification · `[engine]` engine-config
> /quality, tracked separately from MPI-64 transport · `[hygiene]` knowledge/commit/cleanup debt.
>
> **Priority:** 🔴 high (blocks core remote use / forces app relaunch) · 🟡 medium (real gap, workaround exists) ·
> 🟢 low (cosmetic / polish / hygiene).

---

## A. Engine-drop / OOM recovery  🔴  `[app]` (no rebuild)

The highest-severity cluster. An out-of-band container OOM (exit 137) currently leaves the app in a broken
half-state that **requires a full app relaunch**. B4 part 1+3 (WS-reconnect cap + reject-pending-gens + poll
backoff) already SHIPPED + COMMITTED. Part 2/4 + B2 are the open half.

- [x] **A1 — B4 part 2/4: in-app recovery + panel re-hydrate. — FULLY PASS 2026-06-14 (live, end-to-end).**
      Coded this session (renderer-only: js/shell.js `_initEngineDropRecovery`, heroStats.js + statusBar.js
      `disconnected` state). DROP HALF (stop Pod from RunPod console mid-T2V-gen): ✅ status bar →
      `IDLE · DISCONNECTED`; ✅ hero → `REMOTE · DISCONNECTED` (NOT `local · offline`); ✅ orange `ui:warning`
      toast "Remote engine disconnected — … Reconnect from Settings → RunPod"; ✅ "Generation failed" modal
      ended the stuck gen with the OOM-aware message; ✅ no false local masquerade. RECOVERY HALF: manual
      Settings → Connect → L4 warm-resume failed host-pinned → recreate-fallback hit out-of-stock with a clear
      "pick another card" message (Step 4.3 self-heal working) → picked RTX 2000 Ada → fresh create (201,
      v0.4.0-cu124) → ready → ✅ hero `REMOTE · ONLINE · RTX 2000 Ada`; ✅ status bar `IDLE · Remote`;
      ✅ Models `1/7` still INSTALLED (T2V persisted on the volume across the L4→2000Ada GPU SWITCH = Design-A
      persistence + connect-edge re-hydrate both confirmed); ✅ NO app relaunch anywhere in the whole cycle.
      Note: ~30s UI-update lag after ready = the accepted H1 residual, expected. A1 DONE — commit the 3 renderer
      files when authorized. On a remote WS drop / status-flip-to-not-ready
      while a generation is in flight: (1) end the stuck generation cleanly + toast; (2) DON'T paint LOCAL
      hero/empty panels as if the user chose to go offline; (3) auto-recover or one-click reconnect so no app
      relaunch is needed; (4) re-hydrate project + model panels on reconnect; (5) back-off the status polls when
      the engine is known-down (the 6000+ runaway-request lag). Source: plan.md Plan Drift 2026-06-13 (B4 part
      2/4 entries L173/L175/L180), current-architecture.md §10 "B4". **Verify:** force a container OOM on a heavy
      video gen → toast + spinner ends + request volume flat + app recovers WITHOUT relaunch.
- [ ] **A2 — B2: container-RAM-OOM detection toast.** Detect the exit-137 container OOM (WS just drops, no
      `execution_error`) → "Remote engine restarted — the Pod ran out of memory; try a shorter/smaller
      generation" toast + re-poll `/remote/comfy/status` to recover. Overlaps A1 (same WS-drop surface).
      Source: plan.md Plan Drift 2026-06-13 (B2, L179). **Verify:** force a container OOM → clear OOM toast +
      recovery, not a silent dead WS.

## B. Remote video generation (Phase 4 core)  🔴  `[app]` (mostly)

Remote IMAGE gen is verified. Remote VIDEO is the remaining core capability.

- [ ] **B4 — 🔴 Interpolate 503 on remote = RIFE model WEIGHTS not baked (node code IS baked). PINNED 2026-06-14.**
      LIVE on the RTX 5090 Pod: `/opt/ComfyUI/custom_nodes/comfyui-frame-interpolation/` exists (node code present,
      incl. `vfi_models/rife/rife_arch.py`) BUT a `find` for `*.pth`/`*.pkl` under it returned **EMPTY** — the RIFE
      checkpoint (e.g. `rife47.pth`) is NOT on the Pod. The Dockerfile (`cubric-vision-pod/Dockerfile:125`) runs
      `python install.py` which installs the node's PYTHON deps only; ComfyUI-Frame-Interpolation downloads its
      `.pth` ckpts LAZILY at first node execution (from HuggingFace). On the Pod that runtime fetch did not happen
      (no pre-bake, and/or blocked/failed at run) → the RIFE VFI node fails at execution → `POST /proxy/prompt 503`.
      FIX (image, no app change): **pre-download the RIFE ckpt into
      `/opt/ComfyUI/custom_nodes/comfyui-frame-interpolation/ckpts/` at BUILD time** in the Dockerfile (so no
      runtime HF fetch). AUDIT the same lazy-download pattern for the OTHER baked node packs (Impact-Pack/Subpack
      yolo models, KJNodes, UltimateSDUpscale) — any node that fetches a model on first use will 503 the same way
      remotely; bake those weights too. Also the `4x-NMKD-Siax` / `4x-AnimeSharp` upscale models (`installOnEngine`,
      `.pth`) are NOT in the image's `upscale_models` dir either — UPSCALE will hit the same wall; either bake them
      in the image or push them to the volume. = MPI-81 / mpi-ci image rebuild. SECONDARY (app): surface the
      `/proxy/prompt` 503 body in log+UI (it was dropped — same class as L2; would have pinned this in one look).
      NOTE: earlier "installOnEngine deps never reach the Pod" theory was WRONG — the Dockerfile DOES bake the
      universal node packs at `/opt/ComfyUI/custom_nodes` (the first check `ls`'d the volume path
      `/workspace/comfyui/custom_nodes`, which correctly holds only the per-model PainterI2V node). The build flow
      is correct; the gap is unbaked MODEL WEIGHTS for the baked nodes. `[rebuild]` + `[app]` (503-body).
      **Verify:** after the image pre-bakes RIFE (+ upscale) weights, remote interpolate + upscale submit + run
      (no 503).
      <details><summary>superseded "cause not yet pinned" note</summary>
- [ ] **B4 — Interpolate 503 on remote — cause NOT YET PINNED (earlier "installOnEngine missing" theory was WRONG).**
      FOUND LIVE 2026-06-14 (RTX 5090 Pod): interpolate failed 3× with `POST /proxy/prompt 503` /
      `Workflow failed: interpolate / null — ComfyUI Error`. ⚠️ CORRECTION 2026-06-14: an initial theory said the
      `installOnEngine: true` deps (Frame-Interpolation/RIFE, upscale models) never reach the Pod — **that theory
      is FALSE.** The mpi-ci Dockerfile (`cubric-vision-pod/Dockerfile:110-125`) DOES bake the universal
      `installOnEngine` node packs into the IMAGE at `/opt/ComfyUI/custom_nodes` — including
      `comfyui-frame-interpolation` (line 117) AND runs its `python install.py` (line 125, fetches RIFE weights) —
      and `start.sh:105` launches ComfyUI from `/opt/ComfyUI/main.py` so those baked nodes load, IN ADDITION to the
      volume `custom_nodes` (`/workspace/comfyui/custom_nodes`, per-model nodes only, via extra_model_paths
      `custom_nodes: comfyui/custom_nodes/`). The earlier `ls /workspace/comfyui/custom_nodes/` only saw the VOLUME
      path (correctly just `ComfyUI-PainterI2Vadvanced`) — the baked RIFE node lives at the UNCHECKED
      `/opt/ComfyUI/custom_nodes`. So the build flow is CORRECT and nothing was "missed." The real 503 cause is
      still OPEN — candidates: (a) `rife47.pth` not fetched by `install.py` (RIFE downloads model weights at node
      load or first run — may need internet/a specific path on the Pod); (b) the interpolate workflow's INPUT
      video (local path) not transferred to the Pod (B1 video-input transport — UNVERIFIED remotely); (c) a node
      version/param mismatch; (d) the upscale_models / interpolation model path not in extra_model_paths
      (extra_model_paths has `upscale_models: mpi_models/upscale_models/` but NO interpolation/rife model dir).
      NEXT: re-check the LIVE Pod at the RIGHT path — `ls /opt/ComfyUI/custom_nodes/` + `find /opt/ComfyUI -iname
      'rife*'` + the ComfyUI stdout/stderr for the actual validation error. The `/proxy/prompt` 503 body is dropped
      app-side (NOT logged — same class as L2 but for prompt-submit) → surfacing it would have answered this in one
      look (still worth fixing: log+UI the 503 body). `[app]` (503-body surfacing) + investigate. **Verify:** the
      real interpolate 503 reason is identified from the Pod-side ComfyUI log, then fixed.
      </details>

- [x] **B3 — ✅ DONE 2026-06-15: ALL video workflows converted off NVENC to the portable SaveVideo+SaveAudio split.**
      The app side shipped + committed 497fb89 (workflow-agnostic capture by title + server mux). On 2026-06-15 the
      USER converted EVERY remaining video workflow template + EVERY video output node (final AND preview) off
      `VHS_VideoCombine`/`nvenc_h264` to the portable native pipeline `CreateVideo → SaveVideo`:
      - **Final-output nodes** (title `Output_Video`, + optional `Output_Audio` gated by `MpiHasAudio`→`MpiIfElseInverted`
        where the op has a video input): `video_interpolate.json` (proven template, prior), `video_upscale.json`,
        `resize_video.json`, `Wan22_t2v.json`, `Wan22_t2v_stage2.json`, `Wan22_i2v.json`, `Wan22_i2v_stage2.json`.
      - **Preview nodes** (title `Preview`, no audio — throwaway preview clip): the `_ms` workflows' preview-pass
        `VHS_VideoCombine` (which ALSO used `nvenc_h264` → would have failed the remote preview stage on Blackwell)
        swapped to `CreateVideo → SaveVideo` titled `Preview` in `Wan22_t2v.json`, `Wan22_t2v_stage2.json`,
        `Wan22_i2v.json`, `Wan22_i2v_stage2.json`.
      VERIFIED (JSON read, all 4 Wan files): **zero `VHS_VideoCombine` remaining anywhere**; every video node is
      `CreateVideo`→`SaveVideo`; `Output_Video` + `Preview` titles correct. App needs NO change — `_collectComfyOutputUrls`
      already reads `videos[]` (the `Preview` capture goes through the SAME function on preview-only runs), so both the
      final and preview captures work unmodified. Per-op `latestVersion` bumped 1.0→1.1 in BOTH
      `js/core/operationRegistry.js` AND `operation_registry.json` for the 6 converted ops:
      `interpolate` (prior), `videoUpscale`, `resizeVideo`, `t2v`, `t2v_ms`, `i2v`, `i2v_ms`. **`extend` left at 1.0** —
      it is an op with NO workflow file (defined in `commandRegistry.js:191` `requiresVideo:1` but no model maps it +
      no `extend.json`) → not generation-active, nothing to convert; IF authored later it is the video-INPUT variant
      (needs `Input_Video` MpiString fan-out + `MpiHasAudio` gate + `Output_Audio`). REMAINING to fully close: a LIVE
      remote video gen on a Blackwell Pod (the whole point) — local with-audio/no-audio is the interim PASS bar
      (interpolate already proven both paths). `[owner-workflow]` + `[app]` (registry bumps). **Verify:** remote
      I2V/T2V/upscale/interpolate on a Blackwell Pod → video (with/without audio) saves + plays, no NVENC error.
      <details><summary>original B3 diagnosis + fix-proven history (kept)</summary>

- [ ] **B3 — 🔴 NVENC video encode FAILS on the Blackwell Pod (blocks ALL remote video output).** FOUND LIVE
      2026-06-14 (RTX 5090, v0.4.0-cu128, Pod i1lou7geshlv96). A remote I2V (`i2v_ms`/`wan-22-i2v`, minimal
      settings) **diffused fully end-to-end** — both stages completed, RAM peaked **94% = 52.76/55.88GiB** at the
      VAE tail with NO OOM, VRAM 61% (~19GB), then FAILED at the LAST step `VHS_VideoCombine`:
      `[h264_nvenc] OpenEncodeSessionEx failed: unsupported device (2): (no details)` /
      `[h264_nvenc] No capable devices found`. ROOT: every video workflow's OUTPUT node `VHS_VideoCombine` uses
      `"format": "video/nvenc_h264-mp4"` = NVIDIA **GPU hardware** encode; the RunPod container's ffmpeg cannot
      init NVENC on this Blackwell card (NVENC SDK / `sm_120` / container-exposure mismatch) → encode dies. The
      diffusion result was lost because the final mux failed. Confirmed via the workflow files:
      `comfy_workflows/Wan22_i2v_stage2.json:155,189`, `Wan22_t2v_stage2.json:103,137`, `Wan22_t2v.json`,
      `Wan22_i2v.json`, `video_upscale.json:69`, `video_interpolate.json:62`, `resize_video.json:101` — ALL use
      `video/nvenc_h264-mp4` on every `VHS_VideoCombine`. INPUT side is SAFE: `VHS_LoadVideoPath`
      (`video_upscale.json:107`) uses `"format": "AnimateDiff"` = a software frame-batch loader, NOT a codec — no
      NVENC on input, video-input ops decode fine remotely (answers the open "does the input node carry an
      encoding?" question — it does not). FIX is OWNER-SIDE (hard rule: agents do NOT edit `comfy_workflows/*.json`;
      the user maintains them from an external template): change the `VHS_VideoCombine` OUTPUT `format` from
      `video/nvenc_h264-mp4` → **`video/h264-mp4`** (CPU libx264 — portable, works local + any remote GPU; CPU
      encode of a few seconds of video is negligible vs diffusion time), OR swap to a save-video node with no
      codec choice. WHY T2V "passed" on L4 last session but I2V failed here: the L4 container likely exposed
      NVENC; the Blackwell container does not — NVENC is fragile per-card, CPU x264 is universal. (Re-check
      whether the L4 T2V actually NVENC-encoded or fell back.) ALSO a B0 win: the `execution_error` WS path
      surfaced this as a clean "VHS_VideoCombine failed: <exception>" + ended the gen (no silent empty output) —
      B0 live-confirmed. `[owner-workflow]`. **Verify:** after the template uses CPU h264, a remote I2V/T2V mux
      succeeds → video saves + plays on the Blackwell Pod.
      **FIX PROVEN LIVE 2026-06-14 (same 5090 Pod):** a temporary `Wan22_i2v.json` edit
      (`VHS_VideoCombine` Preview node 169 + Output node 201 `format` → `video/h264-mp4`) made the SAME minimal
      I2V run **SUCCEED end-to-end** — diffusion (latents shown), RAM peaked (~94%, no OOM), then CPU libx264
      mux completed → video SAVED + PLAYED. (Temp edits reverted immediately after; codebase matches the external
      template — agents do NOT keep `comfy_workflows/*.json` changes.) ⇒ CPU `video/h264-mp4` works on the
      Blackwell container; NVENC does not. This VALIDATES the chosen owner-side fix direction: the user will swap
      `VHS_VideoCombine` → ComfyUI vanilla **`SaveVideo`** node (codec-agnostic, picks encoding per-card
      internally) in all video workflows. SaveVideo writes to ComfyUI `output/` → APP-SIDE follow-up needed:
      fetch + garbage-collect the SaveVideo output file (the capture-node contract in `.claude/rules/comfy_injection.md`
      expects a `gifs[]` payload from `VHS_VideoCombine`; `SaveVideo` emits differently — the result-capture +
      cleanup path must be updated to read SaveVideo's output). NEXT-4090-SESSION re-test: after the SaveVideo
      template lands, run remote I2V/T2V/upscale/interpolate on a 4090 to confirm the new node + app fetch/GC.
      Diagnosis + CPU-encode fix DONE; remaining = owner template swap (SaveVideo) + app fetch/GC wiring.
      Diffusion + RAM-survival + B1 image-input transport all PROVEN on Blackwell this session.
      </details>

- [ ] **B1 — Remote input-asset transfer for non-image inputs.** Video/audio upload replacing local-path
      injection (`_resolveMediaPath`), the trimmed-video flow (trim locally via `/api/video/trim-input` then
      upload), and remote `.latent` staging replacing `/comfy/stage-preview-latent`. CODE partially SHIPPED
      (uncommitted, NOT live-verified — see current-architecture.md §10 "Remote input-asset transfer"). Source:
      plan.md Phase 4. **Verify:** an I2V workflow with a trimmed local video input AND a two-stage
      preview-latent workflow both run remotely with correct inputs; unchanged inputs preserve exec-cache.
- [x] **B2 — Run video generation remotely end-to-end. — T2V PASS 2026-06-14 (live, v0.4.0 L4).** Remote Wan 2.2
      T2V Smooth (320×176, 1s, `t2v_ms_023`) ran end-to-end on a fresh-volume v0.4.0-cu124 L4: multi-stage
      (stage1 high-noise → stage2 low-noise) completed, latent preview frames rendered in the gallery preview
      card throughout, progress + percent tracked (`GENERATING · 90% · 1:06`), video saved to the project +
      played. RAM DATA (RunPod telemetry, confirms RAM-is-the-wall): stage1 peak ~37% (21GiB), stage2 climbed
      to 79% (45.6GiB), **VAE-decode tail PEAKED at 92% = 53.68GiB / 57.74GiB cap** — completed with only ~4GiB
      headroom, NO OOM. VRAM only 14% (3GiB) throughout. ⇒ this L4's 57.74GiB container cap is MARGINAL even for
      minimal T2V; bigger res / longer / higher quality WILL OOM → advise 64GB+ RAM Pods for video (memory:
      project_video_gen_ram_wall). **STILL OPEN under B2:** I2V remote (blocked on B1 input-asset transfer);
      cancel/interrupt remote (not exercised this run); higher-res/longer T2V (will hit the RAM wall).

## C. Remote I2V ignores input image  ✅ CLOSED

- [x] **C1 — CLOSED 2026-06-14 (user-confirmed): resolved by the dep-cross fix (plan.md L163).** The
      url↔filename cross fed T2V weights into the I2V files → I2V had no image-conditioning channels → ignored
      the subject. Corrected weights → remote I2V respects the dragged subject (LIVE-VERIFIED). No further work;
      this was NOT a transport or MPI-68-split bug.

<details><summary>original C1 (kept for history)</summary>

- [ ] **C1 — Re-confirm whether this is ALREADY FIXED.** plan.md L164 (OPEN) says remote I2V reproducibly
      ignored the input subject. BUT the later dep-cross fix (plan.md L163, LIVE-VERIFIED 2026-06-13) found the
      `dependencies.js` url↔filename cross fed T2V weights into the I2V files — which would EXACTLY cause
      "ignores subject" — and says it closed the I2V-wrong-subject bug. **Action: confirm L164 is resolved by
      L163 (re-run a clean remote I2V on corrected weights).** If still wrong after corrected weights, the
      re-weighted suspect is an **MPI-68 split regression** in the i2v workflow/op wiring (investigate before
      the sage-off test); decisive USER-run test = force sage-attention OFF on remote, retry. Tracked as
      engine-config, NOT MPI-64 transport. **Verify:** clean remote I2V on corrected weights respects the
      dragged subject → close C1; else escalate to the MPI-68/sage investigation.

## D. Model-cache stacking OOM  🟢🟡  `[decision]` → `[rebuild]`

- [ ] **D1 — `--cache-lru 2` cache policy.** ComfyUI keeps every loaded model in RAM (no `--cache-*` flag set
      anywhere); switching model-type never evicts → stacks → OOM on RAM-limited Pods (confirmed live).
      `--cache-none` is OUT (breaks 1000+ sampler workflows). Leaning `--cache-lru 2`. **NEEDS a controlled
      test BEFORE building** (does it evict the old pair on switch? does it keep the Wan high+low pair within
      one multi-stage gen? does it hurt the 1k-sampler case?). Then add to Pod `start.sh` = MPI-75 rebuild.
      Source: plan.md Plan Drift 2026-06-13 (L160-161), MPI-75 brief candidate #3. **RE-CONFIRMED LIVE
      2026-06-14:** after the T2V gen COMPLETED and GPU/CPU dropped to ~0, container RAM stayed pinned at ~60%
      (~35GiB) — the loaded T2V UNet pair held resident in ComfyUI's RAM cache (no `--cache-*` flag → never
      evicts). This is exactly the stacking precondition: loading I2V on top of this 35GiB would push toward
      the 57.74GiB cap → OOM. D1 (`--cache-lru 2`) directly addresses it.
- [ ] **D2 — `/wrapper/free` + `/proxy/free` remote memory release.** Make the memory-monitor Release-VRAM /
      Ctrl-click Release-RAM (memoryOps.js → `/comfy/unload`, currently LOCAL-ONLY) work in remote mode; pairs
      with an optional app-side auto-free-on-model-switch. Also investigate why deep Release-RAM under-frees
      even locally (cache flag may fix it). = MPI-75 rebuild + app-side. Source: plan.md L161, MPI-75 #4.

## E. Custom-node restart in remote  🟡  `[rebuild]` + `[app]`

- [ ] **E1 — `/wrapper/restart-comfy` endpoint + app wiring.** Installing a per-model custom_node remotely
      never restarts ComfyUI → node stays unloaded; `_ensureRemoteReady` early-returns before the
      `comfyNeedsRestart` restart block. Needs a wrapper restart-ComfyUI endpoint (= MPI-75 rebuild); app-side,
      wire `_ensureRemoteReady` `comfyNeedsRestart` → future `/remote/comfy/restart-engine` (graceful no-op +
      "Restarting ComfyUI…" toast until the wrapper has it). Manual Disconnect→Connect is the current
      workaround. Source: plan.md Plan Drift 2026-06-13 (B1, L167/L178). **Verify (remote):** flag-check fires +
      messages "Restarting ComfyUI" (endpoint no-op until rebuild). LOCAL auto-restart path already VERIFIED
      (plan.md L167) — local half is DONE.
      - **E1a — Gate UX: demote the reconnect-required modal → info toast (app, NO rebuild).** OBSERVED LIVE
        2026-06-14 (I2V install on RTX 5090): the `_ensureRemoteReady` `comfyNeedsRestart` gate
        (comfyController.js:271-275) emits `comfy:error` → commandExecutor surfaces the FULL bug-reporter
        modal ("Generation failed" + Report-on-GitHub) for a ROUTINE "reconnect to load new nodes" state.
        Bad UX (same family as G1). FIX NOW (chosen 2026-06-14, option A): emit a plain `ui:warning`/`ui:info`
        toast instead of `comfy:error`, and do NOT throw into the bug-reporter modal. Real fix = E1 proper
        (`/wrapper/restart-comfy`, in-place, zero reconnect) on MPI-81 rebuild. `[app]` renderer-only.
      - **E1b — Reconnect-to-load-nodes is too SLOW (user finding 2026-06-14).** In-app Disconnect→Connect to
        reload nodes is so slow (Connect button stays disabled through the whole cycle + the ~30s UI-update lag,
        H1) that the user FULL-APP-RESTARTED instead to avoid losing the metered Pod — app restart reconnected
        FASTER than the in-app Disconnect→Connect path. ⇒ neither Disconnect→Connect NOR an app restart should be
        required to load a freshly-installed custom_node. Strong argument for E1 proper (`/wrapper/restart-comfy`
        in-place) over any reconnect-based workaround. Until then, document app-restart as the faster interim
        workaround. Ties to H1 (connect-display lag). `[rebuild]` for the real fix.

## F. Phase 3/4/5 structured checkboxes still open  🟡  (see plan.md for full text)

- [ ] **F1 — Step 5: manifest compatibility gate + repair/reinitialize.** `[app]` Read `/wrapper/manifest` at
      readiness, run the `volume-manifest-schema.md` decision matrix (arch/CUDA/digest → Reinitialize;
      ComfyUI/PyTorch/bundle → Repair; VRAM/DC/model-missing → Warn); gate gen on an incompatible profile.
- [ ] **F2 — Step 5.1: CUDA-floor image strategy.** `[decision]` cu124 default vs cu128+`NVIDIA_DISABLE_REQUIRE`
      vs two-image profiles. *(NOTE: plan.md L177 logs v0.3.0-cu124 "Step 5.1 PROVEN" live — confirm whether
      this decision is effectively MADE and only the doc-closeout remains.)* **UPDATE 2026-06-14 (user):
      F2 is believed already DONE (cu124 default per-card multi-image proven live). The ONE remaining
      sub-item: investigate bringing in a **CUDA 13 / cu130** Blackwell profile — most Blackwell cards in the
      data centers now run CUDA 13. This folds into MPI-75 candidate #5 (cu130 Blackwell image). So F2 itself
      = effectively closed; the cu13 Blackwell work lives as a rebuild candidate, not an open app decision.
- [ ] **F3 — Step 5.2: auto-filter unsupported cards in the GPU picker.** `[app]` Gray-out/badge cards whose
      DC-hosts can't meet the active image's CUDA floor, with a reason, instead of a Connect-time
      `nvidia-container-cli` failure.
- [ ] **F4 — Fresh-volume initialization + bundle versioning.** `[app]`+`[rebuild?]` Cubric dir layout + first
      manifest written Pod-side by the wrapper init script; refuse to run against a stale workflow/custom-node
      bundle + approved repair path.
- [ ] **F5 — Cancel-connection / stuck-boot escape.** → PROMOTED to **K1** (explicit user request, pulled out
      of the Phase-4 group so it stops hiding). See § K.
- [ ] **F6 — No-GPU "download mode" Pod.** `[app]`+`[decision]` Provision a CPU-only/cheapest Pod purely to
      download models to the volume with no GPU billing, then reconnect a GPU Pod. Open Qs: does
      `client.createPod` accept `gpuCount:0` on Secure Cloud? UI affordance? gate generation OFF in
      download-mode? Source: plan.md Phase 4 (L145).
- [ ] **F7 — Phase 5 hardening (3):** (a) integration/mocked tests for lifecycle + wrapper error states
      (bad key, unavailable GPU, stale manifest, stopped Pod, wrapper-not-ready, mid-gen network loss,
      interrupt, quit cleanup); (b) secret-hygiene end-to-end audit (logs + `logs/app.log` + bug-reporter
      payloads never carry the API key/wrapper token; add redaction); (c) user-facing cost/responsibility
      docs/settings copy (billing/key/storage are the user's; stopped Pods still bill storage; Community Cloud
      unsupported).
- [~] **F8 — Verify lifecycle cleanup on quit/crash. — DELETE-ON-QUIT PASS 2026-06-14 (live).** With
      "Delete Pod on quit" ON, quitting the app DELETED the tracked Pod immediately (console-confirmed gone;
      volume persists). app.log: `teardown: delete-on-quit — deleting tracked Pod bz5urxbe0xryp5 + sweeping` →
      `teardown delete done: reaped=none` → `action=delete ok=true`. Clean, no orphans. STILL UNVERIFIED (own
      follow-up): (a) box-OFF warm-stop (EXITED) path this session; (b) simulated-crash → idle-watchdog backstop
      (~15min, takes time); (c) cost warning copy. Core delete-on-quit path PROVEN.

## G. Cosmetic / polish  🟢  `[app]` / `[rebuild]`

- [ ] **G1 — Downgrade the "Restarting ComfyUI" / restart-info modal to a plain info toast.** It reuses the
      `ui:error` bug-reporter modal (Report-on-GitHub + Error Summary) for an INFO event. (User chose to KEEP
      the B4-drop modal as-is; this is the restart-info one only.) Source: plan.md L167, arch §10.
- [ ] **G2 — "Stopping…" toast** for the ~5s gap between Stop and the Pod actually interrupting. Source:
      plan.md L173.
- [x] **G3 — `POST /wrapper/models/delete` remote uninstall — PASS 2026-06-14 (live, v0.4.0).** Full end-to-end
      verified on a live RTX 5090 Blackwell Pod (cu128, Pod dacaf7fa4f7a, vol 14kabihaki). See L6 for the proof.
      = MPI-75 #1 shipped. Source: arch L406, MPI-75 brief.
- [ ] **G4 — aria2c fast model download** `[rebuild]` — wrapper `_run_install` → aria2c (`-x16 -s16`, ~10-40×
      the httpx path) with httpx fallback; Dockerfile apt installs `aria2`. Biggest remote-UX win. = MPI-75 #2.
      Source: MPI-75 brief #2.
- [ ] **G5 — Step 4.3.1 live-verify** `[verify]` — volume-delete-with-attached-Pod code is in; live verify was
      deferred to a follow-up test (delete attached Pod first, then the volume; both gone in console, no
      "attached" error). Source: plan.md L133.
- [ ] **G6 — First-Connect-on-a-new-image-tag 504** (image pull > 300s timeout; reconnect warm-resumes) +
      GPU-availability-refresh-on-dropdown-open — UX follow-ups noted at the remote-image-gen verify.
      Source: plan.md Phase 4 (remote image gen entry).

## H. Residual / accepted  🟢

- [ ] **H1 — ~30s connect-display lag.** Between the Pod actually being ready and the app showing connected
      (wrapper-health poll 4s interval + 5s fetch timeout + preview-WS handshake stacking). User flagged
      not-a-concern; left as-is to avoid risking the connect-correctness logic. Source: handoff residual,
      arch §10 L341.
- [ ] **H2 — MPI-73 Bug 2 no-promptId Stop** verified by code trace, NOT a live repro (the new Cue-disable
      largely prevents reaching that UI state). Confirm live if a fresh case appears. Source: handoff.
- [x] **H3 — Settings slide-over closes on any pop-up open → MOVED to card MPI-79 (2026-06-14).** Generalized
      by the user to ALL slide containers (Settings + Queue + About + Hotkeys — same component). Full diagnosis
      + fix options copied to `tasks/MPI-79/brief.md`. To be worked in a separate parallel session. No longer
      tracked here.

## I. Knowledge / commit hygiene debt  🟢  `[hygiene]`

- [ ] **I1 — Commit the uncommitted user-verified fixes.** Several Plan Drift fixes are user-verified but NOT
      committed: dep-cross url/sha swap (L163), reuse-prompt op-authoritative (L158), empty-picker fallback
      (L169), local-`_ms`-after-Disconnect mode-flip (L165). Commit pass needed (user-authorized per fix).
- [ ] **I2 — Remove Bug B TEMP-DEBUG** once Bug B is fixed — gated behind `localStorage.MPI_DEBUG_BUGB='1'`
      (generationService.js exec.onComplete + 5 points in MpiGalleryBlock.js). Source: arch §10 L380, handoff.
- [ ] **I3 — At FINAL mpi-end-session: promote `current-architecture.md`** into durable docs/rules/memory.
- [ ] **I4 — `docs/releases/UNRELEASED.md`** fold at the next `/mpi-version-bump` (MPI-73 connect-readiness +
      feedback belong in the next release notes).
- [ ] **I5 — Consider a project memory note for `state.remoteEnginePhase`** (new canonical state key driving
      Cue-disable + connect feedback) if it becomes load-bearing across more surfaces.

## K. Explicit user requests  🟡  `[app]`

Standalone items the user directly asked an agent to log — pulled out of the Phase groups so they stay visible.

- [ ] **K1 — Cancel button while a connection is in progress (USER REQUEST).** A Pod can stick at RunPod's
      "Initializing your pod…" for >5 min on a bad host/volume (RunPod-side); the user is then trapped — Connect
      is disabled (the `_starting` flag spans the whole boot) with no way out but killing the app. Add: (a) a
      **Cancel** button next to Connect that aborts the in-flight create/reconnect — delete the half-started
      Pod, clear `_starting`/`_connecting`, re-enable Connect; and/or (b) **auto-cancel the in-flight connection
      when the user picks a different GPU** so they can immediately Connect to another card. Needs a boot
      **watchdog/poller**: while `_starting`, poll RunPod Pod status + wrapper `/health` every ~2-3 min; if no
      progress past a threshold, surface a "taking too long — Cancel and try another GPU" prompt. Tie into the
      existing `_starting` flag + `/remote/comfy/status` poll. Source: plan.md Phase 4 (L144), user re-flagged
      2026-06-14. **Verify:** a Pod stuck initializing >threshold lets the user Cancel (Pod deleted, no orphan
      billing, Connect re-enabled) and/or switch GPU without restarting the app; a healthy fast boot is
      unaffected (no premature cancel).

## L. Found live 2026-06-14 (fresh-volume session)  🟡

- [x] **L6 — ✅ CLOSED 2026-06-14 (live, v0.4.0): remote UNINSTALL works end-to-end.** The prior "did nothing"
      was the TWO-STEP CONFIRM (test artifact, exactly as diagnosed), NOT a code bug. RE-TEST on a live RTX 5090
      Blackwell Pod (cu128, Pod dacaf7fa4f7a, vol 14kabihaki): card UNINSTALL → confirm dialog APPEARED
      ("Uninstall model", "Also delete model files from disk" checked) → OK → ✅ app.log:
      `[INFO] [download] remote uninstall wan-22-t2v: removed 4, kept 3 universal, 0 shared` (the v0.4.0 success
      path at downloadManager.js:1009, NOT the old `:1000` unsupported fallback — yesterday's v0.3.x press logged
      `wrapper has no delete endpoint` at app.log:861-862, so the contrast confirms the fix is real) → ✅ POD
      TERMINAL: `/workspace/mpi_models/diffusion_models/`, `vae/`, `text_encoders/` ALL EMPTY (`total 1`, dir
      mtime 11:45 = the delete) → ✅ UI flipped to not-installed + Models count decremented + toast. Files truly
      wiped from the volume (not just a UI flip). MPI-75's comment-only fix + forward-compatible logic both
      validated. **G3 also marked PASS.** No remaining work; L6/G3 done.
      <details><summary>original L6 FAIL report (kept for history)</summary>
- [ ] **L6 — 🔴 Remote model UNINSTALL does NOTHING (G3 FAIL on v0.4.0).** Pressing UNINSTALL on an installed
      model in remote mode: (a) UI does NOT change (still "INSTALLED", Models still 1/7); (b) the model files
      are STILL on the volume — Pod terminal confirmed `Wan_22_t2v_High.safetensors` + `Wan_22_t2v_Low.safetensors`
      + vae + text-encoder all still present under `/workspace/mpi_models/diffusion_models/` AFTER the uninstall
      press; (c) NO backend log entry at all (app.log line count unchanged) → the uninstall did NOT reach the
      backend remote-delete route. So the `/wrapper/models/delete` endpoint shipped in v0.4.0 is NEVER CALLED —
      the app-side UNINSTALL button does not route to the remote delete path in remote mode (or the request
      dies before the backend logger). This DEFEATS the headline MPI-75 v0.4.0 feature (G3) and the 80GB-volume
      management story.
      ROOT — DIAGNOSED 2026-06-14 (code read, re-test pending). The chain IS wired: card UNINSTALL
      (`MpiModelManager.js:237`) → opens a SECOND MpiOkCancel confirm dialog → its OK (`:81`) →
      `downloadService.uninstall()` (`downloadService.js:80`) → POST `/comfy/models/uninstall` → backend remote
      branch (`downloadManager.js:968-1011`) → `remoteUninstallDep` → POST `/wrapper/models/delete`
      (`remoteModels.js:289`). KEY EVIDENCE: app.log line count did NOT change on the Uninstall press →
      the request NEVER reached `/comfy/models/uninstall` (which logs on BOTH the success `:1008` AND the
      unsupported `:999` paths). ⇒ failure is BEFORE the backend — most likely the TWO-STEP confirm: the card
      button only OPENS the dialog; the request fires on the dialog's "Uninstall" OK. So "did nothing" =
      either the confirm dialog didn't appear (bug) OR it appeared and wasn't confirmed (test artifact).
      RE-TEST: press card UNINSTALL → does the confirm dialog show? → click its Uninstall → THEN check app.log
      + volume. SEPARATE, CONFIRMED stale issue regardless: `downloadManager.js:962-967` + `remoteModels.js:272-275`
      comments/handling still say "`/wrapper/models/delete` does NOT exist yet (needs an image rebuild)" and
      return `remoteUnsupported:'uninstall'` — but that endpoint NOW SHIPS in v0.4.0/wrapper-0.2.3, so the stale
      fallback should be updated = MPI-75 app-side coupling (assigned to the MPI-75 agent via message, 2026-06-14).
      NOTE: real volume path is `/workspace/mpi_models` (UNDERSCORE), models under `diffusion_models/`, `vae/`,
      `text_encoders/`; manifest at `/workspace/cubric/manifest.json`. `[app]`. **Verify:** card Uninstall →
      confirm dialog → OK → request logs → `/wrapper/models/delete` deletes files from the volume → card flips
      to not-installed → count decrements.
      </details>


- [~] **L1 — RTX PRO 4500 `createPod` 400 = RunPod-side host/availability constraint (NOT our spec).**
      RECLASSIFIED 2026-06-14 (MPI-75 live test, msg 9d976b3b): a live **RTX 5090 (Blackwell, sm_120) Connect
      returned HTTP 201** (podId i1lou7geshlv96) on the SAME DC (EU-RO-1), SAME volume (`14kabihaki`), SAME
      cu128 image the PRO 4500 got a 400 on. ⇒ the 400 is NOT a cu128 image-spec bug, NOT a v0.4.0 regression,
      NOT an EU-RO-1/volume problem, NOT our create spec — it is **RTX PRO 4500-host-specific** (RunPod capacity/
      host/availability for that exact card at that moment). App side is correct; root cause sits on RunPod's
      side. L2 (now shipped) will print the exact 400 reason if it recurs. **Remaining:** retry the PRO 4500
      later and read the surfaced reason to confirm; no app fix expected. Original "cause unknown" write-up below.
      <details><summary>original L1 (cause unknown)</summary>
- [ ] **L1 — Blackwell RTX PRO 4500 `createPod` returns HTTP 400 (cause unknown).** During the 2026-06-14
      validation, Connect on an RTX PRO 4500 Blackwell (EU-RO-1, fresh volume `14kabihaki`) → app.log:
      `Pod image for NVIDIA RTX PRO 4500 Blackwell: …:v0.4.0-cu128` (arch routing CORRECT) →
      `createPod REST -> http 400 ok=false` → `Pod create refused: create returned 400`. NOT YET DIAGNOSED —
      cause unknown. Candidates: (a) the APP's create spec (ports/env/containerDisk/template fields) being
      rejected for a Blackwell card vs what the console form sends; (b) a Blackwell+network-volume constraint
      in EU-RO-1; (c) a transient capacity reject. NOTE: the user saw the RunPod console's deploy form attach a
      network volume generally, but did NOT specifically confirm the volume attaches to a PRO 4500 Blackwell —
      so (b) is NOT ruled out. CANNOT pin without the RunPod error body, which the app drops (see L2).
      **Action:** once L2 surfaces the body, re-Connect a Blackwell card and read the real reason; if needed,
      replicate the app's exact create spec (Cubric image + volume + ports/env) in the console to compare.
      Workaround for now: use a non-Blackwell (cu124) card. **Verify:** Blackwell create either succeeds or
      fails with a clear, surfaced reason. NARROWED 2026-06-14: an **L4 (cu124) create SUCCEEDED (HTTP 201,
      podId dddqjpujszoj06, same DC + same volume `14kabihaki`)** in the same session → the 400 is
      Blackwell-spec-specific, NOT a v0.4.0 regression and NOT a volume/DC problem. Points at either the cu128
      image spec or a Blackwell host/availability constraint on Secure Cloud in EU-RO-1.
      </details>
- [x] **L2 — ✅ DONE 2026-06-14 (committed `2c2fb1a`, live-confirmed): `createPod` error body surfaced.**
      MPI-75 agent added `_createRejectReason` in `routes/remoteProxy.js` `_createPodInternal` — a 400 now logs
      `reason="…"` (RunPod's `json.error`/`json.message`) AND shows it in the connect dialog (`data.message`,
      MpiSettings.js:578). Verified live: the 5090 success path logged `http 201 … podId=i1lou7geshlv96` cleanly;
      a future 400 will carry the real reason. This is what makes L1 self-diagnosing on retry.
      <details><summary>original L2</summary>
- [ ] **L2 — `createPod` 400/error path drops RunPod's error body (log + UI).** `routes/runpodRemote.js _rest`
      DOES capture the response body (`{status, ok, json}`), and `/runpod/pods` returns `r.json` to the caller
      — but `routes/remoteProxy.js` `_createPodInternal` logs only `create returned 400` and the UI dialog
      shows a generic "Could not …" with no reason. Surface RunPod's `json.error`/`json.message` in BOTH the
      app.log line AND the failure dialog so a create-reject is self-diagnosing. NOTE: the fix is in
      `routes/remoteProxy.js` = the **build agent's MPI-75 file** (currently uncommitted v0.4.0 edits) —
      COORDINATE before editing; do not clobber their work. `[app]`. **Verify:** a failed create shows the
      actual RunPod reason in the log and the dialog.
      </details>

- [ ] **L3 — Connect ETA messaging mismatch (first-boot vs warm-resume).** During the 2026-06-14 L4 connect on
      a FRESH volume, the user-facing feedback indicated ~90-120s, but a first connect on a fresh volume + new
      arch actually takes ~5-15 min (sage-attention compile per-arch written to the volume + cold image pull,
      stacked). The ~90-120s figure is the WARM-resume time (same arch, sage already compiled). Risk: on a real
      first connect the user thinks it hung and kills it. The Step 5.1 readiness messaging was meant to
      distinguish "compiling accelerators (one-time, several minutes)" from the image pull and from a warm
      resume — make the displayed ETA/copy reflect first-boot-compile vs warm-resume so the long first connect
      doesn't read as a hang. `[app]`. **Verify:** a first-boot connect shows a several-minutes one-time-compile
      message; a warm resume shows the short ETA. **DOWNGRADED 2026-06-14:** the CREATE-path copy is actually
      GOOD — observed live: "First-time setup: downloading the engine and optimising it for your GPU (one time,
      a few minutes — much faster next time). Hang tight…" + toast "Setting up the engine for your GPU (one
      time)…". So the create path already distinguishes first-time-per-GPU setup from warm resume. The only
      residual concern is whether the BOOT auto-reconnect path (the earlier flat ~90-120s on the deleted-Pod
      boot) is as accurate — low priority. Mostly RESOLVED.

- [ ] **L4 — No download-speed (MB/s) readout in REMOTE mode.** Local model downloads show a live speed
      (MB/s); remote (wrapper-driven aria2c) installs show only the size progress bar (e.g. `32.7GB / 36.5GB`),
      no rate. Found 2026-06-14 validating G4 — could not quote an aria2c throughput number because the UI
      doesn't surface it remotely. The wrapper's `models:install-progress` SSE could carry a bytes/sec (or the
      app could derive it from successive progress ticks) and map it onto the same `download:*` speed field the
      local UI already renders. `[app]` (+ maybe wrapper for a native rate = `[rebuild]`; app-side derivation
      from tick deltas needs no rebuild). **Verify:** a remote model install shows a live MB/s like local.
      (Observed qualitatively: aria2c burst ~31GB in seconds then a slower tail = the expected multi-connection
      curve, clearly faster than the old linear httpx crawl — G4 win confirmed in shape, just not numerically.)

- [ ] **L5 — Status-poll false-negative flips UI to `local · offline` for one tick mid-download.** Found live
      2026-06-14: during a heavy aria2c model download the bottom-left badges flickered `remote · online` →
      `local · offline` (still "0/7 models") → back to `remote · online`. The engine never actually dropped —
      the download bar kept advancing throughout. ROOT (likely): the connection feed (`_initRemoteConnectionFeed`,
      `js/shell.js`) polls `/remote/comfy/status` every 5s with a 4s `FETCH_TIMEOUT_MS`; under download load one
      status fetch returned not-ready or timed out → the feed emitted `connected:false` on a SINGLE failed tick →
      hero/status bar flipped to local immediately → next poll recovered. A single transient not-ready should NOT
      declare offline. FIX: require N consecutive failed/not-ready polls before flipping to disconnected, and/or
      treat a known-active download as keep-alive. NOTE: this is DISTINCT from A1 — A1's `remote · disconnected`
      only fires on `remote:engine-dropped` (real WS death); this flicker correctly did NOT trigger A1 (it went
      to plain `local · offline` via the feed), which is why it's a separate feed-debounce bug. `[app]`,
      renderer-only. **Verify:** a brief status-poll blip during a download (or any transient) does not flip the
      UI to offline; only a sustained (N-tick) loss does.

## J. Bug B (parked — could NOT reproduce)  🟡  `[app]`

- [ ] **J1 — Intermittent Create-From double-card / preview-card-consumed.** Gen-config is provably correct →
      a GALLERY RENDER/PLACEHOLDER RACE, not deterministic. Could NOT repro. TEMP-DEBUG is LEFT IN, gated OFF
      behind `localStorage.MPI_DEBUG_BUGB='1'`. When it recurs: flip the flag, reload, repro, diff vs the
      healthy baseline captured in plan.md; fix; then do I2. Source: handoff, plan.md Plan Drift, arch §10.

---

## Connected cards (tracked on the board, not duplicated here)

- **MPI-75** — Pending Pod-image rebuild batch (USER-run, one build): `/wrapper/models/delete` (G3),
  aria2c (G4), `--cache-lru 2` (D1), `/wrapper/free` (D2), cu130 Blackwell (future). At rebuild bump
  wrapper 0.2.2→0.2.3 in BOTH mpi-ci build-arg AND `routes/remoteProxy.js`.
- **MPI-74** — Per-model engine routing (local image + cloud video). BLOCKED on MPI-64.
- **MPI-71** — Investigate Vast.ai as RunPod fallback/replacement.
- **MPI-69** — High-VRAM full-model variants (for RunPod full-quality).
- **MPI-72** — OS notifications (in `doing`, awaiting-verification — not MPI-64).
