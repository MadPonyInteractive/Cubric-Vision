# MPI-222 — Change Ledger

> **Purpose.** Single running record of EVERY change this task makes to the codebase,
> plus EVERY piece of documentation / rule / memory / skill / playbook / command that
> the change invalidates and therefore needs re-evaluation. Phase 7 (docs/rules/memory
> sweep, permission-gated) closes out the "Re-eval required" table — nothing here may be
> left unaddressed at end-session. Update this file as each phase lands, including when
> the plan drifts.

---

## Code changes (by phase)

### Phase 1 — data model (DONE)

| File | Change |
|---|---|
| `dev_configs/node_lock.json` | Added `ComfyUI-PainterI2Vadvanced` entry (`source:git-commit`, commit `a044ac7b2a33565343ddc75283c94a41371b4352`, `installRequirements:false`). Removed `installOnEngine` from all node entries. Removed top-level `nodeset_version`. De-staled `_doc` (dropped "RunPod branch only"; documented the `installRequirements` bake/volume split). |
| `js/data/modelConstants/dependencies.js` | PainterI2Vadvanced `url` → `lockUrl('ComfyUI-PainterI2Vadvanced')` (was raw `refs/heads/main.zip`). Renamed `installOnEngine`→`engineAsset` on the 6 WEIGHTS (4x-NMKD-Siax, 4x-AnimeSharp, face-yolov8n, hand-yolov8n, person-yolov8n-seg, sam-vit-b). Dropped the flag from all node entries. Updated header comment #2 (engineAsset = weights; nodes split by installRequirements). |
| `routes/shared.js` | `getUniversalWorkflowDepIds` filter `installOnEngine===true` → `type==='custom_nodes' || engineAsset===true`. Updated its docblock. |
| `routes/downloadManager.js` | Rule-1 preserve comment reworded (every custom_node + engineAsset weights). |
| `routes/remoteModels.js` | **(Phase-4 work pulled forward — see Plan Drift)** Baked/volume discriminator regex `/installOnEngine:\s*true/` → `/installRequirements:\s*true/` in `_universalNodeFilenames`; updated `_universalNodeFilenames` + `_isImageResident` docblocks. |

**Verified:** universal set = 16 (10 nodes + 6 weights); engineAsset = 6 weights; baked/volume parser = 6/4; all files syntax/JSON-clean.

**Carried forward:** pipPins invariant for Impact-Pack / kjnodes / Frame-Interpolation / Impact-Subpack NOT satisfied (needs LIVE pin determination — Phase 3). No guessed versions added.

### Phase 2 — marker helper + pinned-commit accessor (DONE)

| File | Change |
|---|---|
| `routes/shared.js` | Added `NODE_COMMIT_MARKER = '.mpi_node_commit'` const, `getPinnedNodeCommit(depId)` (reads node_lock via `_require`, guards `source==='git-commit'`, else null), `writeNodeCommitMarker(nodeFolder, depId)` (stamps trimmed commit, no-op if unpinned). All three exported. |

**Verified:** MpiNodes/Painter SHAs resolve; nonexistent → null; marker write→read round-trips.

### Phase 3 — local engine stamp / drift / targeted reinstall (DONE except live pins)

| File | Change |
|---|---|
| `routes/downloadManager.js` | Import `writeNodeCommitMarker` from shared. Stamp `.mpi_node_commit` at the END of the `_runCustomNodeInstall` per-dep loop (after reqs+pins → marker = success sentinel). |
| `routes/shared.js` | `checkUniversalWorkflowDepsStatus` now drift-checks folder-present custom_nodes (marker vs `getPinnedNodeCommit`; absent marker = drifted) and returns `driftedDeps`. **Deleted `getInstalledModelNodeDeps`** (fn body + docblock + export) — all nodes universal now, so it returned `[]`. |
| `routes/engine.js` | Removed `getInstalledModelNodeDeps` import + its call/merge (`missingDepIds` = `missingDeps`). Added `resolveComfyPath` import. `repair-deps` unions missing+drifted + **pre-wipes** each drifted folder before reinstall (defeats the skip-if-exists guard). |
| `js/data/modelConstants/dependencies.js` | RES4LYF comment de-staled (dropped `installOnEngine` + the deleted `getInstalledModelNodeDeps()` reference; now "all nodes universal, baked because pip-req"). |
| `tests/node-drift.test.cjs` | **NEW** guard test (local half): pinned-commit accessor, marker round-trip, drift on wrong/missing marker, union+pre-wipe, no-wipe invariant, baked⇒pipPins invariant (4 known-unpinned tolerated). 7/7 pass. |

