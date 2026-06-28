# v0.9.0/v0.10.0 Pod batch — bump ComfyUI v0.26.0 FLOOR first, then bake sage + VRAM on top

Owner card: **MPI-139** (the floor). Phase 2 cards: **MPI-145** (sage), **MPI-146** (VRAM).
**Two image builds**, floor first. Reordered from the original handoff (perf-first) because
v0.26.0 changes the ground the perf fixes stand on — verified in the release notes below.

## Why floor-first (the reorder)

Original handoff said: fix sage + VRAM (v0.9.0), THEN bump v0.26 (v0.10.0). User correctly
flipped it: bump FIRST. Confirmed from the v0.26.0 release notes (read 2026-06-26) — v0.26.0
moves the foundation sage/VRAM sit on:

- **PR #14577 "try native formats instead of disabling dynamic vram" + #14594 "more accurate
  memory usage factor"** → ComfyUI's MEMORY MANAGER changed. MPI-146 (lowvram/normalvram
  tuning) must be tuned against THIS manager, not the old one. Tuning then bumping = wasted.
- **PR #14459 "Move comfy sys path insert to custom node loading"** → custom-node LOADING
  changed. Our 8 baked node pins all load via custom_nodes → must re-verify they import.
- **PR #14547 "Rename a bunch of nodes" + #14460 categories** → core node renames can break
  saved-workflow `class_type` refs (our LTX-2.3 workflow JSON). Verify the workflow still loads.
- Sage source-build recompiles against the new torch anyway → build it ONCE, on the final stack
  (Phase 2), not before the bump.

So: build A = v0.26 floor (stable + LTX still works), build B = sage + VRAM on the stable floor.

## Current State

- Live floor: image v0.8.1 / wrapper 0.2.14, ComfyUI **v0.25.1** (lock `eca4757`), frontend
  1.45.15, templates 0.10.0. Remote LTX-2.3 fully works (t2v/i2v/4K verified 5090-cu128 +
  4090-cu124). App `routes/remoteProxy.js` → v0.8.1 / 0.2.14.
- Source of truth for core+node pins: `dev_configs/node_lock.json` (the Pod build copies it).
  Bump THERE, not in the Dockerfile.
- 8 baked node pins (node_lock.json): ComfyUI-LTXVideo, MpiNodes, VideoHelperSuite, Impact-Pack,
  KJNodes, UltimateSDUpscale, Frame-Interpolation, Impact-Subpack.

### Local v0.25.1..v0.26.0 diff findings (verified 2026-06-26, scratchpad clone)

- **LTX core nodes safe:** `nodes_lt.py` (+`_upsampler`/`_audio`) changed but NO `class`/
  `NODE_CLASS_MAPPINGS`/`RETURN_`/`INPUT_` changes — internals only. Our baked LTX workflow's
  `class_type` refs do NOT break on v0.26. (Low risk.)
- **#14459 nodes.py "sys-path" change is just an INDENT** — `sys.path.insert(...,"comfy")` moved
  INTO a function, same insert, not removed. Custom-node loading path unchanged. Our 8 baked pins
  load the same way. (Low risk — downgrade the earlier "loading changed" concern to a smoke check.)
- **#14577 dynamic-vram + native fp8 is the REAL memory-mgr signal (ties to comfy-kitchen):** the
  new warning deprecates `--disable-dynamic-vram` ("will be removed soon") and pushes "native
  ComfyUI formats like fp8 will be faster even if larger than your memory." comfy-kitchen's probe
  (the line the user pasted) advertises exactly the fp8/nvfp4/svdquant quant kernels this path
  uses. → On v0.26, "normalvram + dynamic-vram + native fp8" may beat old "--lowvram streaming"
  on big cards. STRONG input for MPI-146: tune VRAM mode against THIS path, and consider whether
  the Pod should stop forcing --lowvram and let dynamic-vram + fp8 do the work on 32GB+ cards.

### v0.26.0 facts pulled from the release (load-bearing)

- **torch: UNPINNED** in requirements.txt (line 4) — we re-pin per profile as today. No torch surprise.
- **kornia: `>=0.7.1` UNPINNED** → fresh resolve pulls 0.8.3+ → re-breaks LTXVideo
  (`kornia.pyramid.pad` removed in 0.8.3). **KEEP our kornia==0.8.2 pin.** ← the "K dep" the user remembered.
