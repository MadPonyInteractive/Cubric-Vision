# MPI-676 Checklist

- [x] `tests.yml` — a push gets a group of one (`github.run_id`); PRs keep the ref
      group and keep cancelling. Comment names both failure modes.
- [x] First attempt (`cancel-in-progress` off, ref group kept) proved wrong on a live
      run — it queues rather than cancels, and the NEXT push cancels the pending run.
      See brief.md § First attempt.
- [x] Pushed; run 33493638590 was `in_progress` 13s later, not `pending`
- [x] Run 33493351437, already 3m31s in, was NOT cancelled — both finished green
- [x] Run 33493638590 green (5m07s, `npm test` + `npm run test:desktop`)
- [x] `.husky/pre-push` untouched
