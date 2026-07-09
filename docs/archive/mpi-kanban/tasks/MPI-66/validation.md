# MPI-66 Validation

## Root cause + fix (2026-06-10)

Windows update bundle was 391 MB (5356 files = whole app) vs mac/linux ~1 MB delta.

- NOT line-ending hashing: unchanged text files hash identically baseline-vs-build
  (verified by diffing 5 sample .md/.json hashes — all SAME).
- REAL cause: mpi-ci reads `release-baselines/${matrix.platform}-${matrix.arch}.json`.
  Windows matrix `platform: win32` → looks for `win32-x64.json`, but the file was
  `windows-x64.json` (artifact label). Never matched → log "No baseline for
  win32-x64; full bundle" → full bundle every Windows build. darwin/linux matched
  by coincidence (matrix platform == label).
- FIX (commit 27ebd9b): renamed `windows-x64.json` -> `win32-x64.json`; README now
  documents the filename must track the CI matrix `platform` (win32), not the label.
- 1.0.0 ships full installs (unaffected). The fix makes the 1.0.0 baseline name
  correct so 1.0.1 onward gets true minimal Windows deltas. Will be confirmed on
  the first post-1.0.0 Windows delta build.
