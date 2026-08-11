# MPI-499 Validation

## 2026-08-11 - closed on the fix commit

Written during MPI-537 close-out because the card was moved to `done` without one,
which the board validator rejects. The evidence below is quoted from the commits
that closed it, not reconstructed.

**Fix: `5aba85a3` - "orphan-sweep fixture wrote 30 GiB per npm test run".**
`tests/orphan-sweep.test.cjs` sized fake dep files with `ftruncateSync`, commented
"sparse ... costs no real disk". True on ext4/APFS, false on NTFS, which allocates
the full length - ~10.6 GiB for the orphan case plus ~20 GiB for the installed-model
case, every run. The code under test moves swept files to the Recycle Bin, so the
test's own `fs.rmSync` could never reclaim them, and `npm test` runs on every push;
the dev machine's bin had accumulated 39.4 GiB.

The premise was wrong to begin with: `isCompleteOnDisk()`
(`routes/downloadCompletion.js`) is `exists && no .cubricdl marker` and never stats
size, so the fixture only ever needed the file to exist. It now writes empty files.

**Verified in that session:** 5/5 tests still pass, and the file the fixed run
trashed reports 0 bytes in the Recycle Bin against 10,587,094,385 for the previous
run's.

**Residue, deliberately left open on MPI-526:** the sweep still trashes rather than
deletes, so each run leaves a zero-byte bin entry.

**Close-out: `0847d60e`.**
