# MPI-719 Checklist

Phase 3 of umbrella MPI-717. Reader-side fix; `FileDownloader.cancel()` is not touched.

- [x] `findFileRecursive` (`routes/shared.js`) tolerates ENOENT: a dir that vanished before
      its `readdir` returns null; an entry named by `readdir` that is gone by its `fs.stat`
      is skipped. Any other error code still throws.
- [x] `getPartialDownloadState` (`routes/downloadCompletion.js`) tolerates ENOENT: a marked
      file removed before its `fs.stat` reads `{ resumable: false, reason: 'missing-file' }`.
      Any other error code still throws.
- [x] Every call site checked in one pass (`resolveComfyPath`, `remotePodState`,
      `_localModelsCheck`, the three `getPartialBytes` sites in `downloadManager.js`) —
      none relied on the throw.
- [x] `tests/download-scan-race.test.cjs` — three cases: vanishing `readdir` entry skipped
      and the real file still found; marker whose file vanished reads not resumable;
      EPERM still propagates out of BOTH readers.
- [x] `npm test` green, eslint clean.
- [x] `docs/download-manager.md` records the contract: a walker tolerates ENOENT because
      cancel deletes the partial and its marker in two steps with no lock.
- [x] Close-out names the two captured `models/check failed` ENOENT errors this would have
      prevented (evidence folder is outside git; do not paste its path on the board).