- **frontend `==1.45.19`** (was 1.45.15), **workflow-templates `==0.10.3`** (was 0.10.0) — sync node_lock.
- Dep deltas on rebuild: `comfy-embedded-docs` 0.5.4→0.5.5, frontend 1.45.15→1.45.19,
  templates 0.10.0→0.10.3. `comfy-kitchen==0.2.10` and `comfy-aimdo==0.4.10` UNCHANGED 0.25.1↔0.26.0.
- **comfy-kitchen = RESOLVED NON-ISSUE** (MPI-131 reply 42f1d692, confirmed from logs/app.log
  lines 146-148/754-756/1169-1171/1312/1331). It NEVER errored — guilt by association: the benign
  `[INFO] available:True disabled:False unavailable_reason:None` probe line was just on-screen next
  to the MPI-144 VRAM OOM dialog (the real failure, already fixed by --lowvram in v0.8.1). fp8
  (e4m3fn/e5m2) is a NATIVE hw op; mxfp8/nvfp4 are EMULATED — a capability report, not an
  attempt-and-fail. The workflow's gemma encoder is fp8 and comfy-kitchen services it cleanly.
  → Drop comfy-kitchen from the plan; keep only a one-line smoke check (below).
- **No sage/triton in requirements** (never were — we build sage ourselves; independent of bump).
- v0.26 adds core support for new image models **Krea2** (PR #14589) + **Boogu-Image**
  (PR #14523/#14529) — NOT onboarded here (deferred, see removed Phase 1.5); future card when tested.
- LTX2 context-windows + IC-LoRA (PR #13325) = opportunity, NOT required; defer an LTXVideo pin bump.

## Decisions (locked with user)

1. **Two builds, floor first** (option A).
2. Sage: BAKE into Pod Dockerfile per profile — cu124 `ARCH=8.6;8.9`, cu128 `ARCH=12.0`. (Phase 2)
3. Sage: enable BOTH profiles, gate off per-profile only on a real live regression. (Phase 2)
4. VRAM: `<=24GB → --lowvram`, `>=32GB → --normalvram`, default lowvram on detect-fail. (Phase 2)
5. Scope: this card-chain = v0.9.0 (floor) + v0.10.0 (perf). Nothing else.

---

## Phase 1 — v0.9.0 floor: bump ComfyUI v0.26.0 (MPI-139)

- [x] **Bump the lock:** DONE 2026-06-26. `dev_configs/node_lock.json` → core tag `v0.26.0` +
  commit `f6c162ddcfbd7eefb39c06fe5b8d4c46e8d09f40`; frontend `1.45.19`; templates `0.10.3`.
  ALSO bumped `dev_configs/system_dependencies.json` engine.version `0.25.1`→`0.26.0` (local
  portable engine — global bump per user). kornia 0.8.2 pin lives in the Pod Dockerfile +
  routes/downloadManager.js (NOT node_lock) — untouched, survives. Builder image bump deferred →
  carded as **MPI-148**. **Verified:** `release:check` PASSED (exit 0); both JSON parse; ESM
  import of dependencies.js loads clean + lockUrl resolves; node_lock core.tag consumed by the
  Pod build (build-pod-image §49) and engine.version by pre_release_test.py:454 — both live pins.
- [~] **Desk-check DONE 2026-06-26 (requirements, no Pod):** all 8 baked nodes' requirements.txt
  checked against v0.26 — NONE pin `comfyui`/`comfy-kitchen`/`comfy-aimdo`/`comfyui-frontend` or
  declare a core-version ceiling v0.26 violates. Only floats are kornia (LTXVideo + Frame-Interp,
  both unpinned) → already corrected by the Dockerfile's explicit kornia==0.8.2 after node reqs.
  MpiNodes + UltimateSDUpscale have no requirements.txt (404) + `installRequirements:false` → never
  pip-installs. → NO node will block the v0.26 BUILD on a dep conflict. Remaining risk is purely
  runtime IMPORT (a node's code hitting a changed core API) — low per the diff (LTX nodes unchanged,
  #14459 node-loading is a no-op indent) — confirmable only on a live Pod (next, user-gated).
- [ ] **Re-verify the 8 node pins IMPORT on 0.26 (live Pod)** — the #14459 sys-path-loading change is the risk.
  Cheapest path: bump the BUILDER Pod (already a v0.25.1 authoring box) to v0.26.0 +
  `install_nodes.sh`, restart ComfyUI, watch the load log for import failures. **Verify:** all 8
  packs load, no "Unknown pack"/ImportError; the LTX-2.3 workflow JSON opens with no
  missing-node (catches #14547 renames).
- [ ] **App-side dep URLs:** `js/data/modelConstants/dependencies.js` builds node download URLs
  from node_lock — confirm the new core tag/frontend resolve. **Verify:** dep-hash check
  (`mpic-compute-dep-hashes` if any new hashes needed) + app boots against the new lock.
- [ ] **MPI-149 (FOLDED IN — blocker): fix the kornia pipPins-drop on the engine-upgrade path.**
  The v0.26 local upgrade left kornia 0.8.3 → LTXVideo `pad` ImportError because `dep.pipPins`
  (`kornia==0.8.2`, dependencies.js:270) is dropped from the runtime `modelJob.deps` shape, so the
  enforce block at downloadManager.js:1308 never fires on upgrade. FIX: carry `pipPins` through to
  the `modelJob.deps` objects when the engine-deps job is assembled. **Verify:** trigger an engine
  upgrade (or re-run the deps install) → log shows `pip pins installed for ComfyUI-LTXVideo:
  kornia==0.8.2` → engine has kornia 0.8.2 → `pad OK` → LTXVideo nodes register. (Dev box already
  manually patched to 0.8.2 to unblock the LTX test; this is the durable code fix.)
- [ ] **comfy-kitchen smoke check** (was flagged as a concern; RESOLVED non-issue per MPI-131).
  Just confirm on the Build-A Pod that comfy-kitchen still probes clean: `available:True,
  disabled:False, unavailable_reason:None`. No fix needed — this is a regression sentinel only.
- [ ] **Build A (cu124+cpu CI, cu128 LOCAL — user-gated `build-pod-image`).** Tag image **v0.9.0**.
  Bump app `POD_IMAGE_VERSION v0.8.1→v0.9.0` in `routes/remoteProxy.js` (wrapper stays 0.2.14 —
  no wrapper change in Phase 1). Update `cubric-vision-pod/README.md`.
- [ ] **Verify Build A live (gate before Phase 2):** fresh Pod each arch — ComfyUI 0.26 boots,
  the existing LTX-2.3 i2v still generates correctly (output saved, not just "succeeded"). This is
  the STABILITY GATE. Do NOT start Phase 2 until LTX works on the v0.26 floor.

## Phase 1.5 — REMOVED (Krea2/Boogu deferred)

Krea2 + Boogu-Image were dropped from this card 2026-06-26 (user). They were only noted because
v0.26 *adds core support* for them — but they still need real testing + workflow authoring and have
NO concrete model facts yet (weights URLs, sizes, node deps, workflows). Authoring defs from nothing
would invent garbage. Re-card as a future model-onboarding task when they're ready to test. Build A
is now a bare v0.26 floor (Phase 1 → Build A → gate), nothing else rides it.

---

## Phase 2 — v0.10.0 perf: bake sage (MPI-145) + per-card VRAM (MPI-146) on the v0.26 floor

Only start after the Phase 1 stability gate passes. Full detail in
`.agents/mpi-kanban/tasks/MPI-145/plan.md` (kept as the Phase-2 sub-plan).

- [ ] **Sage (MPI-145):** bake per-profile source-build into `cubric-vision-pod/Dockerfile`
  (port `cubric-vision-builder/Dockerfile:91-99`, split arch list by CUDA_PROFILE). Gut the
  start.sh runtime compile → cheap import-probe. Builds against v0.26's torch.
- [ ] **VRAM (MPI-146):** wrapper `_build_cmd` picks `--lowvram`(<=24GB)/`--normalvram`(>=32GB)
  from the live card; tune the split against v0.26's NEW memory manager (#14577/#14594).
- [ ] **Build B (v0.10.0):** bump wrapper 0.2.14→0.2.15 + app `POD_IMAGE_VERSION v0.9.0→v0.10.0`.
- [ ] **Verify Build B live:** 5090-cu128 (`--use-sage-attention`+`--normalvram`, faster); 4090-cu124
  (`--use-sage-attention`+`--lowvram`, no OOM, sage faster than SDPA).

## Completed

- [ ] Nothing yet.

## Remaining Work

- Phase 1: lock bump ✅ → POD_IMAGE_VERSION v0.9.0 bump ✅ (remoteProxy.js) → Build A (live, user-gated)
  → stability gate (LTX-2.3 i2v gens clean on fresh v0.26 Pod) + MPI-149 live-verify + comfy-kitchen smoke.
- Phase 2: sage (MPI-145) + VRAM (MPI-146) → Build B (v0.10.0) → perf verify.
- (Phase 1.5 Krea2/Boogu removed — deferred to a future model-onboarding card.)

## Plan Drift

- 2026-06-26: REORDERED to floor-first. Original handoff/MPI-145 plan was perf-first (v0.9.0
  sage+VRAM, v0.10.0 bump). User flipped it; release-note review confirmed v0.26 changes memory
  mgmt (#14577/#14594) + node loading (#14459) → perf fixes must sit on the bumped stack.
  Batch ownership moved from MPI-145 to MPI-139. MPI-145's plan is now the Phase-2 sub-plan.
- 2026-06-26: Confirmed kornia stays pinned 0.8.2 (v0.26 requirements ship `kornia>=0.7.1`
  unpinned → would pull 0.8.3 → LTXVideo `pad` import break).
- 2026-06-26: REMOVED Phase 1.5 (Krea2 + Boogu-Image defs). They have no concrete model facts yet
  (weights/sizes/nodes/workflows) and still need live testing — only mentioned because v0.26 adds
  core support. Build A is now a bare v0.26 floor. Krea2/Boogu → future model-onboarding card.
- 2026-06-26: Bumped POD_IMAGE_VERSION v0.8.1→v0.9.0 in routes/remoteProxy.js (wrapper stays 0.2.14).
  Two-build order KEPT (user): Build A = v0.26-only floor stability gate; Build B = sage+VRAM (v0.10.0).

## Local v0.26 upgrade — live result (2026-06-26)

- App auto-upgraded local engine to v0.26.0 on open (no install button — version-check
  needsUpgrade auto-fires). Succeeded: version stamp `0.26.0`, `extra_model_paths.yaml` →
  `G:\CubricModels` (user's custom root PRESERVED ✓), "Engine provisioning complete". All 8
  baked node packs + PainterI2V extracted + pip-installed, no ImportError during install.
- 🔴 **kornia bug caught:** the upgrade left kornia at **0.8.3** (LTXVideo req unpinned) → `pad`
  ImportError → LTXVideo would fail (`Stage1_Bypass not found`). The `pipPins: kornia==0.8.2` fix
  DID NOT FIRE on the upgrade path — `dep.pipPins` is dropped from the runtime `modelJob.deps`
  shape. Root-caused + carded as **MPI-149** (HIGH, ship risk — breaks LTXVideo on every engine
  update). MITIGATED on the dev box: manually ran `kornia==0.8.2` in the engine → `pad OK`. Local
  LTX test now UNBLOCKED. NOT a v0.26 regression.
- STILL TO CHECK (live, user): start ComfyUI + run an LTX-2.3 gen on the v0.26 floor — confirm the
  8 nodes register (esp. LTXVideo) + a clean gen + comfy-kitchen probes clean. THEN the v0.26
  floor is verified and Build A can proceed.

## Verification

**Verify mode:** user-ux

Verified on live RunPod Pods (user-gated builds + Pod create; "LTX still works" and "faster, no
regression" are user judgments). Two gates: (1) Phase 1 stability gate — LTX-2.3 i2v still
generates correctly on the v0.26 floor before any perf work; (2) Phase 2 perf gate — sage + the
right VRAM flag, faster sampling, no OOM, per the MPI-145 sub-plan.

## Preservation Notes

- gotcha after Phase 1: "ComfyUI v0.26 ships `kornia>=0.7.1` unpinned → keep the 0.8.2 pin or
  LTXVideo's `pyramid.pad` import breaks. v0.26 also moved custom-node sys-path loading (#14459)
  and changed the memory manager (#14577/#14594) — re-verify node imports + retune VRAM after a bump."
- gotcha (the comfy-kitchen incident — pending root cause): "`comfy-kitchen==0.2.10` is a CORE
  ComfyUI dep present and IDENTICALLY pinned in BOTH v0.25.1 and v0.26.0 — it is NOT a version
  marker and NOT Manager-related (product Pod has no Manager). A comfy-kitchen error on a
  pinned-core product Pod is therefore an install/import/runtime failure of that dep, not version
  skew. Read the container log line before theorizing (MPI-143 lesson)." (Finalize this entry
  once the log names the actual cause.)
- gotchas from MPI-145/146 (sage baked per-arch; per-card VRAM) — see the MPI-145 sub-plan notes.
- RunPod branch only — NO master merge / GitHub release / git tag (MPI-131 rule).
- Open MPI-143 follow-ups (separate cards): verify i2v WITH audio; re-pull the truncated 995MB upscaler.
