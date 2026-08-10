# MPI-511 — Dev-box CPU floor

## Why this card exists

Fabio's dev box sits at **~42% CPU while agents work**, against a normal idle of
**~5%**. It has forced a reboot before, so it is not a one-off. Everything here is
**environment**, not app code — no file under `js/`, `routes/` or `comfy_workflows/`
is touched.

Carried over from handoff `76629e7f-c711-4056-9ec5-64180acae2f8`, which diagnosed
but deliberately did not apply (Fabio asked for a separate session).

## Measurements that opened the card

`2026-08-10`, a Task Manager capture from Fabio plus a scripted delta:

| Line | Reading |
|---|---|
| Task Manager total | 42% (normal idle ~5%) |
| Visual Studio Code | 16.1%, 102 processes, 6.9 GB (37 procs / 4.36 GB when scripted minutes later) |
| Antimalware Service Executable | **11.8%** — biggest single non-VS-Code line |
| Bun | 5.8% — **not ours**, absent at measurement time |
| ComfyUI engine (python) | 2.3% resident — normal |
| Electron app | 1.1% renderer + 0.8% gpu-process |
| Idle between steps, nothing of the session running | 3–4% total |

Already ruled out: this session's own processes are **not** the resident cause.
The spikes are real but bounded to test / lint / playwright runs.

## The measurement method is part of the card

**Task Manager's CPU column is a rate** and misleads on a 20-core box. The honest
number is a **per-process CPU-time delta over a fixed window**:

- `Get-Process` → `.CPU` is *cumulative seconds*, not a rate.
- Snapshot, sleep N seconds, snapshot again.
- `percent = (delta_seconds / elapsed_seconds / logical_cores) * 100`.

Script: `scratchpad/cpu-delta.ps1` (session-local). Re-measure with the **same**
method after each fix. Never declare it fixed from a single glance.

## FIX 1 — Windows Defender exclusions (Fabio's, needs admin)

```powershell
Add-MpPreference -ExclusionPath "C:\AI\Mpi\Cubric-Vision","G:\CubricModels"
# verify
(Get-MpPreference).ExclusionPath
```

`engine/` lives inside the repo path, so it is covered by the first entry.

**This is a real security trade, not a free win.** It turns off real-time
scanning for a tree that downloads model weights from R2 and Hugging Face. Said
out loud rather than buried — Fabio may prefer the narrower form, excluding only
`node_modules` and `engine/`:

```powershell
Add-MpPreference -ExclusionPath "C:\AI\Mpi\Cubric-Vision\node_modules","C:\AI\Mpi\Cubric-Vision\engine","G:\CubricModels"
```

## FIX 2 — VS Code watcher + search excludes (agent's, done here)

`files.watcherExclude` + `search.exclude` for `engine/**`, `node_modules/**`,
`.playwright-cli/**` in `Cubric-Vision.code-workspace`. Watchers over a multi-GB
`engine/` and a full `node_modules` are what keeps the extension hosts busy.

**Constraint: `Cubric-Vision.code-workspace` is GITIGNORED** (`.gitignore:67`,
`*.code-workspace` — NOT `:63`, which is `project-paths.json`; CLAUDE.md:175 has
the wrong line and this card copied it).
The fix is **local only** — a fresh clone or a second machine inherits none of
it. Do not report it as shipped for anyone else.

**Constraint: do NOT re-add the sibling repos to that workspace file** while
editing it. CLAUDE.md documents why (a workspace folder loads that repo's
skills / agents / plugins; `permissions.additionalDirectories` grants the access
without the config).

**Watcher excludes need a window reload to take effect** — the file watcher is
armed at window open. That reload also reaps the stale MCP servers below.

## OPTIONAL — reap stale MCP servers

Counted 4 `@playwright/mcp` and 6 `@modelcontextprotocol` node processes, each an
npx wrapper plus the real server — several pairs left over from earlier sessions.
They die with the VS Code window that spawned them; a **window reload is enough**
and it does **not** touch the running app.

## Hard constraints

- **Never restart or close the user's app or the ComfyUI engine to chase CPU.**
  The engine idles around 2.3% and that is normal.
- Fabio's Bun process is not ours — identify it before blaming anything in this repo.

## Knowledge to preserve on close

- If the Defender exclusion holds, it belongs in `~/.claude/memory/general.md` as
  an **environment** fact — it is about Fabio's machine, not this codebase, so it
  does not go in `docs/`.
- The CPU-time-delta recipe is worth keeping wherever tool traps live; Task
  Manager's own column misleads on a 20-core box.
