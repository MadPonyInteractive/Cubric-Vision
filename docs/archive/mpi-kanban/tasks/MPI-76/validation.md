# MPI-76 Validation — Project and Card notes

**Status:** Validated by user 2026-06-14.

## Scope delivered

- **Project notes** — right-click project on Stage picker → "Project notes" opens
  in-app overlay editor backed by `project.md`. New routes `POST /project-notes`
  + `POST /project-notes/save` in `routes/projects.js`.
- **Open project folder** — right-click → "Open project folder" reveals project
  in OS file browser via existing `POST /open-folder`.
- **Card notes** — right-click gallery card → "Card notes" (single-card) opens
  same overlay; persists `notes` into card sidecar (`Media/.meta/<id>.json`) via
  existing `POST /project-media/:id/update-meta`; mirrors `item.notes` in memory;
  emits `gallery:item-updated`.
- **New component** `MpiNotesEditor` (Compound) — MpiModal + textarea + Save/Cancel,
  async `onSave` (button disabled while saving, stays open on error).

## Checks

- ESLint on touched files: 0 errors (1 pre-existing unrelated warning in projectUI.js:351).
- `routes/projects.js` smoke-loads clean.
- User performed live validation and approved final completion.

## Commit note

Implementation files were swept into MPI-64 commits during a concurrent
lint-staged stash race (`dea0a4c`, `92be6da`, `e8b6a7b`) — verified all MPI-76
files present in HEAD, no data lost. Remaining kanban close-out (board move,
task.json done, this file, coordination messages) committed separately.
