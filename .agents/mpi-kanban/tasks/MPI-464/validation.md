# MPI-464 — validation

Status: **code complete, unit-verified, NOT closed.** The card's bar is a live Pod and it
has not been met. Do not move this to `done` on the evidence below.

## Proven locally (2026-08-07)

`tests/orphan-sweep-remote.test.cjs` — 5/5, and `npm test` 477/477 with it in the glob.
It runs the REAL `_remoteSharedDepIds` / `_orphanedDepIds` / `_sweepOrphanedDepsRemote`
against a fake volume (the two wrapper calls stubbed on the required `remoteModels`
module — no Pod, no network, no local disk):

- collects a dep no volume-installed model wants;
- refuses a dep a volume-installed model still wants (whole universe of
  `boogu-edit-balanced` on the volume defends the shared `boogu-qwen3vl-8b-clip`);
- **the inventory gate** — candidates eligible but nothing on the volume ⇒
  `remoteUninstallDep` is never called at all;
- an `unsupported` answer (pre-v0.4.0 image) is a whole-sweep no-op, one call then stop,
  never an error;
- the classifier never yields `custom_nodes`, universal, `targetPath` or `bakedOnPod`,
  with a guard asserting `bakedOnPod` deps still exist so that filter cannot go untested.

What this does NOT prove: that the wrapper's `/wrapper/models/status` answer for a
pseudo-model with ~40 deps is shaped the way the stub assumes on a real Pod, and that
`/wrapper/models/delete` actually removes the file from the volume in this path.

## The Pod leg — what still has to happen

**Prerequisite: check the Pod IMAGE first.** `/wrapper/models/delete` ships in image
v0.4.0 / wrapper 0.2.3. On anything older every delete answers `unsupported`, the sweep
correctly no-ops, and the run proves NOTHING about deletion — it only re-proves the unit
test. Confirm the image before spending the session.

Also make sure the volume is not empty: at least one model installed, ideally a tier
family sharing deps (LTX-2.3 high + balanced, or the Boogu pair), so protection is
non-trivial and step 4 has a sibling to check.

1. Bring up a Pod and connect the app in remote mode.

2. **Read-only classification FIRST — via a temp route, NOT by neutering the sweep.**
   The obvious version of this step (comment out the delete loop, then uninstall
   something) costs a real model uninstall to run a "read-only" check. Use the
   temp-route probe instead (memory `tool_runpod_live_api_probe`): add to
   `routes/downloadManager.js`, restart the app (a `routes/` change needs a FULL
   restart — memory `tool_main_process_no_hot_reload`), curl, then **revert**.

   ```js
   // TEMP MPI-464 probe — REVERT.
   router.get('/comfy/models/sweep-preview', async (req, res) => {
       const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
       const protectedIds = await _remoteSharedDepIds(null);
       const candidates = _orphanedDepIds(protectedIds).filter((id) => !DEPS[id].bakedOnPod);
       const out = await remoteModels.remoteModelsCheck([{
           id: '__sweep__',
           deps: candidates.map((id) => ({ id, type: DEPS[id].type, filename: DEPS[id].filename })),
       }]);
       const entry = (out && out.results && out.results.__sweep__) || {};
       res.json({
           protected: protectedIds.size,
           eligible: candidates.length,
           onVolume: (entry.deps || []).filter((d) => d.installed === true).map((d) => d.id),
           depsEchoed: (entry.deps || []).length,
       });
   });
   ```

   This is the sweep's classifier verbatim minus the delete loop, so it proves the two
   things the unit test cannot: that the wrapper answers a pseudo-model carrying ~40 deps
   (`depsEchoed` must equal `eligible` — a short echo means the wrapper dropped some and
   the inventory is lying), and what the real volume classification actually is. The local
   equivalent read `65 protected / 41 eligible / 0 on disk`.

3. **Read `onVolume` before allowing any delete.** Every id in it is a file the sweep will
   delete on the next remote uninstall. Nothing in that list may be something an installed
   model needs — that is the whole check, and it is the step MPI-310 skipped.

4. Only then run it for real: uninstall a model in remote mode with `deleteFiles=true`.
   Confirm from `app.log` (`[download]`) that `remote sweep: … deleted <id>` matches what
   step 3 predicted, that the model's own sibling sharing deps is still **INSTALLED**
   afterwards, and that a re-check does not re-report the swept files as present.

5. Second run with `deleteFiles=false` on another model: the sweep must not run at all
   (no `remote sweep:` line), because "keep files" keeps every file, not only the selected.

`swept 0` is a valid pass — do not manufacture an orphan to watch it fire. If step 3
reports `onVolume: []`, steps 4-5 still prove the wiring (the log line fires, nothing is
deleted); that is a pass, not an inconclusive run.

## Why the bar is not negotiable

Both directions of this guard have failed live: MPI-310 destroyed 5.24GB of user data
with an adjacent change to it, and MPI-258 B1 left ~19GB undeletable swinging the other
way. Pair the run with MPI-385 (Pod-session umbrella).
