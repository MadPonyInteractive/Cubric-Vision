# MPI-654 Brief

Found while brainstorming MPI-656 (multiple model roots). **Pre-existing and
reproducible today** — no extra roots needed. Not caused by that feature; it is
a prerequisite for it.

## The defect

Two functions answer "where does this dep live?" and they disagree.

- `_localModelsCheck` ([routes/comfy.js:829](routes/comfy.js:829)) tries the
  direct path, then a recursive `_findFile` inside the custom root, then
  **falls back to the default root** — because the YAML keeps the default
  folder searchable, so deps installed there before a path change must still
  count as present.
- The install route's dep-exists check
  ([routes/downloadManager.js:1603](routes/downloadManager.js:1603)) resolves
  **one** path.

Consequence: with a custom root set and a weight sitting in the default root,
the library reads **Installed** while the installer **re-downloads it**.

## Reproduce first — do not fix from this description

This is a code trace, not an observed failure. Step one is a reproduction: set a
custom root, place a dep under the default root only, confirm the library badge
and the installer disagree. Fix only what the repro proves.

## Notes for whoever picks it up

- Related but **separate** from MPI-655 (partly-installed model strands its
  weights). Different layer, different files — safe to run in parallel.
- `resolveComfyPath` ([routes/shared.js:461](routes/shared.js:461)) already
  conflates "find the existing copy" with "where should a new file go": it
  searches, then returns the write target when nothing is found. That conflation
  is the likely root cause, and it is the same seam MPI-656 has to split anyway.
- **Do not** extend `findFileRecursive` basename matching to widen the search —
  it would adopt a same-named different quant. Dep filenames are already
  `<bucket>/<name>`; match the exact relative path.
- Touches the download/install path: read `.claude/rules/downloads.md` and
  `.claude/rules/root-cause.md` before editing.

## Ownership (when this moves to doing)

`routes/comfy.js`, `routes/downloadManager.js`, `routes/shared.js`
