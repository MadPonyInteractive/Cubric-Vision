# MPI-719 — `cancel()` races every concurrent disk scan

> **This is a code trace, not executed.** Every claim below was read off the working tree
> and two captured logs on 2026-09-10; nothing was run. Repro is step one.
>
> Umbrella: MPI-717, Phase 3. Independent of Phases 1-2 in code; sequenced after them only
> because all three write `docs/download-manager.md`.

## What the log shows

A beta user's `app.log`, 2026-09-10 (kept outside git:
`C:/AI/Mpi/_private/cubric-download-telemetry/`). The user pressed Cancel on an install
at 17:13:10.47 (the `installStore` "Illegal transition … → cancelled" warns mark it). At
17:13:10.575 — 102 ms later — the server logged:

```
[ERROR] [comfy] models/check failed
  Error: ENOENT: no such file or directory, stat '<models root>/loras/krea-2/control/depth-control-lora.safetensors'
```

and a second one, same shape, on a `.cubricdl` MARKER under `loras/flux2-klein/`. Two
`/comfy/models/check` calls answered 500. The renderer's `syncModelInstalled`
(`js/data/modelRegistry.js`) catches, logs `syncModelInstalled failed`, returns false —
one reconcile dropped each time, and the Model Library keeps showing whatever it showed
before the cancel.

## Where it is

**The writer.** `FileDownloader.cancel()` in `routes/downloadManager.js`: stop the stream,
`fs.remove(localPath)`, then `clearDownloadMarker(localPath)`. Two steps; the order does
not matter — either one leaves a window, and a walker stats the marker file too.

**Two readers, both reached from `POST /comfy/models/check` (`routes/comfy.js`):**

- `resolveComfyPath` (`routes/shared.js`, the one resolver since MPI-654) →
  `findFileRecursive`: `readdir`, then an unguarded `fs.stat` on EVERY entry, markers
  included. This is the marker ENOENT.
- `isDepInstalledOnDisk` → `getPartialBytes` → `getPartialDownloadState`
  (`routes/downloadCompletion.js`): `hasDownloadMarker`, `pathExists(file)`, then an
  unguarded `fs.stat(file)`. This is the weight ENOENT — the marker and the file both
  passed their existence checks, and the file was gone by the stat.

`findFileRecursive` is a shared primitive — grep its callers before editing; the fix is
one pass over the primitive, never a guard at one call site.

## Why this is the root cause and not a symptom patch

Read `.claude/rules/root-cause.md` before touching this: a try/catch at a crash site is a
FALSE DONE. This card is not that, and the brief has to say why or the next agent will
reject it:

- No lock coordinates a route reader with a cancel, and none should — a scan that blocks
  behind a download's lifecycle is worse than the race.
- Therefore "an entry vanished between `readdir` and `stat`" is a DEFINED outcome of
  walking a live tree, not an exceptional one. The primitive that does not handle it is
  the defect. Same for a partial whose file is removed between `pathExists` and `stat`.
- The handling is narrow: `err.code === 'ENOENT'` → the entry is absent (skip it / not
  resumable). Anything else — EPERM, EIO, EBUSY — still throws, so a real I/O fault still
  surfaces as the 500 it should be. A blanket catch would be the symptom patch.
- Node's promise `fs.stat` has no `throwIfNoEntry` (that is `statSync` only), so this is a
  code check on the error, not an option flag.

`cancel()` itself stays as it is. Reordering its two deletes does not close the window, and
`routes/downloadManager.js` is owned by Phases 1-2 of the umbrella while they run.

## Relation to MPI-513

Same symptom family — install state the UI shows disagreeing with the disk — and NOT a
member. MPI-513's root is two writers for one install (`_modelJobs`/`_depJobs` versus
`installStore`) and its plan is "single writer first, then re-test the symptoms". A single
writer does not close a filesystem window. Do not park this behind MPI-320.

## Repro — step one

A deterministic unit test, `tests/download-scan-race.test.cjs`, no timing:

1. `findFileRecursive` over a temp tree where `fs.readdir` is stubbed to return one extra
   name that does not exist on disk. Today: throws ENOENT out of the walk. After: skips it
   and still finds the real file.
2. `getPartialDownloadState` on a path whose marker exists and whose file is removed by a
   stubbed `fs.stat` that throws ENOENT once. Today: throws. After: `{ resumable: false }`.
3. Negative control: the same stubs throwing `EPERM` still propagate, both readers.

Then the live shape, once, on this box (own instance, never `:3000`): start a multi-dep
install, cancel it while the Model Library is open, grep `logs/app.log` for
`models/check failed` — zero after the fix.

## Verify

- `node tests/download-scan-race.test.cjs` — three cases.
- Re-read the captured log: both `models/check failed` errors would be absent and both
  reconciles would have completed. Name that in the close-out.
- `docs/download-manager.md`: one line where `findFileRecursive` / the marker contract is
  described — a walker tolerates ENOENT because cancel deletes in two steps.

## Not in scope

- The `installStore` "Illegal transition complete → cancelled" warn burst at cancel — known,
  documented in `docs/download-manager.md`, left for MPI-320.
- Making cancel atomic (a rename-then-delete or a single directory) — larger than the
  defect and still does not protect a reader mid-walk.
