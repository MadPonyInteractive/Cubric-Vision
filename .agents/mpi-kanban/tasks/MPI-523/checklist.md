# MPI-523 — checklist

Root cause read from the code on pickup, 2026-08-30: `createUpdateManifest`
(`scripts/build-portable.mjs`) calls `buildFileEntries(stageRoot)` and only *then* writes
`resources/cubric/update-manifest.json` into that same stage root. The manifest therefore
cannot list itself — the bundle carries N+1 members and `files[]` has N. `apply-update.cjs`
copies exactly `manifest.files`, so the manifest never lands in the install and the installed
copy keeps whatever the last FULL extract left there.

Chosen end state: **refresh it on apply** (the plan's first option). The build side cannot fix
this — a manifest cannot contain its own hash — so the applier is where the fix belongs.

- [x] `apply-update.cjs` copies the bundle's `update-manifest.json` into the install after the
      `manifest.files` loop, through the same `copyManifestFile` path so it is backed up into
      the rollback root like every other file.
- [x] A test proves it: fake install + fake extracted-directory bundle, run the applier as a
      child process, assert the install's `update-manifest.json` `toVersion` matches the
      bundle's and no longer the pre-update value.
- [x] Mutation-checked — commenting the copy out fails the test on
      `actual: '1.3.0', expected: '1.4.0'`.
- [x] Full suite green (`npm test`): 798/798.
- [x] The permanence of the cause written into the subsystem doc, so nobody "fixes" it on the
      build side: `docs/releases/portable-distribution-contract.md` § Delta update details.