**Verified:** node-drift 7/7 green; full `tests/*.test.cjs` sweep — only pre-existing failure is `runpod-remote-hardening.test.cjs` (409/502, confirmed failing on clean tree WITHOUT my changes, unrelated).

### Phase 3 (cont.) — LIVE pip pins captured (DONE)

| File | Change |
|---|---|
| `js/data/modelConstants/dependencies.js` | Added proven `pipPins` (live local-engine versions) to the 4 baked req-nodes: Impact-Pack, kjnodes, Frame-Interpolation, Impact-Subpack. All shared-package pins agree across every node (numpy 2.5.1, opencv-python-headless 5.0.0.93, matplotlib 3.11.0, scipy 1.18.0, pillow 12.3.0, kornia 0.8.2). |
| `tests/node-drift.test.cjs` | `pipPins` invariant flipped from KNOWN_UNPINNED-tolerant to a HARD assertion; added a no-cross-node-version-conflict invariant. 8/8 pass. |

**Verified:** `pip install --dry-run --no-deps <all 12 pins>` → every one "already satisfied" (zero venv change — pins ARE the live proven-good set). node-drift 8/8. Phase 3 now fully closed.

### Phase 4 — remote engine drift check + baked warn (DONE, live-gated)

| File | Change |
|---|---|
| `routes/remoteModels.js` | Import `getPinnedNodeCommit`. New `_installedNodeCommits()` (manifest `nodes[]` → folder→commit, best-effort, `{}` on old wrapper/error). `remoteModelsCheck`: VOLUME node drift → `installed:false` (reinstall path); BAKED node drift → `bakedDrift[]` on response (warn only, never unset installed). |
| `js/data/modelRegistry.js` | `syncModelInstalled` reads `bakedDrift` and emits `ui:warning` toast once per node/session (`_warnedBakedDrift` dedup). |
| `routes/remotePodState.js` | `MANIFEST_SCHEMA_MAX` 1→2 (accept the schema-2 manifest with `nodes[]`; additive, v1 Pods unaffected). |
| `tests/node-drift.test.cjs` | +4 remote-drift cases (volume wrong/right commit, baked warn-only, old-wrapper no-drift). 12/12 pass. |

**Verified (logic):** node-drift 12/12; all files syntax/import-clean. **LIVE-GATED:** remote path unprovable without a Pod from the Phase-5 image (`feedback_runpod_not_local_engine_proof`); fail-safe = absent `nodes[]` → no drift, so harmless pre-Phase-5 + on old Pods.

### Phase 5 — mpi-ci Pod image (SEPARATE repo `c:\AI\Mpi\mpi-ci`, DONE except the user-gated rebuild)

> Cross-repo edits — committed separately via `git -C c:\AI\Mpi\mpi-ci` (shared-tree hygiene: explicit pathspec, never `git add -A`). Plus ONE Cubric-Vision-side edit (the `commit` body field).

| File | Change |
|---|---|
| `cubric-vision-pod/node_lock.json` | **Resynced** from `Cubric-Vision/dev_configs/node_lock.json` (byte-identical hash). Picks up MpiNodes `2d409b5`, RES4LYF, the PainterI2Vadvanced pin, and the dropped `installOnEngine` flag. baked/volume parser now 6/4. |
| `cubric-vision-pod/Dockerfile` | Bake loop skip condition `not installOnEngine` → `not installRequirements` (bake ONLY the 6 pip-req nodes; the 4 code-only nodes leave the image → volume-install at connect). Each baked git-commit node now writes `.mpi_node_commit` = its pinned commit. Header comment rewritten (bake=installRequirements + drift marker). Stale weight-source `installOnEngine` comment → `engineAsset`. |
| `cubric-vision-pod/wrapper/wrapper.py` | `WRAPPER_VERSION` 0.2.32→**0.2.33**; `MANIFEST_SCHEMA_VERSION` 1→**2** (adds `nodes[]`). New `_manifest_record_node(filename,commit)` upsert (best-effort). New `_stamp_baked_node_commits()` reads each baked `.mpi_node_commit` at startup into `nodes[]` (wired into `_startup` after the provenance stamp). `_run_node_install` takes a `commit` arg → writes `.mpi_node_commit` + records `nodes[]` LAST (after reqs = success sentinel); install handler reads `body.get("commit")` and threads it. Stale `_is_complete_on_disk` docstring `installOnEngine`→`installRequirements`. |
| `cubric-vision-pod/start.sh` | **Removed** the MpiNodes boot-time `git pull main` hook (L231-246) — MpiNodes is now a volume node, `/opt/ComfyUI/custom_nodes/ComfyUI-MpiNodes` no longer exists; a commit bump reinstalls on the volume with no rebuild (what the hook was faking). Replaced with an explanatory comment. |
| `routes/remoteModels.js` *(Cubric-Vision side)* | `remoteInstallDep` custom_nodes body now sets `body.commit = getPinnedNodeCommit(dep.id)` (when pinned) so the wrapper can stamp the marker. |

