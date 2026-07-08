# MPI-222 — Per-node commit-drift → targeted auto-reinstall on boot (no engine wipe), both engines

## Current State

Project mode: **scalable-foundation** (full guardrails). All architectural decisions are LOCKED (front-loaded with the user); this plan is implementation-only.

**Problem:** `dev_configs/node_lock.json` pins each custom node's commit, but nothing records WHICH commit was installed, and the install-check is folder-exists only (both engines). A node bump (MpiNodes bumps almost every release — MPI-219) leaves existing installs silently stale. `nodeset_version` in node_lock has zero consumers. There is no stored installed-commit to diff — that single missing datum is the whole gap.

**Locked design:**
- **Bake discriminator = `installRequirements`.** Nodes WITH pip requirements stay BAKED in the Pod image (build-time venv determinism); code-only nodes install on the VOLUME via the wrapper at connect. Confines all cold-install latency + venv-drift risk to build time. Pods are ~99% fresh, so this matters.
  - BAKED (installRequirements:true): ComfyUI-LTXVideo, ComfyUI-Impact-Pack, comfyui-kjnodes, ComfyUI-Frame-Interpolation, ComfyUI-Impact-Subpack, RES4LYF.
  - VOLUME (code-only): ComfyUI-MpiNodes, ComfyUI-VideoHelperSuite, ComfyUI-UltimateSDUpscale, ComfyUI-PainterI2Vadvanced. → MpiNodes (highest churn) becomes rebuild-free.
