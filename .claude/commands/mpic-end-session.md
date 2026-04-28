---
description: End session — update rules/docs, commit touched files, mark session complete
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Read, Edit, Write, Glob, Grep
---

<objective>
Wrap up current session cleanly: sync docs/rules with code changes, commit touched files, mark session complete in Nimbalyst board, and persist any new memory.

Ensures `.claude/rules/`, `docs/`, and project memory stay in sync with shipped code, and the session is closed without dangling uncommitted work.
</objective>

<context>
- Status: ! `git status`
- Diff: ! `git diff HEAD`
- Recent commits: ! `git log --oneline -10`
- Edited files this session: use `mcp__nimbalyst-mcp__get_session_edited_files`
</context>

<process>
1. List files changed this session (git status + Nimbalyst session edited files).
2. Identify rule/doc impact:
   - New workspace, component, event, state key, ComfyUI injection, or download flow changed? → update relevant `.claude/rules/*.md` file.
   - Architectural shift? → update `docs/PROJECT.md` pointer if needed.
   - Per CLAUDE.md cardinal rule: ask user before modifying any architectural rule file.
3. Edits MUST be concise. Short bullets, no prose bloat. No new headings unless required.
4. Memory pass (per `~/.claude/CLAUDE.md` rules):
   - Anything learned worth keeping? Write to right file in `~/.claude/projects/C--AI-Mpi-CubricStudio/memory/` or `~/.claude/memory/`.
   - Update `MEMORY.md` index entry (one line, dated).
   - Use `AskUserQuestion` before removing/modifying existing memory entries.
5. Stage and commit touched files with descriptive message (follow repo conventional style — see recent commits). Do NOT use `git add -A`. Stage by name.
6. Mark session complete:
   - `mcp__nimbalyst-session-naming__update_session_meta` → `{ "phase": "complete", "add": ["committed"], "remove": ["uncommitted"] }`
7. Report: files committed, docs/rules updated, memory entries written.
</process>

<success_criteria>
- All session-touched files either committed or explicitly noted as deferred.
- Rules/docs reflect any architectural changes (with user approval where required).
- Memory entries written/updated for non-obvious learnings; `MEMORY.md` index current.
- Session phase set to `complete`, tagged `committed`.
- `git status` clean (or remaining items explained).
</success_criteria>

<verification>
- Run `git status` after commit — confirm working tree clean.
- Run `git log --oneline -1` — confirm new commit present.
- Confirm session metadata updated (tool returns full meta).
</verification>