**Verified (logic):** wrapper.py + both Dockerfile PY heredocs parse; remoteModels.js loads; node-drift **12/12**. Live-exercised the wrapper manifest logic against a temp dir: version/schema correct, `_manifest_record_node` upserts + no-ops on empty args, `_stamp_baked_node_commits` reads markers / skips marker-less / preserves prior entries / dedups on re-upsert — **ALL PASS**.

### Phase 5 (cont.) — image rebuild dispatched (USER-approved)

| File / action | Change |
|---|---|
| `routes/remotePodLifecycle.js` *(Cubric-Vision)* | `POD_IMAGE_VERSION` v0.12.0→**v0.14.0**; `WRAPPER_VERSION` 0.2.24→**0.2.33**. Committed (53b1b1d, branch 1.2). **Needs an app restart to take effect.** |
| mpi-ci commit | `1ab3fa6` (Phase-5 files) pushed on top of the pending `64704ca` (wrapper 0.2.31 fix). start.sh + wrapper.py verified LF-clean in the committed blob. |
| CI dispatch | `gh workflow run cubric-vision-pod-image.yml` — manifest_version=0.14.0, wrapper_version=0.2.33, comfyui_ref=**v0.27.0 (TAG, not SHA)**, push_latest=false. Run **28939295236**, both legs (cu130→Docker Hub, cpu→GHCR). |

