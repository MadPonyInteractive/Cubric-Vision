# Kanban & Agent Coordination Rules

Rules for editing the MPI Kanban board (`.agents/mpi-kanban/`) and agent-to-agent messages.
Board mutation mechanics live in `<mpi-lib>/task-board-ops/` (`_schema.md`, `mutate.md`,
`validate.md`) — read the schema FIRST for any card/board write. This file holds the traps
that schema doc doesn't.

## Card shape rules

When creating or editing cards (`.agents/mpi-kanban/tasks/<id>/task.json`):

1. `status` is NOT free-form — canonical values are `active`/`accepted`; put blocking info in `description` or `brief.md`.
2. `links` must be the full 8-key set for the board's TASK WORKSPACE panel to render.
3. `description` is a SHORT one-line card summary — long-form goes in `brief.md`.
4. The `schema` VALUE is validated, not just JSON syntax — copy it VERBATIM from the templates: `task.json` → `mpi-kanban/task-card/v1` (NOT `mpi-kanban/task/v1` — a hand-authored MPI-256 dropped the `-card` and the whole board view wedged while every file still parsed), `board.json` → `mpi-kanban/board/v1`, every `events.jsonl` line → `mpi-kanban/event/v1` keyed `at` (not `ts`). "Valid JSON" ≠ "valid card"; board-blank-after-a-new-card → suspect a wrong `schema` value FIRST, before reading any reader code.
5. `maturity` enum: `idea`, `planned`, `in-progress`, `validating`, `complete`.
6. LIFECYCLE: every card with real work passes `todo → doing → done`. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in BOTH event logs. The live board is `board.json` with `todo`/`doing`/`done` columns — NOT the legacy `kanban-ops/` Markdown board doc (5-column BACKLOG/PLANNING/… board that does NOT exist).

## The backslash trap — a single stray `\` takes the WHOLE BOARD DOWN

Card/event text is markdown inside a JSON string, so describing a Windows path or a separator heal (`` `\` `` , `` `/`->`\` ``) writes a lone backslash. `\`` is not a valid JSON escape → the board fails to render with *"Bad escaped character in JSON at position N"* and every card disappears, not just the bad one. Write `\\` in the raw JSON (renders as one `\`). Prefer the word "backslash" over the character in card prose. Before finishing any card/event write, validate: `python -c "import json;[json.loads(l) for l in open(P,encoding='utf-8') if l.strip()]"` for `.jsonl`, `json.load` for `.json`. Repair is escape-only — after fixing, assert the raw line differs from the original ONLY by backslashes so no wording drifts. (Bit us 4× across `events.jsonl`, `MPI-67`, `MPI-118`, `MPI-246`.)

## Coordination messages — ASCII only, no emoji

`.agents/mpi-kanban/state/messages/*.json` bodies must be plain ASCII. On Windows, Python's
default stdout/file codec is cp1252, which throws `UnicodeDecodeError`/`UnicodeEncodeError` on
emoji when an agent reads or re-emits a message. An emoji in a message body silently breaks the
`mpi-message` read path. Keep bodies ASCII; put personality in the chat, not the JSON.
