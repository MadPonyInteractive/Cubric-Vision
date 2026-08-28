# MPI-637 — validation

## The symptom

Fabio: "when the app opens, there are like 10 terminals that open and close rapidly …
this reads as hacking for some users." Screenshot showed a Windows Terminal window
titled `C:\Users\Fabio\AppData\Loca…` carrying
`[process exited with code 0] You can now close this terminal with Ctrl+D`.

## 1. What actually spawns (pre-fix, measured)

`Win32_Process` polled at 50 ms across several app boots
(`Get-CimInstance Win32_Process`, new-PID diff). Children of the forked
`server.js` Electron process, per boot:

| Command | Count | Source |
|---|---|---|
| `wmic path win32_videocontroller get name` | 4 | `routes/platformEngine.js` `detectAmdGPU` + `detectIntelArcGPU`, and GPU detection runs **twice** per boot |
| `nvidia-smi --query-gpu=name --format=csv,noheader` | 2 | `platformEngine.js` `detectNvidiaGPU` |
| `nvidia-smi` (bare, for the CUDA header) | 2 | same |
| `nvidia-smi --query-gpu=memory.total,memory.used …` | polled | `routes/system.js` `getVramStats` |
| `node C:\Users\Fabio\AppData\Local\Cubric\bin\broker\dist\cli.js --metadata …` | 1 | `@cubric/connector` `ensureBroker`, command from `services/brokerBoot.js` |

Each console child had its own `conhost.exe` child. The broker line is literally the
window in the screenshot — path, and "exited with code 0", both match.

## 2. Why they show (mechanism, measured)

`scratchpad/inner.mjs`, run from a parent spawned DETACHED so it owns no console —
the app's exact situation, since `server.js` is a fork of a GUI-subsystem Electron
binary. Counts **visible console host windows** (`EnumWindows` filtered to
`ConsoleWindowClass` / `CASCADIA_HOSTING_WINDOW_CLASS`), not processes: with Windows
Terminal as the default host a new console becomes a tab in the EXISTING WT process,
so process counting reports zero and reads as a false pass.

| spawn options | new console windows |
|---|---|
| bare (what `routes/` had) | **1** |
| `detached: true` + `windowsHide: true` | **1** — the flag is ignored |
| `windowsHide: true` alone | **0** |

Matches the CreateProcess docs: `CREATE_NO_WINDOW` "is ignored if … used with either
CREATE_NEW_CONSOLE or DETACHED_PROCESS".

## 3. The `detached` trap — why the connector was NOT changed

First attempt made `detached` POSIX-only in `@cubric/connector`. Measured
(`scratchpad/lifetime.mjs`, both variants in one run so a harness artefact cannot read
as a difference):

```
detached:true  (old): child alive 2.5s after parent exit = True
detached:false (new): child alive 2.5s after parent exit = False
```

A non-detached broker dies with whichever app started it. Reverted — the connector
keeps `detached: true` and gained only a comment recording the constraint.

## 4. The fix

- `windowsHide: true` on every `child_process` call in `routes/` and `services/`
  (`platformEngine` `_run` + both `wmic` calls, `system` VRAM read, `shared` pip +
  custom command, `engine` `_runStreaming`, `gitProvision` probes + install,
  `comfy` engine start).
- `services/brokerBoot.js` now passes `[process.execPath, cliPath]` +
  `env: {…, ELECTRON_RUN_AS_NODE: '1'}` instead of `['node', cliPath]`. Electron is
  GUI-subsystem, so it never gets a console — detached or not. `EnsureBrokerOptions.env`
  exists for exactly this and the old comment saying it did not is stale.

## 5. Evidence the fix holds

**Real boot, launched console-less like a real user** (`Start-Process electron.exe .`,
own profile + port, `scratchpad/bootcheck.ps1`):

```
baseline windows: 3
launched electron pid 31600
NEW console windows during window: 0
```

App log for that boot confirms the work actually ran — `gpu-detect` twice, NVIDIA
found, connector responder registered.

**Broker spawn, isolated** (`scratchpad/brokercheck.mjs`; scratch
`CUBRIC_BROKER_ENDPOINT` + `CUBRIC_BROKER_METADATA`, so the family broker was never
touched). The boot above reported `spawned=false` — a broker was already up — so this
forces the spawn path:

```
ensureBroker spawned=true
NEW console windows: 0
```

`spawned=true` with no throw means the broker came up and its metadata round-tripped,
so the Electron-as-Node command works, not just stays quiet. Scratch broker killed
afterwards.

**Regression guard:** `tests/windows-hide-spawn.test.cjs` — 4 tests. Scans `routes/`
and `services/` for `child_process` calls missing `windowsHide`, rejects any call
pairing it with `detached: true`, pins the `brokerBoot` command shape, and
self-checks its own scanner (a bare call must be caught; a regex `.exec()` and a
call named only in a comment must not).

`npm test`: 765 pass, 0 fail. `npx eslint` on every touched file: clean.

## Not done (deliberate, out of scope)

GPU detection runs **twice** per boot and calls `wmic` even after NVIDIA is found —
8 wasted process spawns per boot, ~200 ms each. Now silent, but still waste. Not a
terminal-window problem, so left for its own card.
