# MPI-587 — A finished Flow result does not survive reopening the flow

## Current State

**DONE — Fabio verified it in the app 2026-08-21.** Implementation shipped, automated checks pass,
the read half was proven on an isolated instance and his run covered the write half. Nothing
outstanding; the card closes on `validation.md`.

The original report, kept because it is the root-cause record:

The result of a completed Flow run vanishes when the Flow is closed and reopened.
The result itself is safe (committed to the gallery on completion) — only the pane
that showed it comes back blank, so the run reads as lost.

Root cause (traced on the card, confirmed against the code 2026-08-20):

- `_lastResults` — `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js:399` — is
  closure-scoped and deliberately not persisted. It survives a slide rebuild
  (replayed at `:1246` through `_showResults(_lastResults, { remember: false })`)
  but not the instance.
- `js/shell.js:503` destroys the previous `MpiBaseFlow` on every `flow:open`, and
  `:512` destroys it on `close` (MPI-345 — a closed Flow holding live listeners
  queued a phantom job on the next Ctrl+Enter; that destroy is correct and stays).
- Flow INPUTS already survive: `state.s_flowInputs[flowId]` (`js/state.js:69`),
  seeded on mount at `:256`, written at `:257`. **The asymmetry is the bug** — a
  reopened Flow shows its inputs beside an empty frame.

Three more component-scoped vars die the same death and belong to the same
restore: `_preferredResultMode` (`:442`, the compare/player toggle choice),
`_statusText` (`:401`) and `_hasPending` (`:388` — it drives both the
"Saved to your gallery" note and the "Generate again" button label).

## Decisions taken (the card left both open)

1. **Scope — the LAST result only.** One entry per flow, replaced on each run.
   One run's N outputs are ONE result (`_showResults` already takes an array).
   Last-N buys nothing the symptom needs.
2. **Staleness — one HEAD probe at mount, not per-surface error handlers.**
   A persisted `filePath` can outlive the file (item deleted, media cleaned,
   project switched). The replay fans out to three surfaces — plain
   `_paintPlainResults`, `_mountCompare`, `_mountPlayer` — so a per-surface
   `error` handler is three wirings and two of them swallow it. Instead: seed
   synchronously, then `fetch(resolveMediaUrl(path), { method: 'HEAD' })` once.
   `routes/projects.js:1648` already 404s a missing file. On failure, drop
   `_lastResults`, drop the persisted entry, repaint empty. One branch, all
   three surfaces, same fallback discipline `_mountCompare` already has.

## Implementation

- [x] Persist the last Flow result in session state and reseed it on mount, with a
      staleness probe that falls back to the empty pane rather than a dead src.
      **Verify:** run a Flow to completion, close, reopen — the result is back on
      the same surface with the pending note and "Generate again"; then delete the
      result from the gallery and reopen — empty pane, no broken image.

Shape:

- `js/state.js` — add `s_flowResults: {}` beside `s_flowInputs`, session-only,
  same top-level-replace discipline (the state Proxy — `.claude/rules/state.md`).
- `MpiBaseFlow.js`:
  - seed `_lastResults` / `_preferredResultMode` / `_statusText` / `_hasPending`
    from `state.s_flowResults[flow.id]` at their declarations;
  - one `_persistResult()` helper with FOUR callers — `_showResults`'s `remember`
    branch (which is also the error/cancel clear), the surface toggle, the reset at
    the top of `_run`, and `_forgetResult`. `onComplete` sets `_hasPending = true`
    BEFORE `_showResults` so it rides the same call rather than adding a fifth —
    nothing in that path reads the flag;
  - the HEAD probe runs at mount only, self-healing on failure.
- `js/components/types.js` — the MpiBaseFlow state note (~`:1005`).
- `docs/playbooks/add-flow/04-overlay-and-shell.md` — result-pane contract gains
  the persistence line.

## Completed

- **Implementation shipped 2026-08-20** — `s_flowResults` added, seeded, persisted through one
  helper (four callers), HEAD probe wired, `types.js` + `04-overlay-and-shell.md` updated.
  +137/-17 across 4 files.
  - Copy corrected at close-out: the first draft called it "ONE write site" in the jsdoc, the
    playbook and here. The claim auditor counted four. Persisting goes through one HELPER, not
    one call site — the difference matters to anyone adding a fifth.
- **Automated checks pass** — `npm test` 655/655, eslint clean on all three JS files.
- **The READ half is proven live** on an isolated instance (port 50449, user's :3000 untouched):
  a seeded snapshot replays with the image DECODED (`naturalWidth: 2000`), the pending note and
  status line restored; a dead path paints ZERO media, shows the empty state and drops itself
  from state. Full output in `validation.md`.

- **Fabio's in-app run PASSED 2026-08-21** — the only thing that exercises the WRITE half
  (`_persistResult` firing from a real completion, from the surface toggle, and from the `_run`
  reset). Steps and evidence in `validation.md`.

## Remaining Work

None.

## Plan Drift

## Verification

**Verify mode:** user-ux

Automated (regression only — a closure variable is not directly testable):

- `npm test`
- `npx eslint js/state.js js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js js/components/types.js`

In the app (Fabio):

1. Open a Flow, fill it, Generate, wait for "Done — saved to your gallery."
2. Close the Flow. Reopen it. The result is on screen, on the same surface it was
   (compare / player / plain), with the pending note and a "Generate again" button.
3. Toggle compare↔player, close, reopen — it comes back on the surface you chose.
4. Delete that result from the gallery, reopen the Flow — empty pane, no broken
   image icon.
5. Start a new run — the old result drops the moment the run starts.

## Preservation Notes

- The `flow:open` / `close` destroy in `js/shell.js` is MPI-345 and must stay; this
  card carries the result ACROSS it rather than weakening it.
- Session-only by design, mirroring `s_flowInputs`: across-restart restore comes
  from the sidecar (Reuse → `openFlowFromReuse`), not from this key.
