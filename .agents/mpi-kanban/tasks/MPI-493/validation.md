# MPI-493 Validation

All checks run 2026-08-08, before the commits landed.

## Diagnosis — evidence, not inference

- `state/files/` live claim records: **0**.
- `active_file_claims` in `state/index.json`: `[]` in **every one of the last 30 commits**
  (2026-08-03 → 2026-08-08); sampled again across 2026-06-01 → 2026-08-01 — last non-empty
  was `9765b6e1`, 2026-06-14 (2 claims). Last archived claim `heartbeat_at`: 2026-06-15.
- `active_sessions`: 3-5 through 2026-06-06 → 2026-06-16, then `0` permanently.
- Control that rules out "agents ignore the board": `task.moved` events = 50, most recent
  2026-08-05. Card moves are in `CLAUDE.md`; claims were not. Same agents, same board.
- Skill pack `updatedAt` = 2026-07-31, six weeks AFTER claiming stopped — rules out the
  update as the cause.
- Independent corroboration: messages `b7f1c0de` / `c4a91f7e` / `e2d5b81a` (2026-08-06)
  show MPI-451 and MPI-452 negotiating `models.js` / `licences.js` ownership by hand while
  `active_file_claims` was empty.

## Fix 1 — brief-rule config (`.agents/mpi-kanban.local.md`)

Simulated `loadConfig()` / `resolveRulePath()` / `resolveBundle()` / `loadCriticalSnapshot()`
per `<mpi-lib>/config-ops.md`:

- **18/18** configured rules resolve to an existing file AND contain `## Sub-Agent Briefing`.
- **3/3** bundles resolve (`frontend-worker`, `comfy-worker`, `component-maps`).
- Snapshot anchor `critical-rules-snapshot-...` matches a real `CLAUDE.md` heading; the
  extracted body contains both new bullets.
- `kanban` briefing extracts non-empty: 31 lines, git ban present.

## Fix 2 — destructive-git guard hook

`python .claude/hooks/guard-destructive-git.py --selftest` → `selftest OK - 16 blocked, 14 allowed`.

- Blocked: `checkout -- <path>`, `checkout .`, `checkout HEAD -- <path>`, `restore`,
  `restore --worktree`, `stash`, `stash push`, `stash`+`pop`, `reset --hard`, `clean -fd`,
  `clean -xdf`, plus `git -C <dir>` and `sudo` prefixed forms, and one after `cd x &&`.
- Allowed: `status`, `checkout -b`, `checkout <branch>`, `commit`, `show HEAD:<path>`,
  `stash create`, `stash list`, `restore --staged`, `diff --stat`, `reset <path>`,
  `clean -n`, `grep "git checkout --"`, `echo "…git stash…"`, `add`.

Stdin path exercised in-process (the literal command string is refused by the Bash
classifier, so it was constructed by concatenation): exit 2 + `BLOCKED` message containing
`git show HEAD:` for a Bash payload; exit 0 for a non-Bash tool, an allowed command, and a
payload missing `tool_input`.

`.claude/settings.json` re-parses as valid JSON; `PreToolUse[0].matcher == "Bash"`; the
pre-existing `Stop` hook and all 5 `additionalDirectories` intact; CRLF preserved.

**Not verified: the hook firing live.** Hooks load at session start, so this activates on
the next Claude Code session. Selftest + simulated stdin is the whole of the evidence.
First live run should show `BLOCKED: …` on such a call; silence means it did not load.

## Board

`python <mpi-lib>/scripts/validate_board.py .` → `Board validation passed.` after the
MPI-492 write.

## Co-owned commit safety

`b6033f94` staged `.agents/mpi-kanban/events.jsonl` as `HEAD` + one appended line, via the
`git.md` § MPI-245 blob recipe, while a peer (`actor: opus`, MPI-491) held an uncommitted
line in the same file. Verified after commit: the committed blob ends `MPI-467` then
`MPI-492`; the peer's `08:05:00Z` line never entered the commit and remained `M` in the
tree. Their MPI-491 card files were untouched throughout.
