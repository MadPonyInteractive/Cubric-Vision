# MPI-523 — validation

Fixed 2026-08-30 on the applier side, which is the only side that can fix it.

## The cause, and why it is permanent

`createUpdateManifest` (`scripts/build-portable.mjs`) builds `files[]` with
`buildFileEntries(stageRoot)` and *then* writes `resources/cubric/update-manifest.json` into
that same stage root. A manifest carrying its own SHA256 is impossible, so the manifest can
never appear in its own list — 330 members on disk, 329 entries, exactly as the card measured.
`apply-update.cjs` copies precisely `manifest.files`, so the one file that says which version
is now installed was the one file never copied.

That rules out the "fix the build" reading: the applier must copy it explicitly. Done after
the `files[]` loop, through the existing `copyManifestFile`, so the replaced manifest is backed
up into the rollback root like every other overwritten file.

## Evidence

New test `tests/portable-update-apply.test.cjs` — a fake install holding a `toVersion 1.3.0`
manifest, a fake **extracted-directory** delta bundle (no zip, so the applier's
already-extracted path runs and `extract-zip` is not needed) whose manifest lists
`app/changed.txt` and not itself. The applier runs as a child process because
`apply-update.cjs` calls `main()` at load.

```
node --test tests/portable-update-apply.test.cjs
✔ applying an update refreshes the INSTALLED update-manifest.json
ℹ pass 1   ℹ fail 0
```

It asserts the ordinary file landed, the installed manifest now reads `toVersion 1.4.0` /
`fromVersion 1.3.0`, and the old manifest is recoverable from the rollback folder.

**Mutation-checked** — commenting out the one added line fails it on
`actual: '1.3.0', expected: '1.4.0'`, so the test is measuring the fix and not the scaffolding.

**Full suite:** `npm test` → **798 pass, 0 fail, 0 skipped**.

## Not verified here

A real end-to-end delta apply against a built artifact was not run — that needs a full
`build-portable.mjs` staging pass and a published baseline. The card's own filing already
established the runtime impact is nil (nothing reads the installed manifest: `findManifestRoot`
inspects the BUNDLE, and the next release's delta is computed at build time from
`release-baselines/`), so the cost being repaired is diagnosis time, and the applier's copy
path is the same one 300-plus files already travel on every update.

`npm run release:check` was run and **fails for an unrelated, pre-existing reason** — the
engine pin moved 0.31.0 → 0.34.0 since v1.4.2 and `smoke-evidence.json` is stale against it.
That is a GPU/Pod job and MPI-595's Gate B, not this card.

## Release gate

Closes the second and last member of **MPI-527** (Release artifacts that lie) — MPI-522 closed
the same day as overtaken. **The MPI-527 row on MPI-595's Gate A is now clear.**
