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
6.48%, close to Fabio's stated ~5% normal.

> **CORRECTION, same day.** This baseline first read as "`MsMpEng` does not
> appear at all, i.e. it burned 0.00s". **That was wrong, and the method is
> why.** `Get-Process .CPU` returns **0 for every protected process** in a
> non-elevated shell — `MsMpEng`, `System`, `dwm`, `Registry` all read 0, and a
> lifetime probe over 55h of uptime confirmed it (`MsMpEng cpuSec=0` against
> 94 svchosts summing 157s). So the CPU-time-delta script **silently omits
> Defender and the kernel** — precisely the bucket this spike is expected to
> live in. The 6.48% figure is a floor over *readable* processes, not a total.

**The method that does work, with no admin: perf counters.**
`Get-Counter '\Process(*)\% Processor Time'` exposes `msmpeng`, `system`, `dwm`
and `memory compression`. Verified: `MsMpEng` sampled at 0.06–0.12% — genuinely
idle, this time on evidence that can distinguish idle from invisible.

With that method the load-driven conclusion still stands, now honestly:
**neither suspect is resident.** Defender bills CPU when files are written or
read; VS Code's watchers bill when the watched trees churn. An idle sample
measures the *resident floor* and **cannot demonstrate the 42% reading**.

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

**Local only.** `Cubric-Vision.code-workspace` is gitignored (`.gitignore:67`,
the `*.code-workspace` glob — **not** `:63`, which is `project-paths.json`).
No other clone and no second machine inherits this.

## Fabio's fact, 2026-08-10 — it re-ranks both fixes

> "When it previously happened, closing all the applications, **including VS
> Code**, did not release the CPU usage."

A reboot did. That combination is decisive and it **demotes FIX 2**: whatever
holds the box at 42% survives every app exiting, so it is not VS Code's
watchers, not the extension hosts, not the app, not the engine. It lives in a
**service or the kernel** — the bucket `Get-Process` cannot even read.

Consistent supporting evidence, all captured at idle on 55.9h uptime:

| Probe | Reading |
|---|---|
| Lifetime CPU, all readable processes | msedge 25578s / 0.97% avg, Code 18722s / 1.09%, Taskmgr 10213s / 0.25%, python (engine) 2763s / 1.47% |
| Box totals now | 4.53% total — privileged 2.4, user 2.16, DPC 0.15, interrupt 0.08 |
| Defender scan state | `ScanInProgress` empty, QuickScanAge 1d (ran 08/08 08:30, 96s), **FullScanAge 510 days** |

**No readable process is a 42% resident hog**, and Defender is not sitting in a
stuck full scan. So the culprit is transient and currently absent. It cannot be
diagnosed from an idle box — it has to be caught in the act.

## The deliverable: `capture-cpu.ps1`

Lives in this card's folder. No admin needed — it reads perf counters, so it
sees `MsMpEng`, `System` and `dwm`, which is the whole point. Run it **while the
box is high**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .agents/mpi-kanban/tasks/MPI-511/capture-cpu.ps1
```

It splits privileged vs user vs DPC vs interrupt, which is what actually names
the layer: `privileged >> user` means service or driver; DPC/interrupt above ~5%
means a **driver**, and no process will own it — that is the classic signature
of "closing apps changes nothing, a reboot fixes it".

Smoke-run twice on an idle box (2.84% and 2.61% totals). One fix during the
smoke: `Get-Counter` over `\Process(*)` throws a terminating-looking error
whenever any process **exits mid-sample** while still returning good data, so
`-ErrorAction SilentlyContinue` is load-bearing — without it the script reads as
broken when it is not.

## After FIX 2 — re-measure

_pending — blocked on a window reload (Fabio's; he has five sessions open).
Demoted by Fabio's fact above: closing VS Code entirely did not release the CPU,
so the watcher excludes are worth keeping but are no longer the lead theory._

## After FIX 1 — re-measure

_pending — Fabio runs `Add-MpPreference` in an admin shell. Still worth doing on
its own merits (real-time scanning over a weight-download tree), but the 11.8%
Antimalware line is now the strongest surviving lead precisely BECAUSE Defender
is a service that survives closing every app._
