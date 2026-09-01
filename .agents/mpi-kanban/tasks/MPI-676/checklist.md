# MPI-676 Checklist

- [ ] `tests.yml` — `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`,
      with a comment naming why master must never be cancelled
- [ ] Push and confirm the master run for that push runs to a conclusion
- [ ] Confirm a second push landing on top does NOT cancel it
- [ ] No change to `.husky/pre-push` — it works once verdicts exist
