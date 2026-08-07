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

1. Bring up a Pod and connect the app in remote mode.
2. **Read-only classification FIRST.** Comment out the delete loop's body in
   `_sweepOrphanedDepsRemote` (keep the `remote sweep: N protected, N eligible, N on
   volume` log line, which already runs before any delete), restart, uninstall a model
   with `deleteFiles=true`, and read the line out of
   `%APPDATA%\Cubric Vision\logs\app.log` filtered by `[download]`. The local equivalent
   read `65 protected / 41 eligible / 0 on disk`, and that read-out is what proved it
   would do the right thing. Revert the comment-out afterwards.
   (Route-probe pattern: memory `tool_runpod_live_api_probe`; `routes/` changes need a
   FULL restart, memory `tool_main_process_no_hot_reload`.)
3. Confirm the eligible list contains nothing surprising before allowing a real delete.
4. Then run it for real and confirm from the wrapper that the swept files are off the
   volume, and that a sibling model sharing deps is still INSTALLED afterwards.

`swept 0` is a valid pass — do not manufacture an orphan to watch it fire.

## Why the bar is not negotiable

Both directions of this guard have failed live: MPI-310 destroyed 5.24GB of user data
with an adjacent change to it, and MPI-258 B1 left ~19GB undeletable swinging the other
way. Pair the run with MPI-385 (Pod-session umbrella).
