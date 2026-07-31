# MPI-418 Validation

## Root cause (code-established, 2026-07-31)

Not a category filter and not a missing sink — **two processes writing two
different files.**

| | resolves `APP_USER_DATA` | log file in a packaged build |
|---|---|---|
| server fork | yes — handed it in `buildServerEnv` (`main.js:592`) | `<user-data>/logs/app.log` ← what users send |
| Electron main | **never set on itself** | `<app>/logs/app.log` ← nobody collects |

`routes/logger.js:39` read the env var at **module load**, and `main.js:6`
requires the logger on its first line — before `app.setPath('userData')` runs at
`main.js:244-254`, and before `buildServerEnv` exists.

Every `[server]` line comes from `pipeChildStream` (`main.js:650-692`), which
replays the fork's stdout/stderr through the **main** logger. So the whole
category landed in the orphan file. `[engine]` lines are emitted inside the fork
and were never affected — which is exactly what made the bug read as "a category
is being filtered".

## Fix

1. `routes/logger.js` — resolve the log dir lazily on first write. Require order
   no longer decides where the app logs.
2. `main.js` — `process.env.APP_USER_DATA = app.getPath('userData')` immediately
   after the `setPath` block, before any log write.

Nothing changed at the call sites.

### One trap handled

Lazy resolution removes the module-load head start the old `_ready` flag quietly
depended on, so the **first** line written would have been dropped — precisely
where boot failures live. `_appendToFile` now awaits the `ensureDir` promise
instead of racing a boolean.

## Evidence

`tests/logger-sink-userdata.test.cjs` — drives the real module in child
processes, 3 assertions:

```
logger-sink-userdata: PASS (3 checks)
```

Proven to be a real regression guard, not a tautology — the same "env set after
require" case run against `HEAD:routes/logger.js`:

```
OLD code — late-env log exists at ...\late\logs\app.log ? false
NEW code — same check passes
```

## PROVEN on the Windows portable, 2026-07-31

Fresh install of the post-fix build into `D:\cubric-install-test\`. The exact
lines this card was raised for — the ones seen on the Mac terminal that never
reached the file — are now in `user-data/logs/app.log`:

```
[ERROR] [server] (node:27952) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of
                 .../resources/app/js/data/modelConstants/modelDeps.js is not specified
                 and it doesn't parse as CommonJS.
[ERROR] [server] Reparsing as ES module because module syntax was detected...
[ERROR] [server] To eliminate this warning, add "type": "module" to ...\app\package.json.
[ERROR] [server] (Use `CubricVision --trace-warnings ...` to show where the warning was created)
```

Line 1 of that same file is a `[mask-temp]` entry, which is a main-process
write — also impossible before. Both halves confirmed on real hardware.

## Regression this fix introduced, and its fix

Pointing both processes at one file exposed a double-write that the split file
had been hiding: the child's `routes/logger` persists each line **and** mirrors
it to stdout, and `pipeChildStream` re-logged that mirror. Every structured
server line therefore appeared **twice** — measured in the install above, e.g.

```
[INFO] [system] Server initialization started      <- child's own logger
[INFO] [system] Server initialization started      <- main replaying the pipe
```

That is not cosmetic here: it halves the effective 256KB rotation window, so a
bug report carries half the history — the exact thing this card protects.

`main.js` `writeChildLine` now replays only output the child did **not** already
persist: structured lines and their indented stack continuations are skipped,
raw output (dotenv's banner, a library `console.log`, the Node module-resolution
errors above) still lands under `[server]`. An **unindented** line ends the
continuation, so a raw error following a structured line survives — dropping it
would have re-broken this card. Both cases are asserted in the test.

## Noticed, not actioned

- Those Node warnings arrive on stderr, so they are logged at `[ERROR]` although
  Node calls them warnings. A benign warning reads as an error in a user's log.
- `modelDeps.js` is being reparsed as an ES module on every boot, with the
  performance overhead Node names. The fix it suggests (`"type": "module"` in
  `resources/app/package.json`) is far too broad to do inside a blocker fix.

## Write-path redesign — automated proof (2026-07-31)

`node tests/logger-sink-userdata.test.cjs` -> **PASS (10 checks)**. The five new
ones drive the real module through `fork()` and `spawn()`, because
`typeof process.send === 'function'` is the actual discriminator and mirroring it
in the test would have proved nothing:

- a forked child writes **no** `app.log` at all; a plain child still does (dev)
- `appendRaw` lands the child's line byte-identical, its original timestamp intact
- a 300KB `app.log` rotates to `app-YYYYMMDD-HHMMSS.log`, the archive is >= the
  256KB cap, and the fresh `app.log` carries the new line
- 25 seeded archives + one rotation prune to exactly 20, oldest gone, newest kept
- **race regression:** a real fork and a real sole-writer spam 400 lines each at
  the same shared, already-full log. No archive comes out below the cap (the bug
  left a 100-byte one) and no fork line reaches the file.

Negative check: setting `IS_FORK = false` fails check 5 immediately
(`a forked child must not write app.log`). The test bites.

Also confirmed the existing ring-buffer consumer still works —
`tests/runpod-remote-hardening.test.cjs` 0 failures.

**Still open:** the live leg. Rebuild the three artifacts and install the engine
on Windows, then confirm the engine install is still readable on disk afterwards
— that is the exact history the race destroyed, and no unit test can stand in
for it.

### Live dev boot, 2026-07-31T17:49Z (real pipe, not the mirrored state machine)

`npm start`, one boot, `%APPDATA%/Cubric Vision/logs/app.log`:

- Raw child output still lands under `[server]` — dotenv's banner and the four
  MODULE_TYPELESS_PACKAGE_JSON warnings, the exact lines this card was raised for.
- Structured child lines carry the CHILD's timestamp, so the relay is verbatim:
  `[17:49:07.805Z] [INFO] [system] Server initialization started` arrives stamped
  by the fork, not by main's receive time.
- `[mask-temp]` from main is in the same file, one file, one writer.
- `sort | uniq -d` over the 19-line boot window: **no duplicate lines**.

Not proof of rotation (the file was 108KB, under the cap) — that leg stays with
the unit tests and the rebuilt portable.

**Noticed, not actioned:** `[gpu-detect]` runs twice per boot ("Starting GPU
detection...", the NVIDIA line and the resolved config all appear twice, ~20ms
apart). Different timestamps, so it is two real detections, not a relay
duplicate — pre-existing and outside this card.

The legacy `app.log.1` from before this change is left in place; nothing reads it
and the new rotation will not touch it.
