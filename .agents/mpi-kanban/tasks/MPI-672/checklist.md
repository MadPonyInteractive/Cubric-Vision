# MPI-672 Checklist

Derived from `plan.md` § Phases (phased plan → one item per phase).

- [x] Phase 1 — make the failure visible and reportable (MPI-675 `e152cc10`, MPI-673 `fc6f4336`, plus `54f03caf` for the CI race)
- [x] Phase 2 — make it detectable and self-healing (MPI-674 `a2a14de3`)
- [ ] Phase 3 — release 1.4.3 off branch `1.4.2`
  - [x] Push branch `1.4.2` to origin (was local-only at `88fcda76`)
  - [x] Port `e152cc10`, `fc6f4336`, `54f03caf`, `a2a14de3` onto it — code paths only, no `.agents/`
  - [x] `npm test` (626/626) + `npm run test:desktop` on the branch — see `validation.md`
  - [x] `/mpi-release` step 1–3 — 1.4.3 stamped, notes approved by Fabio, `release:check` green, committed `f7939337` and pushed
  - [ ] `/mpi-release` step 4 — push the `v1.4.3` tag (fires the CI build), download the 6 artifacts
  - [ ] `/mpi-release` steps 5–7 — release body, `gh release create`, prove `releases/latest` is reachable
  - [ ] Cherry-pick the `release-baselines/*.json` restamp onto the branch after publish
  - [ ] Delete `D:\tmp\cu126-repro` (~10 GB) — the umbrella owns it now, not MPI-674
