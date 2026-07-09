# Cubric Vision Foundation - Website Ecosystem Landing

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - website-ecosystem-landing`
**Priority:** active prep, with install/distribution docs gated on portable release
**Status:** planning and placeholder implementation track

## Purpose

Define how the public website evolves from a single-app Cubric Studio landing
page into the Cubric ecosystem landing, while moving Cubric Vision-specific
content to a Vision product page or subdomain.

This work can now begin in parallel with final app release prep. Installation
and distribution-specific documentation remains gated on the cross-platform
portable distribution work, but social, Patreon, website structure, and docs IA
prep can proceed before that final stage.

## Scope

In scope:
- Decide ownership of `cubric.studio` as the ecosystem landing.
- Decide where Vision-specific content lives.
- Reconcile the existing Stage website redesign plan with the final naming
  split.
- Define subdomain and route map.
- Define what waits for public downloadable app artifacts.

Out of scope:
- Final release/download copy that depends on built portable artifacts.
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

- [x] State the app-first gate clearly: website/docs/social/Patreon prep may
  begin now because app release is close; do not publish or finalize
  installation/distribution promises until cross-platform portable
  distribution is done and verified.

### Phase 2: Ownership And Map

- [x] Decide whether `vision.cubric.studio` is a separate site, a product page,
  or both over time. **Decision 2026-05-23:** app subdomains are single product
  pages/folders inside the existing display Website repo, not separate GitHub
  Pages repos. Initial folders: `/vision/`, `/prompt/`, `/audio/`, `/video/`.
- [x] Confirm subdomains:
  `cubric.studio`, `vision.cubric.studio`, `prompt.cubric.studio`,
  `audio.cubric.studio`, `video.cubric.studio`, `docs.cubric.studio`.

Routing note: DNS alone cannot map `vision.cubric.studio` to the `/vision/`
path. If GitHub Pages remains the host, use Namecheap URL Redirect records for
the app subdomains to `https://cubric.studio/<app>/`, or introduce an edge/proxy
layer later if the subdomain must remain in the address bar.

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
