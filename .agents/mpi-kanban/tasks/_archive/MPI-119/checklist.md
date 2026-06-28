# MPI-119 Checklist

- [x] Read updated skills (build-pod-image, version-bump, apply-patch, merge-branches, release-public) + versioning rule
- [x] Diff candidates vs skills; report gaps to user
- [x] A — bump/rebuild trigger table (research/trigger-table.md)
- [x] 1 — v-prefix tag guard in build-pod-image
- [x] 2 — public pull-verify step (5a)
- [x] 3 — /wrapper/stats boot smoke (5b)
- [x] 4 — "done = pulled+booted+verified" codified
- [x] B — Stop reminder hook + wired in settings.json
- [x] C — hook-vs-skill division documented
- [x] hook self-test + live smoke + settings JSON valid
- [ ] User validates approach (then card -> done)
- [ ] Live-validate hook fires on a real session-end with a trigger-path edit (organic, future session)
