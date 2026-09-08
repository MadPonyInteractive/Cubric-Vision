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
- [x] **Remove the three `release-baselines/*.json` before the re-cut.** They say
      `toVersion: 1.5.0` (commit `22239f5e`). If 1.5.0 never shipped, the newest version any
      user holds is 1.4.4, so that baseline makes the next build emit a `1.5.0 -> next` delta
      no user can apply. An absent baseline makes mpi-ci ship a FULL bundle, which serves
      1.4.4 and everything older. Restamp from the published full build afterwards.
- [x] Fold in MPI-708's updater-bridge tasks (widened asset pattern, relaunch resolution,
      appId acceptance) — same cut, see that card's Phase 0b. **All three landed here**, with
      `tests/updater-rename-bridge.test.cjs` covering each of that phase's Verify clauses.
      Phase 0b's own fourth item ("cut and publish 1.5.1") is superseded: 1.5.1 merges into
      the 1.5.0 re-cut, so there is no separate bridge release.

## The release gate was red for a reason that was not true — DONE

`npm run release:check` refused the re-cut on stale smoke evidence. The staleness rule was
"node_lock.json changed after the evidence -> every row is stale", and node_lock had changed:
`ace2161e` moved the MpiNodes pin to v1.2.11. But that hop changed **four** classes out of
~120, and the blunt rule condemned all 37 rows, demanding a 290 GB full matrix to re-prove
image ops the pin cannot reach.

- [x] `scripts/engine-drift.mjs` — narrow the rule to the graphs a changed class can actually
      reach. Per-CLASS source comparison, not per-module: `MpiClearVramEnd` landing in
      `vram.py` must not condemn `MpiClearVram`, which nearly every graph loads. A changed
      module *shell* still condemns every class in that module, since a shared helper moving
      can carry behaviour with it. Every unanswerable question — core bump, third-party pin,
      missing checkout — returns the blunt refusal.
- [x] Both twins call it, so they cannot disagree about what "stale" means:
      `release-health-check.mjs` (the gate) and `smoke-workflows.mjs` `loadMergeBase` (which
      refused to merge a scoped run into stale evidence, i.e. "run the FULL matrix").
- [x] `dev_configs/engine-attestation.json` — where a human records that a changed class
      cannot affect a shipped graph, per class, with the reason. **Pinned to the exact
      `from`/`to` hop**: the moment either pin moves it stops applying, so it can wave through
      one reviewed hop and never becomes a standing `--allow-unproven-engine`.
- [x] No smoke run, and none needed: of the four changed classes, `MpiClearVram` is a pure
      extract-method refactor, `MpiClearVramEnd` is in no runtime graph at all, and
      `MpiSaveVideo` + `MpiWindowedSampler` were executed for real 18 times on 2026-09-07.
      Evidence in `validation.md`.

## The gate that let this ship — DONE

- [x] `docs/playbooks/install-test/README.md` — the one-line update bullet is now a real
      leg (§ 3): update from an install **at least two released versions behind** (one-behind
      passes even with the applier broken, because a delta's `fromVersion` IS that install),
      assert the app WORKS afterwards with a generation whose output is opened and looked at,
      and record the result. A surviving `user-data\` is called out as necessary, never
      sufficient.
- [x] `scripts/release-health-check.mjs` — `checkUpdateEvidence()` refuses a release with no
      `dev_configs/update-evidence.json`, or one whose `toVersion` is not this build, whose
      `fromVersion` is unpublished or only one release behind, or which records no opened
      generation artefact. Skips with a warning when fewer than two releases precede this one.
- [x] **Publish-time only, behind `--publish` / `npm run release:check:publish`.** `release:check`
      runs at the version-bump gate, long before an artifact exists to install-test — an
      unconditional gate would block every bump. The default run now says out loud that the
      update-test evidence was NOT checked.
- [x] `docs/releases/portable-distribution-contract.md` — `fromVersion` documented as a
      precondition (§ Delta update details), including that a delta reaches only the users
      exactly one version behind and everyone further back needs a FULL bundle; § Validation
      Gate now demands the two-behind + generation evidence.
- [x] `.claude/skills/mpi-release/SKILL.md` step 6 — the publish step runs the leg and
      `release:check:publish`. Outside the handoff's named three, added because a gate nobody
      invokes is a false done.

## Spun out

- [ ] **New card needed:** the top-level `resources/cubric/update-manifest.json` is stale on
      real installs (said 1.3.0 while the app was 1.5.0, across two in-place updates) even
      though MPI-523 made the applier copy it and that unit test passes. MPI-523's fix does
      not hold in the field. Not blocking, not fixed here.
