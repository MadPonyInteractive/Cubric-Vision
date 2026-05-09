# Codex Project Instructions

This project keeps its canonical agent instructions in `CLAUDE.md`.

Before making code changes in this repository:

1. Read `CLAUDE.md`.
2. Follow its routing rules.
3. Read `.claude/rules/dos_and_donts.md`.
4. Read only the additional `.claude/rules/*.md` files that match the current task area.
5. Check `docs/PROJECT.md` before broad codebase searches.

Treat `.claude/rules/` as the project architecture source of truth. Do not modify those rule files unless the user explicitly asks for documentation updates.

Project-specific Claude memory is available at:

- `C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\MEMORY.md`

Use that memory index selectively. Load topic files from the same memory directory only when they are relevant to the current task.

For memory behavior, follow the user's global Claude memory rules in:

- `C:\Users\Fabio\.claude\CLAUDE.md`

When the user asks Codex to remember something, update the existing Claude Markdown memory system rather than creating Codex-only memory files. Before removing or modifying an existing memory entry, confirm the current content and proposed change with the user.

For MPI workflow planning, handoff, session-end, or kanban-related requests, use the Codex bridge for the user's Claude plugin:

- `C:\Users\Fabio\.claude\plugins\cache\mpi-local\mpi-kanban\0.2.0\AGENTS.md`
