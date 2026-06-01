# Cubric Studio Docs subdomain + finish docs site

## Current State

Project mode: scalable-foundation. Source of truth is the JSON MPI board and
this task workspace.

The old backlog card mixed external setup, docs content, local UI polish, and
deployment. It is now split into implementable phases. The task targets the
sibling docs repo:

`C:\AI\Mpi\Cubric Studio (Docs)\`

Important observed facts:

- `CNAME` already contains `docs.cubric.studio`.
- The docs repo reports `main...origin/main [ahead 1]` when Git is run with
  `-c safe.directory="C:/AI/Mpi/Cubric Studio (Docs)"`.
- The current full docs shell is `index.html`; `index-soon.html` is the parked
  coming-soon page.
- `pages/` contains the eight registered routes: home, getting-started,
  projects, gallery, history, models, workflows, and hotkeys.
- The search input in `index.html` is currently a placeholder.
- All content pages still contain placeholder image or video blocks.
- The old `docs/plans/2026-05-16-port-stage-to-docs.md` plan describes the
  Stage port and is now context, not an active implementation plan.

## Cooperation Gate

This task is implementable, but not fully autonomous.

The user/dev must be present for Phase 0 because it requires actions in
external systems:

1. Confirm the chosen domain is `docs.cubric.studio`.
2. In Namecheap, create or verify the DNS record for `docs.cubric.studio`
   pointing at GitHub Pages.
3. In GitHub Pages settings for the Docs repo, verify source is `main` / root
   and custom domain is `docs.cubric.studio`.
4. Wait for DNS propagation and enable/enforce HTTPS when available.
5. Explicitly approve publishing the full docs shell. Project rules currently
   block pushing the Docs repo until this approval is given.

Agent-owned work can proceed locally before or after Phase 0, but final publish
requires the user/dev approval above.

## Implementation

- [ ] Phase 0 - Cooperation and publish gate.
  - Confirm `docs.cubric.studio` remains the target domain.
  - Prepare exact DNS/GitHub Pages instructions for the user/dev.
  - Do not push. Do not change the production gate without explicit approval.
  - After the user/dev updates DNS/Pages, verify the domain with DNS lookup and
    HTTPS checks.

- [ ] Phase 1 - Docs site audit and route smoke.
  - Run a local static server from `C:\AI\Mpi\Cubric Studio (Docs)\`.
  - Smoke all eight hash routes and mobile menu behavior.
  - Check browser console for router, fetch, and asset errors.
  - Record current gaps before content changes.

- [ ] Phase 2 - Replace thin content with source-grounded docs.
  - Use the project-local `cubric-user-docs` skill.
  - Expand `pages/getting-started.html`, `pages/projects.html`,
    `pages/gallery.html`, `pages/history.html`, `pages/models.html`,
    `pages/workflows.html`, and `pages/hotkeys.html` as user-facing HTML
    fragments.
  - Ground claims in the app source listed by
    `.agents/skills/cubric-user-docs/references/cubric-sources.md`.
  - Keep the docs practical and creator-facing. Mark future/planned behavior as
    planned, not current.
  - Update each page TOC when headings change.

- [ ] Phase 3 - Visual assets and placeholders.
  - Inventory every `image-placeholder` and `embedded-placeholder`.
  - Produce a screenshot/GIF shot list for approval before capture.
  - Replace approved placeholders with real assets under
    `assets/docs/<page>/`.
  - Keep unresolved placeholders clearly marked as planned assets, not final
    content.

- [ ] Phase 4 - Search.
  - Decide between static local search and a deferred search shell.
  - Recommended first implementation: static Lunr-style JSON index generated
    from the existing `pages/*.html` fragments, with no external hosted search
    dependency.
  - Wire the header input to query page titles, headings, and body snippets.
  - Preserve hash routing and keyboard usability.

- [ ] Phase 5 - Polish and accessibility pass.
  - Fix small UI polish items found during smoke.
  - Ensure all images have useful alt text or empty alt when decorative.
  - Verify mobile nav, focus order, skip-free keyboard navigation, and reduced
    motion behavior.
  - Keep Stage docs visual system intact. Avoid broad redesign work.

- [ ] Phase 6 - Publish readiness packet.
  - Summarize changed files, unresolved content gaps, and any source
    uncertainties.
  - Run local route/search/a11y smoke.
  - Prepare final user/dev approval checklist for push and public DNS/HTTPS
    verification.
  - Only push after the user explicitly says the docs site is ready to ship.

## Completed

- [x] Migrated legacy backlog card into JSON task workspace.
- [x] Reframed task as an implementable plan with an explicit cooperation gate.

## Remaining Work

All implementation phases are pending. Start with Phase 0 if the goal is to
make the public subdomain live. Start with Phase 1 if the goal is to finish the
local docs content before publication.

## Plan Drift

- 2026-06-01: The original legacy entry said the Stage redesign port was
  shipped and pushed to GitHub. Local inspection shows the Docs repo has
  `index.html` as the full docs shell, `index-soon.html` as the parked
  coming-soon page, and is ahead of origin by one commit. The current project
  rules still block pushing the Docs repo until the user explicitly approves
  publishing the full docs site.
- 2026-06-01: DNS/GitHub Pages setup is not an autonomous agent task. The plan
  now treats it as a cooperation gate with the user/dev.

## Verification

Local verification before publish approval:

- All eight routes load from a local static server without console errors:
  `#/home`, `#/getting-started`, `#/projects`, `#/gallery`, `#/history`,
  `#/models`, `#/workflows`, `#/hotkeys`.
- Header search either works locally or is explicitly marked as deferred.
- No unresolved screenshot/video placeholders remain unless recorded in the
  publish readiness packet.
- Mobile menu opens/closes via hamburger, overlay click, link click, and Esc.
- TOC links and active route highlighting work after content edits.
- `CNAME` still contains `docs.cubric.studio`.

External verification with user/dev:

- DNS for `docs.cubric.studio` resolves to GitHub Pages as configured.
- GitHub Pages custom domain shows no blocking errors.
- HTTPS is available and enforced.
- The user explicitly approves any push/publish step for the Docs repo.

## Preservation Notes

- Use absolute paths for the sibling Docs repo.
- Use `git -c safe.directory="C:/AI/Mpi/Cubric Studio (Docs)"` for Git commands
  under the sandbox user.
- Never run `git push` in the Docs repo unless the user explicitly lifts the
  docs push block for this task.
- If content work changes app behavior claims, update docs content from app
  source, not from memory or marketing copy.
