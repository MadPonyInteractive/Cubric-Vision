# MPI-522 — checklist

Card taken 2026-08-30 and found **already fixed**. No implementation work was done under
this id; the checklist records the verification that closed it.

- [x] Defect (2), the false green — `tests/portable-win-layout.test.cjs` no longer skips on a
      dev box. It falls back to a **junction** when `symlinkSync` returns EPERM, so the
      dangling-link assertion actually runs here.
- [x] Defect (1), the CI Windows miss — `assertNoDanglingSymlinks` no longer resolves with
      `fs.access`. On Windows `access` succeeds on a dangling reparse point, which is why the
      guard was inert; it uses `stat()` (follows the link, throws ENOENT) now.
- [x] Ran the suite locally: 8 pass, 0 fail, **0 skipped**.
- [x] Confirmed the primary defence is untouched — `shouldExcludeAppPath` still keeps
      `@cubric/connector` out of the staged tree, still separately tested.