**Version note:** v0.13.0 was SKIPPED — `v0.13.0-cu130` already exists on Docker Hub (MPI-191's failed torch-2.12 experiment, reverted; the tag is referenced as historical evidence). Reusing it would overwrite that image. v0.14.0 is built on the SAME proven 2.10+cu130 cold stack (torch unchanged) — MPI-222 is a node/wrapper/manifest change, not a torch change.

**build-pod-image SKILL DRIFT (user-flagged, needs update):** the skill still assumes the old bake model + carries stale examples. Rows for the Phase-7 sweep:
- Skill's Flow-B "After" + the pod README section describe the removed MpiNodes boot git-pull hook (README fixed in this commit; skill Flow-A/B text not yet).
- Skill's `SHIPPED=v0.11.0` disk-reclaim example + `v0.19.3` COMFYUI_REF example are stale (now v0.12.0-was-shipped / v0.27.0).
- The bake-loop is Dockerfile-internal (skill doesn't drive it) so the `installRequirements` split needed NO skill change — but the skill's prose still says "clones each installOnEngine pack". Reword.

**CI RESULT (success):** run 28939295236 — both legs green (cu130 → Docker Hub 13m58s; cpu → GHCR). 5a public pull-verify: `v0.14.0-cu130` + `v0.14.0-cpu` both public + pullable (repos already public, no manual gate).

**R2 PUBLISH GAP (under-specified in the plan — recorded so it's not re-discovered):** the plan said "one image rebuild," but Pods fetch `wrapper.py` + `start.sh` from R2 `stable` at boot (MPI-156/181 bootstrap parity), with the baked copies as fallback only. The rebuild alone was INERT: the first cpu smoke test showed the image baked 0.2.33 but `/health` reported **0.2.32** — the R2 `stable` copy (old wrapper) overrode the baked one at boot. Fix = `publish-runtime.sh stable` (pushes start.sh + start-cpu.sh + wrapper.py 0.2.33 + manifest to production R2, curl-verifies). **The image rebuild was STILL needed** (bootstrap.sh + the Dockerfile bake-split are image-only), but the wrapper/start half ships via R2. Lesson for the next node/wrapper change: rebuild AND publish-runtime.

**5b BOOT SMOKE (PASS, post-publish):** re-ran the cpu smoke against live R2 → `/health` `wrapper_version: 0.2.33`; boot log `manifest stamped (schema 2, wrapper 0.2.33)`. The schema-v2 node-drift wrapper serves on a real container from live R2. R2 manifest + published wrapper.py confirmed (0.2.33, `MANIFEST_SCHEMA_VERSION = 2`, `_stamp_baked_node_commits` present).

**LIVE-GATED (still USER-only, remaining):** fresh GPU Pod verify — 6 baked nodes present, 4 volume nodes install on connect, a MpiNodes commit bump (node_lock only, no rebuild) reinstalls on the volume w/o a rebuild prompt, a baked-node bump → `ui:warning` "image stale". Needs the user to deploy a Pod from v0.14.0 + generate (`feedback_runpod_not_local_engine_proof`). App must be RESTARTED first to pick up the v0.14.0/0.2.33 pins (POD_IMAGE_VERSION baked into the Express child at boot).

### Phase 8 — RIFE weight = tracked dep + `targetPath` primitive (DONE, surfaced by the live restart)

**Bug found on the first live restart:** the app restart triggered the local drift ladder (no `.mpi_node_commit` existed pre-v0.14.0 → all 10 nodes read as drifted → full reinstall). It completed clean (all 10 markers stamped, deps-status now `drifted:0`), BUT the pre-wipe **deleted `rife47.pth`** — the RIFE weight lived INSIDE the node folder (`custom_nodes/comfyui-frame-interpolation/ckpts/rife/`), so pre-wiping the drifted node folder took the weight with it. Root cause = TWO bugs: (A) pre-wipe is over-broad (nukes in-folder weights); (B) RIFE was never an app-tracked dep — it relied on the node's fragile lazy GitHub fetch (`vfi_utils.load_file_from_github_release`) on first execution, so a missing weight was invisible to the boot dep-check (couldn't boot-install or self-heal). Design A (user-chosen) fixes BOTH: make RIFE a tracked `engineAsset` weight; the node re-clone wipes it → the dep re-installs it (self-heal), and a fresh/missing weight now boot-installs.

**Blocker:** the RIFE node HARD-CODES its scan dir to `<node>/ckpts/rife/` (vfi_utils config.yaml + `MODEL_TYPE`, does NOT read extra_model_paths.yaml), so RIFE can't live in `mpi_models/` like every other weight. The resolver had no way to target a dir under `custom_nodes/`. Added a general `targetPath` primitive (reusable for any future node with an in-folder weight — the user's ControlNet-and-beyond concern).

| File / action | Change |
|---|---|
| R2 upload | `rife47.pth` (20.4MB, sha `6a8a825a…`, the proven copy the Pod bakes from marduk191/rife) uploaded to `cubric-models` at `vision/models/frame_interpolation/rife/rife47.pth`. Public URL 200 + sha-verified byte-identical. |
| `routes/shared.js` | `resolveComfyPath`: new **`targetPath`** branch (FIRST, before the customRoot/default split) — a dep with `targetPath` installs to `getComfyPath(ENGINE_ROOT, ...targetPath, filename)` (under the ComfyUI repo root, platform-correct), bypassing the `mpi_models/` type→subdir mapping. Always engine-anchored (never the user's custom models root). |
| `js/data/modelConstants/dependencies.js` | New `rife47` dep: `engineAsset:true`, bare `filename:'rife47.pth'`, `targetPath:'custom_nodes/comfyui-frame-interpolation/ckpts/rife'`, R2 url, sha256. Now in the universal set (16→17) → boot-installs + self-heals. |
| `routes/remoteModels.js` | `_isImageResident`: a `targetPath` weight → `true` (it's baked INSIDE the node folder in the Pod image; the wrapper can't see it on the volume and a bare-filename install would reject on empty type). Pod stays immune — RIFE already Dockerfile-baked. |
| `tests/node-drift.test.cjs` | +4 cases: targetPath resolves in-node (not mpi_models); normal weights unaffected; targetPath weight is image-resident on remote; invariant (every targetPath weight has a bare filename + sha256). **16/16.** |

**Restored:** re-downloaded `rife47.pth` from HF into the node dir (sha-verified) so the live app is unblocked NOW. **Verified:** node-drift 16/16; resolver resolves RIFE to exactly the node ckpts dir + normal weights still → mpi_models (no regression); R2 download→sha-verify install mechanics proven. **NOT live-verified:** the boot-install/self-heal fires only after an app RESTART (registry reload — the running app has the old registry without the RIFE dep). Weight is present now, so no repair triggers; delete + restart to exercise the boot-install path.

### Phase 8 (fix) — targetPath dropped by the DOWNLOAD resolver (LIVE-FOUND 2026-07-08)

**Bug found on the RIFE self-heal live test:** user deleted `rife47.pth` + restarted. The boot dep-check correctly saw it missing and downloaded 20.4MB from R2 — but it landed at `G:\CubricModels\rife47.pth` (the user's mpi_models custom root), NOT in the node's `ckpts/rife/`. The RIFE node scans only its own `ckpts/rife/` → still can't find it. Self-heal *mechanism* worked (detect→download→R2), the *destination* was wrong.

**Root cause (engine-split-sweep miss, [[feedback_engine_split_sweep_all_consumers]]):** Phase 8 added the `targetPath` branch to `resolveComfyPath` (the DRIFT-CHECK resolver) but the DOWNLOAD path (`downloadManager.js`) has its own resolve logic at THREE call sites (size-calc `:717`, preserve-rule `:1856`, installer `:2001`). All three called `resolveComfyPath({ type: dep.type, filename: dep.filename }, …)` — a STRIPPED object that dropped `dep.targetPath` → fell through to the `mpi_models` mapping. Only fired when a customRoot was set (the `else if (customRoot)` branch); the resolver itself was correct, the CALLERS never passed it the field.

| File | Change |
|---|---|
| `routes/downloadManager.js` (×3 sites: 717 / 1856 / 2001) | Added a `dep.targetPath` guard clause FIRST at each site (before the custom_nodes/customRoot/default branching) that calls `resolveComfyPath(dep, customRoot, {})` with the FULL dep. Engine-anchored regardless of customRoot. |
| `tests/node-drift.test.cjs` | +1 regression guard: `download-call-site forwards targetPath` — models the shipped branch order + asserts RIFE resolves in-node with AND without a customRoot (the pure-resolver test couldn't catch a caller stripping the field). **18/18.** |

**Verified:** live resolver probe — `rife47` → `…\custom_nodes\comfyui-frame-interpolation\ckpts\rife\rife47.pth` both with `customRoot='G:/CubricModels'` AND `null`; normal upscaler weight still → `G:\CubricModels\upscale_models\…` (no regression). node-drift 18/18. `downloadManager.js` loads clean. **LIVE-VERIFIED 2026-07-08** — user deleted `rife47.pth` + restarted again → boot self-heal downloaded from R2 and landed at `custom_nodes/comfyui-frame-interpolation/ckpts/rife/rife47.pth` (size 21344827 + sha256 `6a8a825ab2…` byte-match ✅). RIFE self-heal fully closed. Stray `G:\CubricModels\rife47.pth` (20.4MB, the misplaced download from the buggy run) left in place pending user cleanup.

**MpiNodes symlink guard LIVE-VERIFIED 2026-07-08:** the dev-mode `_devMode && depId === 'ComfyUI-MpiNodes'` skip in `checkUniversalWorkflowDepsStatus` (added this session) survived a restart — user replaced the folder with their dev symlink, restarted, symlink was NOT clobbered (no drift-flag → no pre-wipe). node-drift +1 = 18/18 incl. the dev-mode skip case. See the symlink-clobber row below (now fixed by this guard for MpiNodes specifically; general symlink case still cardable).

### Phase 5 (fix) — CPU image pin stale (LIVE-FOUND 2026-07-08)

**Bug found during the CPU-pod node-drift test:** the CPU download-mode pod booted `ghcr.io/…/cubric-vision-pod:v0.11.0-cpu`, NOT v0.14.0. `POD_IMAGE_VERSION_CPU` in `remotePodLifecycle.js` was still `'v0.11.0'` — the GPU pin bumped to v0.14.0 in Phase 5 but the CPU pin was MISSED, even though CI run 28939295236 built BOTH legs (cu130 + cpu) and `v0.14.0-cpu` is verified present + pullable on GHCR. CPU pods got the new wrapper (0.2.33 via R2 stable) but the OLD image-baked `start-cpu.sh` + bake logic.

| File | Change |
|---|---|
| `routes/remotePodLifecycle.js` | `POD_IMAGE_VERSION_CPU` `'v0.11.0'` → `'v0.14.0'` (+ comment noting the Phase-5 miss). Image already on GHCR — no rebuild. Takes effect on the next pod deploy (baked into the Express child at boot). |

**Verified:** `v0.14.0-cpu` exists on GHCR (`docker manifest inspect` OK); `remotePodLifecycle.js` loads clean. **Live-gated:** takes effect on the next CPU pod after an app restart.

**CPU-pod v0.14.0 wrapper test (partial, LIVE 2026-07-08):** connected a CPU download-mode pod on a FRESH volume (`e6hn41a5ea`) — booted CLEAN (`wrapper_version: 0.2.33`, `start-cpu.sh` from R2, `DOWNLOAD MODE — wrapper only`, no `mv` crash). Installed Chroma Flash → wrapper installed nodes + pip reqs onto the volume (RES4LYF requirements.txt: numpy/opencv/matplotlib/scipy/pillow all `Successfully installed`), `GET /wrapper/manifest 200`, `POST /wrapper/models/status 200`, `/health`+`/stats`+`/disk` all 200. The wrapper manifest path (schema-2 `nodes[]`) is EXERCISED. Note the v0.11.0-cpu image ran the OLD start-cpu.sh this boot; re-test on the bumped v0.14.0-cpu after restart for a clean image match.

**GPU-pod v0.14.0 IMAGE test (LIVE 2026-07-08):** GPU pod (`y5eyjsmiftk4du`, `v0.14.0-cu130`, RTX 4090, reused CPU-pod volume `e6hn41a5ea`) booted CLEAN — **`node-dedupe: quarantined volume pack 'RES4LYF' (baked twin present)` + `1 volume pack(s) quarantined`** (the start.sh MPI-193 dedup working, NO `mv` crash — the earlier crash was volume-`z6l1p5kstn` pollution only), **`manifest stamped (schema 2, wrapper 0.2.33)`**, ComfyUI started, app WebSocket `[accepted]`, generation SUCCEEDED (image out; unrelated out-of-scope errors owned by another agent). Proves: v0.14.0 GPU image boots, baked-vs-volume dedup, schema-2 manifest, end-to-end node execution. ✅

### Phase 4 (fix) — remote volume-node drift HEAL was dead (LIVE-FOUND 2026-07-08, the node-bump test earned its keep)

**Bug the deliberate node-bump test caught (would hit EVERY MpiNodes bump = ~every release, the whole MPI-219 class):** bumped node_lock MpiNodes `2d409b5`→`ba4b37a` (real 1.1.3 commit), restarted, reconnected the GPU pod. Drift DETECTION worked live — Chroma flipped to not-installed (99%, prompt box vanished because MpiNodes missing at pinned commit). But pressing Install → toast `Chroma Flash installed` yet the model IMMEDIATELY re-read as not-installed → **infinite install loop**. Root cause traced through 3 layers: `remoteModelsCheck` sets a drifted volume node `installed:false` (routes/remoteModels.js:313) but the drifted folder is STILL PRESENT on the volume (wrong commit) → the install request goes WITHOUT `force` → wrapper.py:2068 `if complete and not force: return already_installed` short-circuits → **never re-fetches at the pinned commit, never re-stamps the marker** → next check still drifted → loop. The LOCAL engine got its pre-wipe (engine.js:578) but the REMOTE twin's equivalent (`force`) was NEVER wired ([[feedback_check_both_engine_paths]] / [[feedback_engine_split_sweep_all_consumers]] — the shipped Phase-4 remote path had detection but no heal).

| File | Change |
|---|---|
| `routes/remoteModels.js:313` | A drifted volume node is now tagged `d.drifted = true` (in addition to `installed:false`) so the install path can distinguish drift (folder present, needs force) from a fresh miss (folder absent, normal install). |
| `routes/downloadManager.js` (install-plan else-branch) | Reads `statusResults[dep.id].drifted` → pushes `{ ...dep, forceReinstall:true }` for a drifted node. |
| `routes/downloadManager.js` (install dispatch `:1367`) | `remoteInstallDep(dep, { force: dep.forceReinstall === true })` — sends `force:true` ONLY for a drifted node. |
| `tests/node-drift.test.cjs` | +2 guards: a drifted dep installs WITH force (no already_installed loop); a genuinely-missing dep installs WITHOUT force. **20/20.** |

**No wrapper/image change needed** — the wrapper's `force` path already does the right thing: wrapper.py:2081 `_run_node_install` → :1919-1920 `shutil.rmtree(node_dir)` + re-extract at the pinned commit + re-stamp `.mpi_node_commit` + record `nodes[]`. The bug was purely app-side (never SET force). **Verified:** both modules load; node-drift 20/20; wrapper force→rmtree→re-clone path confirmed in wrapper.py.

**LIVE-VERIFIED 2026-07-08:** restarted the app (routes reloaded), reconnected the GPU pod, pressed Install on Chroma → **NO loop** (previously Chroma re-flipped to Install every press; now it stuck as installed), prompt box RETURNED, **generation SUCCEEDED** (twice) = MpiNodes re-fetched at the bumped commit on the volume + executes. The `already_installed` short-circuit is defeated for drifted nodes. Full MPI-219-class fix (every MpiNodes bump breaking remote installs) proven end-to-end. **node_lock REVERTED** to `2d409b5` (HEAD/1.1.4) — confirmed via node -e read. NOTE: the test volume `e6hn41a5ea` now has MpiNodes at `ba4b37a`; the next reconnect after an app restart will drift-detect ≠ `2d409b5` → force-reinstall @ 2d409b5 (self-correcting — the fix working in reverse). One-time expected MpiNodes reinstall, harmless.

---

## Re-eval required (docs / rules / memory / skills / playbooks / commands)

> Every row is something a Phase-1+ change has made stale or will make stale. Status:
> `pending` = still describes the OLD behavior; `done` = updated (Phase 7). Do NOT edit
> `.claude/rules/` or `docs/` without explicit user permission (CLAUDE.md doc-drift rule);
> this table is the worklist for that permission-gated pass.

| Target | Type | Why it's stale | Status |
|---|---|---|---|
| `.claude/rules/comfy_engine.md:27` | rule | Says universal nodes use `installOnEngine: true` + `getUniversalWorkflowDepIds` filters on that flag. Now: nodes are universal by `type==='custom_nodes'`; weights use `engineAsset`; bake/volume split = `installRequirements`. | **done** (Phase 7) |
| `.claude/rules/comfy_engine.md` § Engine Split | rule | No mention of the node drift ladder, marker `.mpi_node_commit`, `engineAsset`, or bake=`installRequirements`. | **done** (Phase 7 — new § 2.5c) |
| `.claude/rules/downloads.md` | rule | `installOnEngine` split description → `engineAsset` (weights) / `installRequirements` (node bake/volume). | **done** (Phase 7) |
| `docs/download-manager.md` | doc | Add § node drift + `.mpi_node_commit` marker + pre-wipe-before-repair gotcha. | **done** (Phase 7) |
| `docs/runpod-remote-engine.md` | doc | Add § volume vs baked nodes, manifest `nodes[]`, baked-drift warn-only. | **done** (Phase 7 — §6 + §11 manifest gate) |
| `docs/add-model-playbook.md` | playbook | Node-bump flow: bump node_lock → rebuild ONLY if the node is baked (`installRequirements:true`), else no rebuild (volume install). | **done** (Phase 7 — § 4) |
| `js/data/modelConstants/dependencies.js:516` | comment | RES4LYF comment: "NO installOnEngine ... via getInstalledModelNodeDeps" — both the flag and that fn are being removed (Phase 3). | **done** (Phase 3) |
| `js/data/modelConstants/universal_workflows.js:6` | comment | "with installOnEngine: true" → engineAsset/installRequirements wording. | **done** (Phase 7) |
| `routes/engine.js:366` | comment | "the UW set only covers installOnEngine" — flag renamed. | **done** (fixed in the Phase-3 engine.js edit; comment now reads "every custom_node is now universal") |
| `routes/shared.js:517-519` | comment/dead-code | `getInstalledModelNodeDeps` docblock references `installOnEngine`; whole fn deleted in Phase 3. | **done** (Phase 3 — fn deleted) |
| `MEMORY.md` (project auto-memory) | memory | MPI-222 hook to flip to a Done one-liner (engineAsset rename + bake=installRequirements + GitHub-not-R2 + marker). | **done** (Phase 7 — Done hook added + whole file compacted 19.7→17.0KB under the read-limit) |
| `dev_configs/node_lock.json` (mpi-ci copy) | cross-repo | Build copy WAS stale (MpiNodes 780c7c3, missing RES4LYF, no Painter, still had installOnEngine). | **done** (Phase 5 — resynced byte-identical) |
| `mpi-ci/cubric-vision-pod/README.md:67,249` | doc (cross-repo) | Described MpiNodes baked via node_lock + "installOnEngine pack" bake loop — now MpiNodes is a volume node + bake=installRequirements. | **done** (Phase 5 — both sections rewritten) |
| `build-pod-image` skill | skill/command | (1) Flow-A/B prose still says "clones each installOnEngine pack"; (2) Flow-B "After" note + drift about the removed MpiNodes git-pull hook; (3) stale examples `SHIPPED=v0.11.0` + `COMFYUI_REF v0.19.3`. Bake-split itself needs NO skill change (Dockerfile-internal). Update in the permission-gated sweep. | **done** (Phase 7) — the skill (`.claude/commands/build-pod-image.md`) was already updated since (comfyui_ref examples = v0.27.0, "edit node_lock.json and rebuild; build follows the lock" — no installOnEngine prose, no git-pull hook). Only stale bit was the hardcoded `SHIPPED=v0.11.0` → replaced with a LIVE read of `POD_IMAGE_VERSION` so it never re-drifts. |
| `docs/archive/mpi-kanban/investigations/resize-deps-docs.md` | doc (archive) | Historical `installOnEngine` references — likely leave (archive), confirm at sweep. | **done** (LEAVE — archive is a historical snapshot; the `installOnEngine` refs are correct AS history, editing an archive rewrites the past) |
| `docs/download-manager.md` OR `.claude/rules/comfy_engine.md` | doc/rule | Document the new **`targetPath`** dep primitive (Phase 8): a weight whose node hard-codes an in-folder scan dir installs there via `targetPath` instead of `mpi_models/`; it's engineAsset (boot-install + self-heal) and image-resident on remote. Names the RIFE case + the "add-a-model with an in-folder weight" recipe. | **done** (Phase 7 — documented in ALL THREE: comfy_engine.md § 2.5c, download-manager.md § targetPath, add-model-playbook.md § 4) |
| `routes/engine.js` pre-wipe (Phase 3) | code (hardening, not a bug now) | The drift pre-wipe deletes the WHOLE node folder — over-broad: it nukes any in-folder weight. RIFE is now covered (tracked dep self-heals), but a FUTURE node with an in-folder weight that isn't yet a tracked dep would lose it on a bump. Optional hardening: preserve `ckpts/` + `*.pth/*.pt/*.safetensors` across pre-wipe. Low priority — the `targetPath` dep pattern is the real fix; note in docs so the next such node gets a dep, not just a folder. | **done** (docs — the pre-wipe gotcha + "give it a `targetPath` dep" guidance are in comfy_engine.md § 2.5c + download-manager.md § targetPath; the code hardening stays a cardable follow-up, not a doc row) |
| `routes/engine.js:578` pre-wipe (SYMLINK CLOBBER) | code (hardening, dev-only bug — found live 2026-07-08) | The pre-wipe `fs.remove(localPath)` follows + deletes a SYMLINKED node folder. On the first v0.14.0 restart ALL 10 nodes read drifted (no markers pre-v0.14.0) → MpiNodes was symlinked (user's dev live-edit setup) → pre-wipe deleted the link + reinstall replaced it with a static GitHub clone. Blast radius = a dev with a symlinked node ONLY (users never symlink); ships fine. Fix option: before wipe, `fs.lstat(localPath).isSymbolicLink()` → SKIP drift-repair entirely for a symlinked node (a symlink IS the source of truth; reinstalling it is always wrong) OR `fs.unlink` the link not `fs.remove` the target. Cardable hardening, NOT release-blocking. User must manually recreate the MpiNodes dev symlink post-test. | **done** (MpiNodes case FIXED this session via the dev-mode skip; the GENERAL-symlink hardening is documented in comfy_engine.md § 2.5c "dev-symlink escape hatch" + stays a cardable follow-up per the handoff optional list) |
| `mpi-ci/cubric-vision-pod/Dockerfile` RIFE bake | cross-repo (cosmetic divergence) | Dockerfile bakes RIFE from HF (`marduk191/rife`); dependencies.js now points RIFE at R2. Both byte-identical (same sha). The Dockerfile note says "url+sha mirror dependencies.js EXACTLY" — now technically divergent on the URL host (not sha). Optional: switch the Dockerfile RIFE `dl` to the R2 URL for parity on the next Pod rebuild. NOT worth a rebuild alone. | **deferred** (cosmetic, cross-repo, sha-identical — fold into the next Pod rebuild's diff, not worth a rebuild alone; NOT a Phase-7 doc row) |

---

## Notes

- Cross-repo (`c:\AI\Mpi\mpi-ci`) edits (Phase 5) get their OWN commit via `git -C`; they are logged here but committed separately.
- This ledger is the Phase 7 checklist. A change is not "done" until its code row lands AND every re-eval row it spawned is closed.
