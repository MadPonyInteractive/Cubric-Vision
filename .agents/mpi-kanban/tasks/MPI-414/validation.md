# MPI-414 Validation

## Fix

**Client — `MpiEngineInstall.js:305-336`.** Retry routes on
`/engine/version-check` (`installed !== null`), not `/engine/status`.

**Server — `routes/engine.js` `/engine/repair-deps`.** Refuses an engine with no
`.mpi_engine_version` and hands off to `_runEngineDownload()` instead of
installing custom nodes and broadcasting `engine:complete` over a ComfyUI that
cannot boot. Defence in depth: the server no longer trusts the client's routing.

**Docs — `docs/comfy.md`.** The engine bootstrap retry contract said
`/engine/status`; corrected, with the reason.

## Why the version stamp is the right question

`/engine/status` answers *"does the venv python exist"*. On the uv path
(Linux/macOS) that is true from step 1, long before ComfyUI is cloned. Windows
never exposed it because its archive lands python and ComfyUI together.

The stamp is written only after a successful `comfy install`
(`routes/engine.js:574-580`), and `/engine/version-check` deletes a stamp whose
python has gone (`:659-667`). So `installed !== null` means *a complete install
finished*, which is the actual precondition for a deps-only repair.

## Evidence — measured on the failing machine, before the fix

From `brief.md`, probed on the broken Linux engine on 2026-07-31:

| probe | result | route it selects |
|---|---|---|
| `/engine/status` | `exists: true` | `/engine/repair-deps` ← **wrong, this was the bug** |
| `/engine/version-check` | `installed: null`, `needsInstall: true` | `/engine/download` ← **correct** |

The two endpoints disagreed on the real broken engine, and the one now used gave
the right answer. This is the field measurement, not a reconstruction.

`/engine/download` then recovers rather than re-downloading, because MPI-411
already made `comfy install` pass `--restore` over an existing clone.

## Blast radius

- `/engine/status` — one live consumer, the Retry button. Now none. Route left
  in place (flagged, out of scope to delete).
- `/engine/version-check` — 3 consumers (`shell.js:262`, `shell.js:396`,
  `engineGate.js:57`), none changed; this fix only adds a fourth reader.
- `/engine/repair-deps` — 2 client callers: Retry (fixed) and the boot
  `repairing` modal (`MpiEngineInstall.js:411`), which `shell.js` already gates
  behind version-check. The server guard covers both.

## Deliberately not done

- **No stamping from any other path.** A stamp only exists when `comfy install`
  exited 0. Stamping elsewhere produces the green-stamp-on-a-broken-engine the
  brief calls worse than no stamp.
- **No live python-import readiness probe.** Second source of truth, startup
  cost, and the stamp already implies a successful install. Revisit only if a
  *stamped* engine is ever seen failing to boot.

## Live proof — macOS, 2026-07-31

Run on the rented Mac (macOS 26.5, arm64) against the **shipped 1.3.0 artifact**,
not a dev tree: `CubricVision-macos-arm64-v1.3.0.zip` md5
`a92ebc65076f5f966f527b20feb73944`, identical to the staged build in
`D:/CubricStudio/Vision/Builds/v1.3.0/`, built from `20f1e743` which carries the
fix commit `2012f6c6`. Both halves of the fix were grepped out of the extracted
build before the run — client routing on `/engine/version-check`, server stamp
guard at `routes/engine.js:712`.

Fresh extract, empty `engine/`, portable `user-data/`. Nothing pre-existing.

### The interrupted first install

Install started from the **real Install button** in the app (CDP click on the
live renderer — see the note at the end). ComfyUI cloned, then the `comfy`
child process was killed mid `pip install -r requirements.txt`, which is what a
user quitting partway produces. The app stayed up and showed its own error:

```
[19:46:22.695Z] [ERROR] [engine] Engine download/install failed
  Error: comfy-install failed (exit null): .../comfy-venv/bin/comfy ... install --m-series --version 0.29.2
```

Resulting on-disk state — the reported failure, reproduced rather than
reconstructed: venv python present, full ComfyUI clone with `.git`, **no
`.mpi_engine_version`**, and **no `sqlalchemy`** in site-packages.

### The endpoint disagreement, live on macOS

Measured seconds apart on that exact state:

| probe | result | route it selects |
|---|---|---|
| `/engine/status` | `{"exists":true}` | `/engine/repair-deps` ← what the OLD client read |
| `/engine/version-check` | `{"installed":null,"needsInstall":true}` | `/engine/download` ← what the FIXED client reads |

The Linux measurement in the section above is now confirmed on a second uv-path
platform.

### Retry — the literal button press

The error phase was on screen with the Retry button visible. Clicking it
produced, with **no `UW deps repair requested` anywhere in the session**:

```
[19:47:01.147Z] [INFO] [engine] Download request received
[19:47:01.148Z] [INFO] [engine] _runEngineDownload started
[19:47:02.901Z] [WARN] [engine] ComfyUI workspace already cloned — installing with --restore
```

Retry reached the full install, and MPI-411's `--restore` recovered the existing
clone instead of re-downloading. 57s later `.mpi_engine_version` = `0.29.2`,
`sqlalchemy` PRESENT, `version-check` `installed: "0.29.2"`, the install modal
gone from the DOM, and `POST /comfy/start` → `/system_stats` answering
`comfyui_version: 0.29.2` with **0 IMPORT FAILED**.

### The server guard, driven directly

Before the button run, the same interrupted state was hit with a direct
`POST /engine/repair-deps` — what the buggy client would have called:

```
[19:37:38.545Z] [INFO] [engine] UW deps repair requested
[19:37:38.547Z] [WARN] [engine] Repair requested on an engine with no version stamp — running the full install instead
[19:37:38.548Z] [INFO] [engine] _runEngineDownload started
```

No deps-only pass, no early `engine:complete`. It recovered to a stamped,
booting 0.29.2 engine. So recovery holds on **either** route: the client picks
the right one, and the server refuses the wrong one.

### Note on how the buttons were pressed

The app was launched with `--remote-debugging-port=9222` and its real Install
and Retry buttons were clicked over CDP, driving the shipped renderer's own
listeners and fetches. This is a genuine button press, not a simulated request —
the log lines above are the app's own traffic.
