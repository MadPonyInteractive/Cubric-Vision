# MPI-119 Validation

## What was verified
- **Hook self-test** (`python .claude/hooks/bump-rebuild-reminder.py --selftest`) → `selftest OK`.
  5 cases: version-edit suppresses warning; bump-only trigger warns (bump line, no rebuild); `node_lock.json` warns both bump+rebuild; unrelated file silent; `comfy_workflows/` substring match.
- **Live Stop smoke** — fed `{"hook_event_name":"Stop"}` on stdin against the real working-tree diff → exit 0, silent (current diff has no trigger paths). Confirms never-blocks + correct silence.
- **settings.json** — `json.load` passes after wiring `hooks.Stop`.
- **build-pod-image edits** — re-read in place; v-prefix guard, 5a pull-verify, 5b smoke, done-def all present.

## Still open (why card is `validating`, not `done`)
1. **User sign-off on approach** — brief mandated "report gaps to user, then apply"; user chose full scope. Needs final OK that the applied shape matches intent.
2. **Organic live-fire of the hook** — not yet observed firing its WARNING at a real session end where a trigger path (e.g. `models.js`) was edited without a bump. Self-test proves the logic; a real session-end fire proves the wiring end-to-end. Will confirm next time a qualifying session ends.

## Done criteria
Card → `done` (maturity `complete`) when (1) user approves and (2) the hook has
fired its summary at least once on a real trigger-path session (or user waives 2).

## Resolution (2026-06-20)
User approved the applied shape and full scope. Open item #2 (organic live-fire)
waived — self-test + live Stop smoke deemed sufficient; real session-end fire will
be observed naturally. Card accepted → `done`/`complete`.
