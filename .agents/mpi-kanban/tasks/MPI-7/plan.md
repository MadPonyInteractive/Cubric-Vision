# Cubric Studio Docs subdomain + finish docs site

## Current State

Project mode: scalable-foundation. Source of truth is the JSON MPI board and
this task workspace.

The old backlog card mixed external setup, docs content, local UI polish, and
deployment. It is now split into implementable phases. The task targets the
sibling docs repo:

`C:\AI\Mpi\Cubric Studio (Docs)\`

Current production/local split:

- `https://docs.cubric.studio` is already live.
- The live site currently shows the phony coming-soon/placeholder page.
- The page currently live in production is represented locally as
  `index-soon.html`. It was the `index.html` that got pushed to production.
- The local `index.html` is the real full docs shell that will eventually
  replace the placeholder.
- Work must happen locally through a static server from
  `C:\AI\Mpi\Cubric Studio (Docs)\`.
- Do not push during implementation. Push only after the full docs site is
  complete and the user explicitly approves publishing local `index.html`.

Other observed facts:

- `CNAME` already contains `docs.cubric.studio`.
- The docs repo reports `main...origin/main [ahead 1]` when Git is run with
  `-c safe.directory="C:/AI/Mpi/Cubric Studio (Docs)"`.
- `pages/` contains the eight registered routes: home, getting-started,
  projects, gallery, history, models, workflows, and hotkeys.
- The search input in `index.html` is currently a placeholder.
- All content pages still contain placeholder image or video blocks.
- The old `docs/plans/2026-05-16-port-stage-to-docs.md` plan describes the
  Stage port and is now context, not an active implementation plan.

## Publish Gate

This task is implementable locally. The gate is publication, not DNS setup.

The local implementation may proceed without changing production:

1. Serve the Docs repo locally.
2. Edit and verify local `index.html`, `pages/*.html`, scripts, styles, and
   assets.
3. Keep `index-soon.html` as the snapshot of the current live coming-soon page.
4. Do not push the Docs repo.
5. When complete, ask the user/dev to review the local site.
6. Only after explicit approval, push the completed local `index.html` to
   replace the live placeholder.

Project rules still block pushing the Docs repo until the user explicitly says
the docs site is ready to ship.

## Implementation

- [ ] Phase 0 - Local server and publish guard.
  - Confirm the live site remains the coming-soon placeholder.
  - Start a local static server from `C:\AI\Mpi\Cubric Studio (Docs)\`.
  - Verify local `index.html` loads the full docs shell.
  - Verify local `index-soon.html` remains the production placeholder snapshot.
  - Do not push. Do not change the live site during implementation.

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
  - Prepare final user/dev approval checklist for replacing the live
    coming-soon placeholder with local `index.html`.
  - Only push after the user explicitly says the docs site is ready to ship.

## Completed

- [x] Migrated legacy backlog card into JSON task workspace.
- [x] Reframed task as an implementable plan with an explicit cooperation gate.

## Remaining Work

All implementation phases are pending. Start with Phase 0 to establish the
local server and publish guard, then continue through local docs content before
publication.

## Plan Drift

- 2026-06-01: The original legacy entry said the Stage redesign port was
  shipped and pushed to GitHub. Local inspection shows the Docs repo has
  `index.html` as the full docs shell, `index-soon.html` as the parked
  coming-soon page, and is ahead of origin by one commit. The current project
  rules still block pushing the Docs repo until the user explicitly approves
  publishing the full docs site.
- 2026-06-01: DNS/GitHub Pages setup is not an autonomous agent task. The plan
  now treats it as a cooperation gate with the user/dev.
- 2026-06-01: User corrected current production state: `docs.cubric.studio` is
  already live with the coming-soon placeholder. The local `index-soon.html`
  represents the currently published placeholder, while local `index.html` is
  the future full docs shell. Work must proceed locally and only push
  `index.html` after the docs site is complete and explicitly approved.

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
- Local `index-soon.html` still preserves the current production placeholder
  until publication.

Publication verification with user/dev:

- The user reviews the completed local docs site.
- The user explicitly approves replacing the live coming-soon page with local
  `index.html`.
- After push, `https://docs.cubric.studio` serves the completed docs shell over
  HTTPS.

## Preservation Notes

- Use absolute paths for the sibling Docs repo.
- Use `git -c safe.directory="C:/AI/Mpi/Cubric Studio (Docs)"` for Git commands
  under the sandbox user.
- Never run `git push` in the Docs repo unless the user explicitly lifts the
  docs push block for this task.
- Related memory:
  `C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_docs_stage_port.md`.
  It still records the original Stage port and now has a stale subdomain-pending
  detail; update it only after confirming the memory change with the user.
- If content work changes app behavior claims, update docs content from app
  source, not from memory or marketing copy.
