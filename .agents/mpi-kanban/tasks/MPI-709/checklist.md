# MPI-709 Checklist

## Root cause fix — DONE, evidence in validation.md

- [x] `apply-update.cjs`: refuse a delta whose `fromVersion` does not match the installed
      version. `fromVersion: null` means a full bundle and stays universally applicable.
- [x] Read the installed version from the app's own `package.json`, **not** from
      `update-manifest.json` — the manifest was measured stale by two whole updates on the
      real install, so keying off it would have refused legitimate deltas.
- [x] Refuse, do not guess, when the installed version is unreadable.
- [x] The check sits ahead of the first write, so a refused bundle leaves the install
      byte-identical.
- [x] Error text points at the next update, never at a reinstall — a fresh download has no
      `engine/` and costs the whole ComfyUI download again.
- [x] Tests: full bundle applies onto anything; matching delta applies; mismatched delta
      refuses and changes nothing; unreadable version refuses. **906/906 green.**
- [x] Replayed against the REAL shipped `...update-v1.5.0.zip` (`fromVersion: 1.4.4`,
      116 files) — refused, install untouched.

## Re-cut 1.5.0 as a FULL bundle

1.5.0 had **2 downloads, both Fabio's own**, so no external user ever held it. It is deleted
and re-cut carrying this fix, rather than issuing a 1.5.1 — no phantom version.

> **A full update BUNDLE is not a fresh install.** `build-portable.mjs` excludes `engine/**`
> and `apply-update.cjs` applies in place, so a full bundle rewrites every app file while
> keeping the engine, the models and `user-data/`.

- [ ] Delete `refs/tags/v1.5.0` on origin — the release deletion does not remove it, and the
      version cannot be re-cut while it exists.
- [ ] Delete or re-point `refs/heads/1.5.0` (currently `a8691834`).
- [ ] **Remove the three `release-baselines/*.json` before the re-cut.** They say
      `toVersion: 1.5.0` (commit `22239f5e`). If 1.5.0 never shipped, the newest version any
      user holds is 1.4.4, so that baseline makes the next build emit a `1.5.0 -> next` delta
      no user can apply. An absent baseline makes mpi-ci ship a FULL bundle, which serves
      1.4.4 and everything older. Restamp from the published full build afterwards.
- [ ] Fold in MPI-708's updater-bridge tasks (widened asset pattern, relaunch resolution,
      appId acceptance) — same cut, see that card's Phase 0b.

## The gate that let this ship — NOT STARTED

- [ ] `docs/playbooks/install-test/README.md:75` — the update leg says only "confirm
      `user-data\` SURVIVES". On the broken install user-data DID survive, so the test would
      have reported PASS. Require updating from a version **at least two behind**, and assert
      the app actually works afterwards (a real generation), not just that files survived.
- [ ] `scripts/release-health-check.mjs` — refuse a release with no recorded update-test
      evidence, mirroring the existing smoke-evidence gate.
- [ ] `docs/releases/portable-distribution-contract.md` — document the `fromVersion`
      precondition as part of the contract.

## Spun out

- [ ] **New card needed:** the top-level `resources/cubric/update-manifest.json` is stale on
      real installs (said 1.3.0 while the app was 1.5.0, across two in-place updates) even
      though MPI-523 made the applier copy it and that unit test passes. MPI-523's fix does
      not hold in the field. Not blocking, not fixed here.
