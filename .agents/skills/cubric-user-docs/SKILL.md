---
name: cubric-user-docs
description: Use when creating or updating Cubric Studio user-facing documentation, docs-site page fragments, screenshots, GIF/video capture plans, tutorials, how-to guides, reference pages, or docs accuracy audits for the sibling Cubric Studio Docs site.
---

# Cubric User Docs

Create user-facing Cubric Studio documentation that is accurate, visual, and ready for the static docs site.

This skill is project-local to `C:\AI\Mpi\CubricStudio` and writes documentation assets to the sibling docs repo at `C:\AI\Mpi\Cubric Studio (Docs)`.

## Required Workflow

Start in brief-first mode unless the user explicitly says they only want an audit or plan.

1. Ask the minimum clarifying questions needed:
   - Which docs page or section is being worked on?
   - What document type fits best: tutorial, how-to, reference, or explanation?
   - Are screenshots, a GIF/video, or text-only output needed?
2. Read the relevant source-of-truth files before proposing content.
3. Present a short implementation brief:
   - target page and route
   - document type and target reader
   - source files checked
   - proposed outline
   - proposed screenshot/GIF shot list
   - files/assets expected to change
4. Wait for user approval before editing the docs site or capturing final assets.
5. After approval, write docs as HTML fragments matching the docs site structure, not Markdown, unless the user asks for a Markdown draft.
6. Verify the final content against source files and report any uncertainty or missing visual assets.

Do not invent app behavior. If source files disagree with existing docs, call out the drift and use the app source as the authority unless the user says the docs should describe intended future behavior.

## Source Grounding

Always load `references/cubric-sources.md` for source selection. Use it to decide which app files to read for the requested page or feature.

Minimum sources for most docs tasks:

- `docs/PROJECT.md`
- `docs/workspaces.md`
- `docs/data.md`
- `js/data/commandRegistry.js`
- `js/data/modelConstants/models.js`
- `js/managers/hotkeyRegistry.js`
- `js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js`
- `C:\AI\Mpi\Cubric Studio (Docs)\pages\*.html`

For visual capture or GIF planning, also load `references/capture-workflow.md`.

For writing page fragments or linking assets, also load `references/docs-site.md`.

## Writing Standards

Write for creators using the app, not developers reading internals.

- Use direct, task-focused language.
- Prefer concrete UI labels and actions over architectural terms.
- Keep paragraphs short.
- Use numbered steps for sequential tasks.
- Include prerequisites only when they affect the user action.
- Avoid marketing claims inside task docs.
- Mention ComfyUI only when it affects user expectations, such as local model downloads or generation time.
- Separate source-verified behavior from assumptions.

Use Diataxis as the document-shape guide:

- Tutorial: teach a complete workflow from start to finish.
- How-to: solve one concrete problem.
- Reference: list factual controls, shortcuts, models, operations, or settings.
- Explanation: clarify a concept such as projects, local/private generation, Cue/Loop, or model installs.

## Asset Rules

Default asset root:

`C:\AI\Mpi\Cubric Studio (Docs)\assets\docs\`

Use per-page subfolders:

- `assets/docs/getting-started/`
- `assets/docs/projects/`
- `assets/docs/gallery/`
- `assets/docs/history/`
- `assets/docs/models/`
- `assets/docs/workflows/`
- `assets/docs/hotkeys/`

Use lowercase, descriptive filenames:

- `gallery-selection-mode.png`
- `history-mask-tool.gif`
- `models-install-modal.png`

Before adding a screenshot or GIF, confirm the shot list with the user. When practical, capture stable states with Playwright or Electron automation rather than manual screenshots.

## Output Shape

For a normal docs implementation, produce:

1. A concise plan for approval.
2. The edited `pages/<route>.html` fragment after approval.
3. Any added assets under `assets/docs/<page>/`.
4. A final note listing source files checked and any remaining gaps.

Do not edit `.claude/rules/` for user documentation work. Do not commit or push unless the user explicitly asks.
