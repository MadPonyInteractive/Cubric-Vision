# MPI-335 - Publish 1.1.0 GitHub Release

Deferred to a later session (user, 2026-07-22). All prep done + verified; only the
public publish remains. Run the `mpi-release` skill.

## State at defer
- master HEAD: 7ffc3242 (pushed) - UI fixes + notes + re-approval
- release:check: green | notes re-approved
- 6 artifacts verified: D:\CubricStudio\Vision\Builds\v1.1.0\ (3 full + 3 delta)
- Delta update 1.0.1 -> 1.1.0 PROVEN live (18+ chain, engine 0.27.0, models kept)
- CI artifacts cleaned

## Remaining (mpi-release steps 4-6)
1. Move the v1.1.0 tag to master HEAD (currently on pre-fix commit; bytes already
   match HEAD since built via workflow_dispatch on master - only the ref is stale).
   `git tag -f v1.1.0 <head> && git push -f origin v1.1.0`
2. Gate 2: user reviews the release body (github-release-checklist.md claim
   boundary + platform-disclosure block).
3. `gh release create v1.1.0 --repo MadPonyInteractive/Cubric-Vision` + attach all
   6 artifacts (full builds AND delta bundles).

## Notes
- Latest public release = v1.0.1. No 1.1.0 github release yet.
- Comms (Patreon/Discord/etc) are OUT of scope - separate manual step.
