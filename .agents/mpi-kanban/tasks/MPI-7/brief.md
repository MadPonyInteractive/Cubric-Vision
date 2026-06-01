# Cubric Studio Docs subdomain + finish docs site

## Summary

Finish the sibling docs site locally, then publish the completed full docs shell
to `docs.cubric.studio` only after explicit approval.

The Stage redesign port is already present in the docs repo. Current local
state:

- Target repo: `C:\AI\Mpi\Cubric Studio (Docs)\`
- `https://docs.cubric.studio` is already online and currently serves the
  coming-soon placeholder.
- The coming-soon page that is live in production is represented locally by
  `index-soon.html`. It was previously pushed as the public `index.html`.
- The real full docs shell to work on is local `index.html`.
- Local work must run through a local static server from the Docs repo. Do not
  test or iterate by changing the live site.
- Only after the docs site is complete should local `index.html` be pushed to
  replace the live placeholder page.
- Docs repo `CNAME` already contains `docs.cubric.studio`.
- Docs repo branch is `main...origin/main [ahead 1]` when checked with
  `git -c safe.directory="C:/AI/Mpi/Cubric Studio (Docs)"`.
- Project rule hard block: do not push the Docs repo until the user explicitly
  says the docs site is ready to ship.

## Publish Model

This is no longer primarily a DNS cooperation session. The subdomain is live.

The agent-owned work is local: expand docs content, wire local search, prepare
assets, run local smoke checks, and keep `index.html` as the future full docs
entry point.

The user/dev-owned gate is final publication: review the finished local site,
then explicitly approve pushing local `index.html` to replace the live
coming-soon placeholder.

## Current Decision

Proceed as a local implementation plan with a hard publish gate. The live site
continues to show the coming-soon page until local `index.html` is complete and
approved for push.

## Memory Reference

Relevant memory exists at
`C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_docs_stage_port.md`.
That entry is now stale where it says the docs subdomain was not wired yet; the
current card state supersedes that part.
