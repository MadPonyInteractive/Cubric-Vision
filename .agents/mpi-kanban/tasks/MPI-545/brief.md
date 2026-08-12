# MPI-545 - Markdown rendering for notes and release notes

## Reported

The project-notes modal (`project.md`, opened from the project card menu) shows the
file as raw markdown text, and the textarea CLIPS: content taller than the modal is
unreachable, no scrollbar. Fabio asked for a markdown renderer in the app so project
notes, card notes AND release notes all render.

## Root cause of the clipping

`MpiNotesEditor` passes `autoHeight: true` to `MpiInput`. That sets
`.mpi-input__field--auto-height { overflow: hidden }` and an inline
`height = scrollHeight`, while `MpiNotesEditor.css` caps the same textarea at
`max-height: 60vh` with a HIGHER-specificity selector. The cap wins, `overflow: hidden`
stays: everything past 60vh is clipped and unscrollable. Dropping `autoHeight` for
this modal and letting the textarea scroll is the fix - not a taller max-height.

## Decision (Fabio, 2026-08-12)

- Use an EXISTING npm module. Do not hand-roll a parser.
- Notes editor gets an icon radio group: pencil = edit, eye = rendered preview.
  Applies to project notes AND card notes (same component).
- Release notes are read-only: render markdown, no toggle.

## Constraints

- No bundler. The module must be a self-contained browser ESM file, imported from
  `/node_modules/...` - `express.static(__dirname)` serves the repo root and
  `electron-builder.yml` ships `node_modules` under `files: ["**/*"]`.
- Notes content is user/project supplied, so the rendered HTML must be sanitized
  before it reaches `innerHTML`.
