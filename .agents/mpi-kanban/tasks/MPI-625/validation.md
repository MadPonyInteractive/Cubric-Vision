# MPI-625 Validation

**`npm test` -> 739 tests, 739 pass, 0 fail** (was 738/1 fail before the fix, and 738 pass
after the test-only repair, +1 for the new hygiene test).

**Root cause proven, not inferred.** A probe against the real resolvers printed:

```
getDefaultModelsRoot = C:\Users\...\Temp\mpi462-probe3-32692   (the temp sandbox)
getCustomRoot        = G:/CubricModels                            (the real library)
boogu-edit-transformer-balanced -> ON DISK
boogu-qwen3vl-8b-clip           -> ON DISK
```

`_localSharedDepsMap(null)` then reported the encoder `protected: [Boogu Image Edit]`, so
`_orphanedDepIds` correctly refused to classify it as an orphan.

**The guard was mutation-tested, not assumed.** Removing the
`require('./helpers/sandbox-roots.cjs')` line from `tests/orphan-sweep-remote.test.cjs`
made `tests/sandbox-roots-hygiene.test.cjs` exit 1; the file was restored inside a
`finally` and `git diff` confirmed only the intended one-line addition remained.

**Not covered:** a new test that touches `localModelsCheck` while pinning NEITHER root.
The rule only catches the half-sandbox, which is the shape that actually shipped.
