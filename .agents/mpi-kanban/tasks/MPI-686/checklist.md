# MPI-686 Checklist

- [x] `jobDisplayName(jobId)` extracted and exported from `js/shell/notificationService.js`,
      with the missing FLOWS clause added
- [x] Both surfaces fixed by one change — the in-app toast and the OS notification body
      share the same `message`
- [x] `tests/job-display-name.test.cjs` — every flow, plugin and model announces its title;
      nothing a user reads carries the `<namespace>:<id>` shape
- [x] Tripwire for the FOURTH entity: the test discovers every `*DepKey` helper the
      registries export and fails when one appears without a clause
- [x] Mutation-checked both ways
- [x] `npm test` green
- [x] Closed on unit evidence, on the user's call 2026-09-04 — `voice-changer` is
      asserted BY NAME against the live registry, so a live install would re-observe what
      the test already pins. No live run performed; see validation.md.
