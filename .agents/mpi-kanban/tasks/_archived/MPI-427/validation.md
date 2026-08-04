# MPI-427 validation

Closed on the **v1.3.1 release**, 2026-08-02.
<https://github.com/MadPonyInteractive/Cubric-Vision/releases/tag/v1.3.1>

## What proves it

- **Live, both directions, before the release.** An isolated harness ran the REAL
  `startUniversalWorkflowInstall` against a throwaway `CUBRIC_ENGINE_ROOT` with one
  reachable github.com node and one weight on an unreachable `.invalid` host — the
  reporting user's exact two-host split. Pre-fix (`7a6fdfe8`): node folder discarded,
  `.mpi_node_commit` missing, leftover zip. Post-fix (`f50f8629`): 36 entries, marker at
  the pinned SHA, no zip. Table in `checklist.md` § VERIFIED LIVE.
- **301/301 node suites** green on branch `1.3.1`, eslint clean, `release:check` passes.
- **Shipped from the maintenance lineage, not master.** `git diff v1.3.0 1.3.1` = 23 files,
  all download/engine/boot/release — zero masking, zero workflow work.
- **Built and published from the exact reviewed commit.** mpi-ci run 30755518372 built ref
  `1.3.1` @ `5328c033`; `git rev-parse 'v1.3.1^{}'` resolves to the same SHA.
- **Delta bundles are real deltas on all three platforms** — `from 1.3.0 -> 1.3.1`,
  21 changed / 0 deleted, 1.17 / 1.17 / 1.67 MB. Baselines restamped post-publish to the
  1.3.1 full manifests (6420 / 6385 / 6565).

## NOT proven, deliberately

- **No end-user confirmation yet.** The reporting user has not re-tested on 1.3.1. The fix
  is proven against a reproduction of his failure mode, not against his machine.
- **The mirror never executed.** `_MODEL_MIRRORS` ships empty by design — split to
  **MPI-429**, which owns the second origin and the open question of whether a
  same-provider mirror survives DPI.
- Windows tested on the maintainer's dev machine only; macOS artifacts are
  maintainer-untested. Standard disclosure, stated in the release body.
