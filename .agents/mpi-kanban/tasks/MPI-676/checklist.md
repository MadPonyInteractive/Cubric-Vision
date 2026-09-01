# MPI-676 Checklist

- [x] `tests.yml` — a push gets a group of one (`github.run_id`); PRs keep the ref
      group and keep cancelling. Comment names both failure modes.
- [x] First attempt (`cancel-in-progress` off, ref group kept) proved wrong on a live
      run — it queues rather than cancels, and the NEXT push cancels the pending run.
      See brief.md § First attempt.
- [ ] Push and confirm the master run starts immediately instead of pending
- [ ] Confirm the run already in flight is not cancelled by it
- [ ] Run goes green
- [ ] No change to `.husky/pre-push`
