# MPI-719 Validation

Phase 3 of umbrella MPI-717. Executed 2026-09-11 on master.

## What shipped

Both readers that walk the live models tree now treat ENOENT as "absent" and re-throw every
other error code. `FileDownloader.cancel()` is untouched, as the brief required.

- `findFileRecursive` (`routes/shared.js`) — ENOENT out of `readdir` returns `null`; ENOENT
  out of the per-entry `fs.stat` skips that entry and the walk continues. The `pathExists`
  that guarded the `readdir` is gone: the `readdir` is now its own existence check, so the
  absent-root contract `remotePodState._resolveLocalModelPath` relies on is preserved with
  one syscall fewer and no window between the two.
- `getPartialDownloadState` (`routes/downloadCompletion.js`) — the `stat` IS the existence
  check. The preceding `pathExists` only narrowed the window; ENOENT from the stat returns
  the same `{ resumable: false, reason: 'missing-file' }` verdict it used to return.

Call sites swept in one pass — none relied on the throw: `resolveComfyPath`
(`routes/shared.js`), `_resolveLocalModelPath` (`routes/remotePodState.js`),
`_localModelsCheck` (`routes/comfy.js`), and the three `getPartialBytes` sites in
`routes/downloadManager.js`. The rest of the `/comfy/models/check` path was already safe:
`isCompleteOnDisk` / `hasDownloadMarker` are `pathExists`-only, and `isNodeInstalledOnDisk`
already try/catches its `readdir`.

## Evidence

- `node tests/download-scan-race.test.cjs` → **3 passed**: a `readdir` entry that is not on
  disk is skipped and the real file is still found (plus an absent root still reads `null`);
  a marked partial whose file was really deleted reads `{ resumable: false, missing-file }`;
  EPERM out of `stat` and EACCES out of `readdir` still propagate out of BOTH readers.
- **The test is a real regression guard, proven rather than asserted.** The pre-fix bodies
  were materialised from `HEAD` beside the live ones and driven through the same two shapes:
  case 1 threw `ENOENT ... stat` out of the walk, case 2 threw `ENOENT ... stat` out of the
  partial read. Post-fix neither throws. The temporary copies were deleted.
- `npm test` → **918/918 pass, 0 fail** (917 before; this file is the +1).
- `npx eslint routes/shared.js routes/downloadCompletion.js tests/download-scan-race.test.cjs`
  → clean, exit 0.
- Captured logs re-read (both runs, kept outside git; paths deliberately not on the board):
  - `17:13:10.575` — `models/check failed`, ENOENT stat on a `krea-2/control` **weight**,
    102 ms after the cancel at `17:13:10.47`. Gone after this fix: whichever reader stat-ed
    it now reports absent instead of rejecting the route.
  - `17:16:49.321` — `models/check failed`, ENOENT stat on the **`.cubricdl` marker** of
    `klein-lora-refcontrol-depth`. Only `findFileRecursive` ever stats a marker path, so that
    one is pinned to the walker; it now skips the entry.
  - Each error cost one `syncModelInstalled` reconcile (the renderer catches and returns
    false), which is why the Model Library kept showing pre-cancel state.

## Finding: the window is not cancel-only

The brief called both errors "102 ms after a cancel". The re-read says otherwise for the
second one, and it makes the root cause *wider*, not narrower: `klein-lora-refcontrol-depth`
started at `17:16:13.939` and the marker ENOENT lands at `17:16:49.321`, with the next cancel
not until `17:17:44.978`. That is a dep **completing** — `clearDownloadMarker()` on success
removes a marker under exactly the same unlocked walk. So every marker deletion races the
scan, not just cancel's. Same reader-side fix covers both; nothing further is owed.

## Not done, deliberately

The brief's optional live shape (start a multi-dep install on an isolated instance, cancel it
with the Model Library open, grep `app.log` for `models/check failed`) was not run: it costs a
real multi-GB download, and Phase 3's `→ verify` line in `tasks/MPI-717/plan.md` names only the
deterministic race test. The captured log re-read above answers the same question from real
data. Say the word and it runs.

## Docs

`docs/download-manager.md` gained "A disk scan walks a LIVE tree — ENOENT is absent, not an
error (MPI-719)": why no lock exists, the ENOENT-vs-everything-else contract in both
primitives, MPI-716's write probe brushing the same window, and why `throwIfNoEntry` is not
available on the promise API.
