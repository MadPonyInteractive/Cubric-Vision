# MPI-674 Checklist

Phase 2 of MPI-672. Derived from `tasks/MPI-674/brief.md` § "What done looks like",
not from the umbrella plan's phase titles — the umbrella's phases ARE its three
member cards, and this is one of them.

- [x] Import-aware engine health — read from the engine's OWN stdout, not from a
      `/object_info` class diff. See `validation.md` § "Why not the class diff".
- [x] Fold the verdict into the EXISTING degraded-engine signal (`depsWarning` →
      `state.comfyDepsWarning`), not a second parallel concept
- [x] A repair a release build can reach: `POST /engine/repair-python-deps` clears
      the curated-deps marker and stops the engine; Settings → Engine health is the
      control; `localEngine.repairPythonDeps()` owns the sequence
- [x] Update MPI-673's `DEPS_BROKEN_MESSAGE` to name that repair
- [x] Verify against `D:\tmp\cu126-repro`: fires on the 5-`IMPORT FAILED` engine,
      silent on the healthy one — at five chunkings including 1 byte
- [ ] Close-out: dispose of `D:\tmp\cu126-repro` (~10 GB) or hand its ownership to
      a named card. **Deliberately still open** — 1.4.3 is unreleased, and this is
      the only place the broken state exists on demand.

## Folded in (discovered while implementing)

- [x] `checkUniversalWorkflowDepsStatus` is NOT made import-aware, and the boot gate
      at `js/shell.js:335` is NOT the place this fires. Both are in the brief; both
      are impossible as written. Reasoning and evidence: `validation.md` § "The brief
      asked for something that cannot work".
- [x] MPI-673's desktop spec asserted the old dialog wording. The copy change is
      mine, so the assertion is mine to repair.
