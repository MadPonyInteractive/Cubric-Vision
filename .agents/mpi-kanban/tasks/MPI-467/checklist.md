# MPI-467 Checklist

- [x] Playbook skeleton — `docs/playbooks/bump-engine/` (README + `01-smoke-run.md`), routed
      from `docs/README.md` + `docs/playbooks/README.md`; `docs/versioning.md` healed
- [x] Smoke runner — `scripts/smoke-workflows.mjs`; `--self-check` and `--plan` both pass
- [x] Release gate — `checkSmokeEvidence()` in `scripts/release-health-check.mjs`, live in
      `npm run release:check`; all four branches proven; `mpi-release` precondition added
- [~] Free verification — `--plan` and `--self-check` ran; the **live GPU survey did not**
      (app not running on `:3000`)
- [ ] Proving run (scheduled with the user) — volume create + ~281 GB fill + one full pass
