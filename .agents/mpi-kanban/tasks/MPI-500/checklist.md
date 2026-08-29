# MPI-500 — checklist

Steps and their order live in `plan.md`. This is the tick list.

- [x] `js/core/storageKeys.js` — `RECYCLE_BIN_DELETE: 'mpi_recycle_bin_delete'`
- [x] `js/core/storage.js` — `getRecycleBinDelete` / `setRecycleBinDelete`, **default `false`**
- [~] `js/state.js` — NOT DONE, and deliberately. `plan.md` called for a state field, but
      nothing in the app reacts to this pref changing: it is read once, at uninstall time.
      The Auto-start toggle right above it in Settings is the precedent — it goes straight
      through `Storage.get*`/`set*` with no state key. One less file, same behaviour.
- [x] `MpiSettings.js` — plate + `_mountSwitchPlate` under "App Behavior"; copy says the bin
      does NOT free disk, and that a remote Pod always deletes
- [x] `js/services/downloadService.js` — send `useRecycleBin` on the uninstall POST
- [x] `routes/downloadManager.js` — read the field, thread into BOTH `_trash` sites
      (`_sweepOrphanedDeps` and the uninstall delete loop). **Absent field ⇒ permanent
      delete** — that is what keeps tests and agent sandboxes out of the developer's bin.
- [x] `tests/orphan-sweep.test.cjs` — one case per mode; the "file really gone" assertion
      (MPI-462) must not be weakened
- [x] `npm test` green (787/787), and the run leaves NO new Recycle Bin entries
- [x] live check on an isolated instance: plate renders, defaults off, survives a
      reload, and `useRecycleBin` reaches the wire true-then-false with the toggle

Not owned by this card:

- `docs/download-manager.md:479` documents today's two-outcome behaviour and needs the
  rewrite, but **MPI-653 holds that file** (in `doing`, working-tree modified 2026-08-29).
  Re-check or message that card before touching it.
- The remote (Pod-volume) leg — no Recycle Bin exists there, so the toggle does not apply.
