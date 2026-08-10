# MPI-511 — checklist

- [x] Baseline CPU-time delta captured — 6.48% total, 20 cores, 60s window
- [x] FIX 2 applied: `files.watcherExclude` + `search.exclude` in `Cubric-Vision.code-workspace`
- [x] Workspace file still has exactly one folder (`.`) — no sibling repos re-added
- [ ] **Fabio: reload the VS Code window** — watchers arm at window open, so FIX 2 is
      inert until then. Also reaps the 18 stale MCP server processes.
- [ ] Re-measure after the reload (same method) — **during a work burst, not at idle**
- [x] FIX 1 command handed to Fabio with the security trade stated (admin shell, his to run)
- [ ] **Fabio: run `Add-MpPreference`** in an admin shell, scope of his choosing
- [ ] Re-measure after FIX 1 once Fabio has run it
- [ ] Memory: Defender exclusion (if it holds) → `~/.claude/memory/general.md`, not repo docs