- **Volume node payload = GitHub archive @ pinned commit** (`github.com/<repo>/archive/<commit>.zip` — what `lockUrl()` + the wrapper already produce). NO R2 infra. Commit is in the URL, so the marker is free. Only 4 small code-only nodes ever cold-install (~3.7MB). MPI-219 was a stale BAKED node, not a GitHub-download failure.
- **Marker `.mpi_node_commit`** = node_lock pinned commit, stamped at install. Mirrors the existing `.mpi_engine_version` precedent (plain UTF-8, trimmed string).
- **Flag rename: `installOnEngine` → `engineAsset`**, now on the 6 universal WEIGHTS only (4x-NMKD-Siax, 4x-AnimeSharp, face-yolov8n, hand-yolov8n, person-yolov8n-seg, sam-vit-b). All 9 nodes DROP the flag. Meaning: "universal engine asset — install with the engine, never GC with a model." (It was never a re-download concern; it's a "belongs-to-engine, not-per-model" concern.)
- **Drift, two outcomes by class:** volume node drifted OR missing → wrapper reinstalls on volume (folds into the existing boot-repair flow); baked node drifted → WARN ONLY (`ui:warning` toast "Pod image stale — rebuild needed"), never volume-heal. Local engine: no split, marker + drift + targeted repair-deps (NO engine wipe).

**Verified anchors (do NOT re-verify — from investigation):**
- Local install: `startUniversalWorkflowInstall` @ `routes/downloadManager.js:1951`; `_runCustomNodeInstall` @ `:1438-1613` (folder rename @ `:1543` = where to stamp marker); pipPins applied AFTER reqs @ `:1574-1587`.
- **TRAP:** `startUniversalWorkflowInstall` skips folders that already exist (`isCompleteOnDisk` @ `:1999`) → a drifted node (folder present) is marked complete and NEVER reinstalled. Drifted folders MUST be pre-wiped before repair.
- `checkUniversalWorkflowDepsStatus` @ `routes/shared.js:491-511` (folder-exists only; drift check slots in the else-branch, add `driftedDeps` to return).
- `GET /engine/deps-status` @ `routes/engine.js:547-558` (spreads the result → auto-forwards `driftedDeps`). `POST /engine/repair-deps` @ `:560-577` (destructures `missingDeps` only → union with `driftedDeps`).
- Boot: `js/shell.js:261` checks `needsDepsInstall` → `'repairing'` modal, SSE-driven. Setting `needsDepsInstall=true` on drift folds in with ZERO frontend change.
- Commit source: `lockUrl()` @ `dependencies.js:19-31` buries commit in URL; DEPS entries have NO commit field. Need `getPinnedNodeCommit(depId)` reading `dev_configs/node_lock.json` directly (CJS `require`), guard `source==='git-commit'`.
- `getInstalledModelNodeDeps` @ `routes/shared.js:524-599` (MPI-118, missing-only). SOLE caller `routes/engine.js:369` (import `:15`, export `shared.js:694`). Returns `[]` once no node is model-specific → deletable.
- Remote connect edge: `js/shell.js:1250` `syncModelInstalled()` → `/comfy/models/check` → `remoteModelsCheck` @ `routes/remoteModels.js:215`. Drift slots there.
- `_universalNodeFilenames` @ `remoteModels.js:157` (regex `/installOnEngine:\s*true/` @ `:175`) / `_isImageResident` @ `:192` — retarget the regex to `installRequirements:\s*true`.
- `remoteInstallDep(dep,{force})` @ `remoteModels.js:271` — targeted reinstall path (202, SSE, fire-and-forget). Gen gated by `comfyController._ensureRemoteReady` via `remoteComfyNeedsRestart` — works unchanged.
- `ui:warning` = toast (`statusBar.js:571`), NOT the error dialog. Confirmed correct for baked-drift.
- Manifest: `GET /wrapper/manifest` (`remotePodState.js:138-163`), `models[]` defined but empty. Add `nodes[]` `{filename,commit}`, bump `manifest_schema_version` 1→2.
- **Pod image (SEPARATE repo `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`):** Dockerfile bake loop `~L147-205` (reads node_lock, `git clone`+`checkout commit`, skips `if not installOnEngine`). Wrapper `wrapper/wrapper.py` `_run_node_install` @ `:1827-1909` (httpx GitHub zip → extract → rename → reqs → `_manifest_record_model`); version **0.2.32** (memory said 0.2.31 — confirm). start.sh `L232-246` MpiNodes git-pull hook MUST be removed. mpi-ci node_lock is STALE (MpiNodes `780c7c3`, missing RES4LYF) — resync required. Build = `gh workflow run cubric-vision-pod-image.yml`.

**Open risks:**
- **PainterI2Vadvanced has NO pinned commit** — `dependencies.js:450` hardcodes `refs/heads/main.zip`, not in node_lock. To join the one node class + get a commit marker it MUST get a node_lock entry with a pinned commit first (Phase 1).
- **The 4 unpinned req-nodes' pip pins need LIVE determination** — Impact-Pack, kjnodes, Frame-Interpolation, Impact-Subpack. Versions aren't in the repo; must `pip install -r requirements.txt --dry-run` (or observe a real install) on a live engine to capture proven pins.
- LTXVideo `installOnEngine` mismatch: `true` in node_lock, ABSENT in DEPS → baked on Pod, per-model locally today. The collapse resolves it.

## Completed

- [ ] Nothing yet.

## Remaining Work

Sequenced by dependency. Phases 1–2 are pure app/data (no engine touch, safe to land + verify independently). Phase 3 is local-engine runtime. Phase 4 is remote-engine app-side. Phase 5 is the mpi-ci Pod image (separate repo) + one rebuild. Phase 6 = guard tests. Phase 7 = docs/memory/dead-code sweep.

No `## Parallel Batch`: the phases share `dependencies.js` / `node_lock.json` / `routes/shared.js` and have ordering dependencies (marker helper before drift check before reinstall; data model before both engines). Splitting would create write-conflicts on the same 3 files and forward-dependencies. Sequential is correct here.

## Phase 1: Data model — node_lock + DEPS collapse, flag rename, pins

- [ ] Add a `ComfyUI-PainterI2Vadvanced` entry to `dev_configs/node_lock.json` with `source:'git-commit'` + a pinned commit (resolve the current `main` HEAD of `princepainter/ComfyUI-PainterI2Vadvanced` to a SHA), `installRequirements:false`. Update its `dependencies.js` entry to use `lockUrl('ComfyUI-PainterI2Vadvanced')` instead of the raw `refs/heads/main.zip`. **Verify:** `node -e "const {lockUrl}=require('./js/data/modelConstants/dependencies.js'); console.log(lockUrl('ComfyUI-PainterI2Vadvanced'))"` prints a `/archive/<40-char-sha>.zip` URL (not `refs/heads/main`).
- [ ] Rename `installOnEngine` → `engineAsset` across `js/data/modelConstants/dependencies.js` (6 weight entries only: 4x-NMKD-Siax, 4x-AnimeSharp, face-yolov8n, hand-yolov8n, person-yolov8n-seg, sam-vit-b) and update `routes/shared.js` `getUniversalWorkflowDepIds` filter (`dep.engineAsset === true`) + its docblock + `routes/downloadManager.js:1852` Rule-1 comment. DROP the flag entirely from all 9 node entries in DEPS. **Verify:** `grep -rn "installOnEngine" js/ routes/` returns ONLY doc/comment references to be cleaned in Phase 7 (no live consumers); `node -e "const {DEPS}=require('./js/data/modelConstants/dependencies.js'); console.log(Object.entries(DEPS).filter(([,d])=>d.engineAsset).map(([id])=>id))"` prints exactly the 6 weight ids.
- [ ] Enforce `installRequirements:true ⇒ pipPins`: add proven pins to `ComfyUI-Impact-Pack`, `comfyui-kjnodes`, `ComfyUI-Frame-Interpolation`, `ComfyUI-Impact-Subpack` in DEPS. **Pins require live determination** — see Phase 3 note; until then, add a placeholder assertion, not guessed versions. **Verify:** an assertion (guard test, Phase 6) — every DEPS custom_node with `installRequirements:true` has a non-empty `pipPins` array.
- [ ] Remove the now-unused `nodeset_version` from `dev_configs/node_lock.json` (zero consumers, confirmed) OR repurpose it as a per-node-drift epoch (decide at implementation; removal is default). **Verify:** `grep -rn "nodeset_version" js/ routes/ scripts/` returns nothing.
- [ ] Fix the `_doc` field in `dev_configs/node_lock.json`: drop the stale "RunPod branch only" (file is live + consumed on branch 1.2). **Verify:** the `_doc` no longer claims RunPod-only.

## Phase 2: Marker helper + pinned-commit accessor

- [ ] Add `getPinnedNodeCommit(depId)` to `routes/shared.js`: read `dev_configs/node_lock.json` directly (CJS `require`), return `nodeLock.nodes[depId]?.commit ?? null`, guard `source==='git-commit'` (null for registry/tag/absent). Export it. **Verify:** `node -e "const {getPinnedNodeCommit}=require('./routes/shared.js'); console.log(getPinnedNodeCommit('ComfyUI-MpiNodes'), getPinnedNodeCommit('nonexistent'))"` prints the MpiNodes SHA then `null`.
- [ ] Add a small marker-write helper (or inline) mirroring `.mpi_engine_version` (`routes/engine.js:444-448`): write `path.join(nodeFolder, '.mpi_node_commit')` = trimmed commit. **Verify:** covered by Phase 3 install run (marker file appears with the pinned SHA).

## Phase 3: Local engine — stamp, drift-detect, targeted reinstall (no wipe)

- [ ] Stamp `.mpi_node_commit` after the folder rename in `_runCustomNodeInstall` (`routes/downloadManager.js:~1543`), using the pinned commit for `dep.id`. **Verify:** run a local UW dep install (or `POST /engine/repair-deps` on a test harness per `tool_test_new_route_without_restart`), confirm `<custom_nodes>/<filename>/.mpi_node_commit` contains the node_lock SHA.
- [ ] Extend `checkUniversalWorkflowDepsStatus` (`routes/shared.js:491-511`): in the else-branch (folder exists), for `type==='custom_nodes'` compare `.mpi_node_commit` vs `getPinnedNodeCommit(depId)`; mismatch → push to a new `driftedDeps` array. Return `{ needsDepsInstall: (missing.length||drifted.length)>0, missingDeps, driftedDeps }`. **Verify:** hand-edit a marker to a wrong SHA, call the function, assert that node appears in `driftedDeps` and `needsDepsInstall===true`.
- [ ] `POST /engine/repair-deps` (`routes/engine.js:565`): union `[...new Set([...missingDeps, ...driftedDeps])]`; for each DRIFTED node, **pre-wipe the folder** (`fs.remove`) before `startUniversalWorkflowInstall(set, true)` so the skip-if-exists guard doesn't short-circuit it. **Verify:** with a drifted marker, hit repair-deps on the harness; confirm the folder is re-extracted, requirements + pipPins re-run, marker re-stamped to the correct SHA, and the engine binaries are untouched (no version-check/upgrade fired — assert `.mpi_engine_version` unchanged).
- [ ] **LIVE pin determination:** on a working local engine, for each of the 4 unpinned req-nodes, capture the resolved versions of what `requirements.txt` pulls (`pip install -r requirements.txt --dry-run` or inspect post-install `pip freeze` delta) and write proven `pipPins` into Phase-1's DEPS entries. **Verify:** a fresh install of each node reports the pinned versions in `pip freeze`; no unexpected major-version drift across the shared venv.
- [ ] Delete `getInstalledModelNodeDeps` (`routes/shared.js:524-599`), its export (`:694`), its import (`routes/engine.js:15`), and the call+merge (`routes/engine.js:369-372`). **Verify:** `grep -rn "getInstalledModelNodeDeps" routes/ js/` returns nothing; `npm run server` boots clean; a local engine install still restores all needed nodes (now all universal).

## Phase 4: Remote engine — retarget discriminator, drift check, warn

- [ ] Retarget the remote baked/volume discriminator: `routes/remoteModels.js:175` regex `/installOnEngine:\s*true/` → `/installRequirements:\s*true/` in `_universalNodeFilenames` (baked = pip-req nodes). Update the `_isImageResident`/`_universalNodeFilenames` docblocks. **Verify:** `node -e` harness importing remoteModels: `_universalNodeFilenames()` returns exactly the 6 baked node folder names (LTXVideo, impact-pack, kjnodes, frame-interpolation, impact-subpack, RES4LYF), NOT the 4 volume ones.
- [ ] In `remoteModelsCheck` (`routes/remoteModels.js:215`): for VOLUME custom_nodes, after the wrapper `/wrapper/models/status` response, compare the wrapper-reported installed commit (manifest `nodes[]`, Phase 5) vs `getPinnedNodeCommit`; mismatch → mark `installed:false` (routes it to the existing install path → `remoteInstallDep(dep,{force:true})`). **Verify:** harness with a stubbed wrapper manifest reporting a stale commit → the volume node reads `installed:false`; matching commit → `installed:true`.
- [ ] In `remoteModelsCheck`: for BAKED (image-resident) nodes, compare `getPinnedNodeCommit` vs the manifest-reported baked commit; mismatch → surface a drift signal to the client (new field on the `/comfy/models/check` response) so `shell.js` emits `Events.emit('ui:warning',{message:'Pod image is stale — rebuild needed (<node>)'})`. Do NOT mark not-installed; do NOT volume-heal. **Verify:** harness with a stale baked commit → response carries the drift field, no `remoteInstallDep` fired for that node; client wiring emits exactly one `ui:warning` toast (assert via the events bus in a shell test).

## Phase 5: Pod image (mpi-ci, separate repo) — bake split, markers, wrapper, manifest, one rebuild

All paths under `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`; edit with `git -C c:\AI\Mpi\mpi-ci`.

- [ ] Resync the build copy: `cp c:/AI/Mpi/Cubric-Vision/dev_configs/node_lock.json c:/AI/Mpi/mpi-ci/cubric-vision-pod/node_lock.json`. **Verify:** the two files diff-clean; the mpi-ci copy now has the MpiNodes `2d409b5` commit, RES4LYF, and the PainterI2Vadvanced pin.
- [ ] Dockerfile bake loop (`~L147-205`): change the skip condition so ONLY `installRequirements:true` nodes are baked (code-only nodes are NOT cloned into the image); after each baked node's clone+checkout, write `.mpi_node_commit` = its commit into the node folder. **Verify:** local `docker build` (or CI dry parse) — the built image's `/opt/ComfyUI/custom_nodes/` contains ONLY the 6 baked nodes, each with a `.mpi_node_commit` matching node_lock; the 4 volume nodes are absent.
- [ ] `wrapper/wrapper.py` `_run_node_install` (`:1827-1909`): after extract+rename, write `.mpi_node_commit` = the commit conveyed by the app (new `commit` field in the `/wrapper/models/install` body — add it to `remoteInstallDep`'s custom_nodes body in Phase 4). Record the node commit in the manifest via a `nodes[]` entry `{filename,commit,installed_at}`. Bump `WRAPPER_VERSION` and `MANIFEST_SCHEMA_VERSION` 1→2. **Verify:** unit-exercise the handler (or a live volume install) — after install, `manifest.json` has a `nodes[]` entry with the correct commit and the folder has `.mpi_node_commit`.
- [ ] `wrapper/wrapper.py` startup (`_stamp_manifest_provenance` area): read each BAKED node's `.mpi_node_commit` from `/opt/ComfyUI/custom_nodes/` and record them in the manifest `nodes[]` so the app's baked-drift check (Phase 4) has data. **Verify:** on a booted Pod (or a local wrapper run against a fixture custom_nodes dir), `GET /wrapper/manifest` returns `nodes[]` covering all 6 baked nodes with their commits.
- [ ] Remove the MpiNodes git-pull hook in `start.sh` (`L232-246`) — MpiNodes is now a volume node, the baked dir won't exist. **Verify:** `grep -n "ComfyUI-MpiNodes" start.sh` shows no git-pull block; start.sh still passes a shellcheck/dry parse.
- [ ] Build + publish ONE new Pod image via `build-pod-image` skill / `gh workflow run cubric-vision-pod-image.yml` (bump `manifest_version`, `wrapper_version`; pass ComfyUI ref TAG per node_lock). Update the pinned image tag consumer (`routes/remotePodLifecycle.js` live tag). **Verify:** a fresh Pod from the new image connects; app reports the 6 baked nodes present + the 4 volume nodes installing on connect; a MpiNodes-commit bump in node_lock (without a rebuild) triggers a volume reinstall, NOT an image-rebuild prompt. *(This step is live-verified only when a Pod is available; otherwise ship logic-verified + card the live check — see Verification.)*

## Phase 6: Guard tests (both engines)

- [ ] `tests/node-drift.test.cjs` (node:test + assert/strict, mock deps, pattern per `tests/resolve-model-deps.test.cjs`): (a) a node_lock commit change flips that node to drifted in `checkUniversalWorkflowDepsStatus`; (b) `repair-deps` unions missing+drifted and pre-wipes the drifted folder; (c) the marker is re-stamped; (d) remote — a stale wrapper-reported volume-node commit → `installed:false`; a stale BAKED commit → warn-only (no reinstall); (e) invariant: every DEPS custom_node with `installRequirements:true` has non-empty `pipPins`; (f) assert the engine is NOT wiped for a node-only bump (no version-check/upgrade path invoked). **Verify:** `node --test tests/node-drift.test.cjs` passes; `npm test` green.

## Phase 7: Docs, memory, dead-code sweep (permission-gated)

- [ ] Sweep residual `installOnEngine` references (comments in `dependencies.js:7`, `universal_workflows.js:6`, `engine.js:366`, any doc rule) → `engineAsset` or removed. **Verify:** `grep -rn "installOnEngine" js/ routes/ scripts/ .claude/ docs/` returns nothing (or only historical task-archive mentions).
- [ ] With EXPLICIT user permission (per CLAUDE.md doc-drift rule), update: `.claude/rules/comfy_engine.md` (§ Engine Split — new node class + `engineAsset` + bake=`installRequirements` + drift ladder), `.claude/rules/downloads.md` (installOnEngine split → engineAsset/installRequirements), and `docs/` (`download-manager.md` § node drift + marker, `runpod-remote-engine.md` § volume vs baked nodes + manifest nodes[], `add-model-playbook.md` node-bump flow: bump node_lock → rebuild only if the node is baked/pip, else no rebuild). **Verify:** each edited doc ≤200 lines; the add-model playbook's node-bump section names the bake/volume rule correctly.
- [ ] Update memory: refresh the MPI-222 hook in `MEMORY.md` to a Done one-liner (design + `engineAsset` rename + bake=installRequirements + GitHub-not-R2 + marker). **Verify:** MEMORY.md index line present, detail in docs not memory.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

The remote half (Phase 5) has a live surface only a real Pod can exercise: fresh-Pod cold-install of the 4 volume nodes, the boot/connect experience, and proving a MpiNodes bump reinstalls on the volume WITHOUT an image rebuild. The user must connect a Pod and confirm. The local half (Phases 1–3, 6) is `auto` — fully self-verifiable via the test harness (`tool_test_new_route_without_restart`) + `npm test` + marker inspection.

Per `feedback_check_both_engine_paths` and `feedback_runpod_not_local_engine_proof`: the LOCAL engine path is verified locally; the REMOTE path is NOT proven by any local run — it needs a real Pod from the new image. Ship remote logic-verified + guard-tested, flag done-but-unverified, and card the live Pod check if no Pod is available this session.

End-to-end criteria:
1. Local: a node_lock commit bump → boot `'repairing'` modal reinstalls ONLY that node at the new commit, `.mpi_node_commit` re-stamped, engine binaries untouched (`.mpi_engine_version` unchanged).
2. Remote (live): fresh Pod from the new image → 6 baked nodes present, 4 volume nodes install on connect; a MpiNodes bump (node_lock only, no rebuild) → volume reinstall, no rebuild prompt; a baked-node bump → `ui:warning` "image stale" toast, no volume heal.
3. Guard test green for both engines incl. the no-wipe assertion.
4. `grep` clean for `installOnEngine`, `nodeset_version`, `getInstalledModelNodeDeps`.

## Preservation Notes

- **Investigation notes** saved to `.agents/mpi-kanban/tasks/MPI-222/research/` (A local, C deps/dead-code, D mpi-ci — B remote in session scratchpad). Move B in before end-session.
- **Cross-repo:** Phase 5 edits `c:\AI\Mpi\mpi-ci` (separate git) — commit there with `git -C`, do NOT `git add` from Cubric-Vision. Shared-tree commit hygiene (`feedback_shared_tree_commit_hygiene`).
- **Live-gated:** the Pod rebuild + remote live verification is the only user-blocking step; everything else lands + verifies without a Pod.
- **Docs are permission-gated** (CLAUDE.md doc-drift cardinal rule) — Phase 7 asks before editing `.claude/rules/`.
- **Pin determination is live** — don't guess the 4 pip pins; capture proven versions on a working engine (`feedback_test_user_instinct_first` cheap-direct-test spirit).
