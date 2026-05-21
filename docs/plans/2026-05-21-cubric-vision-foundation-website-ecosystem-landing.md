# Cubric Vision Foundation - Website Ecosystem Landing

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - website-ecosystem-landing`
**Priority:** low until app-first release work is further along
**Status:** deferred planning track

## Purpose

Define how the public website evolves from a single-app Cubric Studio landing
page into the Cubric ecosystem landing, while moving Cubric Vision-specific
content to a Vision product page or subdomain.

This is intentionally last behind app work. It should not interrupt Cubric
Vision app implementation, portable distribution, or prompt-box work.

## Scope

In scope:
- Decide ownership of `cubric.studio` as the ecosystem landing.
- Decide where Vision-specific content lives.
- Reconcile the existing Stage website redesign plan with the final naming
  split.
- Define subdomain and route map.
- Define what waits for public downloadable app artifacts.

Out of scope:
- Immediate website implementation.
- Patreon landing image refresh.
- New screenshots/videos unless release work already produced them.
- Pushing Website repo changes before the existing push gate is cleared.

## Inputs

- `docs/plans/2026-05-16-port-stage-to-website.md`
- `docs/plans/2026-05-19-cubric-vision-foundation.md`
- Kanban backlog entry `Vision subdomain content (vision.cubric.studio)`
- `C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_website_push_gate.md`

## Planning Work

### Phase 1: Defer Gate

- [ ] State the app-first gate clearly: do not implement or push ecosystem
  website work until Cubric Vision app release work is ready enough to show.

### Phase 2: Ownership And Map

- [ ] Decide whether `vision.cubric.studio` is a separate site, a product page,
  or both over time.
- [ ] Confirm subdomains:
  `cubric.studio`, `vision.cubric.studio`, `prompt.cubric.studio`,
  `audio.cubric.studio`, `video.cubric.studio`, `docs.cubric.studio`.

### Phase 3: Existing Plan Reconciliation

- [ ] Mark which parts of `2026-05-16-port-stage-to-website.md` remain valid.
- [ ] Mark which parts are superseded by the ecosystem split.
- [ ] Decide whether to revise that plan or keep this as the superseding plan.

### Phase 4: Release Dependencies

- [ ] List website content blocked by app artifacts:
  downloadable build, screenshots, videos, docs URL, Patreon copy, GitHub
  release URL.

## Implementation Phase

This plan's implementation phase should happen after app-first work. It should
target the sibling Website repo with absolute paths and separate git handling.

## Acceptance

- Website work is clearly deferred without being forgotten.
- The app-first release path is not blocked by public-site restructuring.
- Future website implementation has a clean route/subdomain strategy.
