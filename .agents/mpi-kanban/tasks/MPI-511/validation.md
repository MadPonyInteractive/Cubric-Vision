# MPI-511 — validation

Evidence closes this card. The measurement method is fixed: per-process CPU-time
delta over a fixed window, `delta_seconds / elapsed_seconds / logical_cores`.
Task Manager's CPU column is a rate and does not count as evidence.

Script used: `scratchpad/cpu-delta.ps1` (session-local, 20 logical cores).

## Baseline — 2026-08-10, 60s window, BEFORE any fix

```
cores=20 window=60s
TOTAL_CPU_PCT=6.48

Name               Procs   Pct
Code                  19   2.90
msedge                12   1.29
claude                 8   1.01
Taskmgr                1   0.36
audiodg                1   0.31
Wispr Flow             5   0.19
kilo                   2   0.14
ProtonVPN.Client       1   0.07
grep                   8   0.05
bash                   1   0.03
```

**Read this baseline correctly.** The box was **near-idle** when it was taken —
6.48%, close to Fabio's stated ~5% normal. `MsMpEng` (Antimalware Service
Executable) does **not appear at all**, i.e. it burned 0.00s of CPU across the
whole window.

That is not a contradiction of the 11.8% capture — it is the shape of the
problem. **Both suspects are load-driven, not resident.** Defender bills CPU
when files are written or read (a model download, an `npm ci`, a test run), and
VS Code's watchers bill CPU when the watched trees churn. An idle delta
therefore measures the *resident floor* and **cannot demonstrate the 42%
load-time reading**. The honest re-measure is during an agent work burst.

Corroborating evidence for the watcher cost, unplanned: a plain
`du -sh` over `engine/ node_modules/ .playwright-cli/ .playwright/ build/
media-for-testing/ logs/` **exceeded a 5-minute timeout** and was killed. A
single sequential walk of those trees costs minutes; VS Code arms a recursive
watcher over all of them at window open.

## Process census — 2026-08-10, same session

```
Defender ExclusionPath      N/A: Must be an administrator to view exclusions
Defender ExclusionProcess   N/A: Must be an administrator to view exclusions
RealTimeProtectionEnabled = True

node.exe by role:   14 mcp-official, 4 playwright-mcp, 1 npx-wrapper, 3 other
node.exe total:     22
Code procs:         37
Code memory:        4.99 GB
```

Two findings:

1. **Defender exclusions cannot even be *read* without admin.** So FIX 1 is
   Fabio's on both halves — setting it and verifying it.
2. **The MCP orphan count has grown**, not held: the handoff counted 4
   playwright-mcp + 6 mcp-official; it is now 4 + 14. Each is an npx wrapper
   plus the real server, so these are pairs left from earlier sessions. They die
   with the VS Code window that spawned them — a **window reload** reaps them and
   does **not** touch the running app.

## FIX 2 — applied 2026-08-10 (VS Code excludes)

`Cubric-Vision.code-workspace` now carries `files.watcherExclude` and
`search.exclude`. Verified parsed (JSONC, comments stripped):

```
folders:              [{"path":"."}]        <- unchanged, no sibling repos added
watcherExclude keys:  **/engine/**, **/node_modules/**, **/.playwright-cli/**,
                      **/.playwright/**, **/logs/**
searchExclude keys:   **/engine/**, **/node_modules/**, **/.playwright-cli/**,
                      **/.playwright/**
```

`logs/` is in the watcher list only — the running app writes it continuously, so
a watcher there wakes the extension host on every log line. It stays searchable.
`build/` was considered and **rejected**: it is tracked (`build/icon.icns`,
`build/icon.png`), tiny, and excluding it would only hide real files.

**NOT YET EFFECTIVE.** VS Code arms its file watcher at window open, so this
does nothing until the window is reloaded. Status: applied, unproven.

**Local only.** `Cubric-Vision.code-workspace` is gitignored (`.gitignore:63`).
No other clone and no second machine inherits this.

## After FIX 2 — re-measure

_pending — blocked on a window reload (Fabio's; reloading his editor is not the
agent's to do). Re-measure during a work burst, not at idle._

## After FIX 1 — re-measure

_pending — Fabio runs `Add-MpPreference` in an admin shell._
