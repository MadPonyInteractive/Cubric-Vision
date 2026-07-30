# MPI-398 Checklist

- [x] Temp probe in place (routes/_probe398.js + one mount line in server.js), app fully restarted
- [x] Pod connected, sitting IDLE on the Model Library
- [x] 60s idle sample taken: requests-per-minute per wrapper path + per local route
- [x] One /wrapper/models/status round trip timed in isolation
- [x] Verdict: volume vs per-call latency, and whether MPI-326's storm regressed or was only half-fixed
- [x] Root cause fixed at the source, offender 1: /wrapper/disk (to_thread + single-flight + 60s TTL) -> 0.2.39
- [x] Root cause fixed at the source, offender 2: /wrapper/models/status (to_thread) -> 0.2.40
- [x] Published to the R2 dev channel, confirmed live via wrapperVersion, published sha == local sha
- [x] Post-fix proof: no starvation during a real du OR during two real status scans; 8-way single-flight
- [x] COLD-OPEN CHECK user-verified on a FRESH Pod - "it was instant" (was a 10-15s blank grid)
- [x] validation.md written from the measured numbers, including the two hypotheses this session got wrong
- [x] mpi-ci README + publish-runtime.sh corrected: restart-comfy does NOT reload wrapper.py
- [x] User-facing changelog entry in docs/releases/UNRELEASED.md (fixes)
- [x] Probe reverted (routes/_probe398.js deleted, server.js mount line removed - server.js diff now empty)
- [x] mpi-ci committed (e760604)
- [ ] Cubric-Vision committed by explicit pathspec
- [ ] NOT PROMOTED, deliberately: dev 0.2.40 vs stable 0.2.38. mpi-release owns that gate
      (.claude/skills/mpi-release/SKILL.md - "never auto-promote", same class as git push).
      Released users get this fix on the next release, at which point promote is required
      or they ship an app expecting a runtime they do not have.
- [ ] Card close: user's explicit go
