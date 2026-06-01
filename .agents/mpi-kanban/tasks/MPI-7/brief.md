# Cubric Studio Docs subdomain + finish docs site

## Summary

Make the sibling docs site ready for `docs.cubric.studio` and replace the
migrated backlog note with an implementation-ready track.

The Stage redesign port is already present in the docs repo. Current local
state:

- Target repo: `C:\AI\Mpi\Cubric Studio (Docs)\`
- Docs repo `CNAME` already contains `docs.cubric.studio`.
- Docs repo branch is `main...origin/main [ahead 1]` when checked with
  `git -c safe.directory="C:/AI/Mpi/Cubric Studio (Docs)"`.
- Full docs shell is `index.html`; coming-soon page is parked as
  `index-soon.html`.
- Project rule hard block: do not push the Docs repo until the user explicitly
  says the docs site is ready to ship.

## Cooperation Model

Yes, this is partly a cooperation session with the user/dev.

The agent can implement and verify local files, expand docs content, wire local
search, prepare deployment notes, and run local smoke checks. The user/dev must
perform or supervise the external control-plane steps:

- Namecheap DNS record for `docs.cubric.studio`.
- GitHub Pages source/custom-domain settings for the Docs repo.
- HTTPS enforcement after DNS propagates.
- Final approval to swap from coming-soon/public gate to the full docs shell
  and to push.

## Current Decision

Proceed as an implementable plan with an explicit Phase 0 cooperation gate. Do
not treat DNS/Pages setup as an autonomous coding task.
