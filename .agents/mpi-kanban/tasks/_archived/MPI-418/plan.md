# MPI-418 Plan — one writer, real retention

## Why this grew

The card started as "[server] errors never reach app.log". The sink fix landed
(`2012f6c6`) and is **proven on real hardware** — see `validation.md`. Pointing
both processes at one file then exposed two defects that the split file had been
hiding, the second of them destructive. The card now covers the logging
subsystem's write path, because shipping the sink fix without these makes
diagnostics *worse* than before it.

## Defect 1 — duplication (fixed, superseded)

The child's `routes/logger` persists each line AND mirrors it to stdout;
`pipeChildStream` re-logged that mirror. Every structured server line landed
twice — 826 of 1,964 lines in the measured install. `59b154c4` skips
already-persisted lines. **Superseded by the single-writer change below** — keep
its test, the fix itself becomes moot when only one process writes.

## Defect 2 — concurrent rotation destroys history (OPEN, the reason this card is still a blocker)

`_appendToFile` does stat → if `size >= MAX_LOG_BYTES`, `move(log, bak)` → append.
Safe when each process owned a file. Sharing one file makes it a race:

1. Main stats 262KB, moves `app.log` → `app.log.1`, appends, creating a fresh
   100-byte `app.log`.
2. The server stat'd *before* that move, also saw 262KB, and moves `app.log` →
   `app.log.1` as well — but `app.log` is now main's fresh 100-byte file, so the
   real backup is **overwritten with 100 bytes**.

Measured on the Windows portable 2026-07-31, end state:

```
app.log      472 bytes
app.log.1    100 bytes
```

A full session — engine install, model download, ComfyUI boot, generation — was
erased. Rotation only fires at >=256KB, so a 100-byte backup has no other
explanation. It survives only as a scratchpad copy.

## Defect 3 — retention is too small to be useful (user decision, 2026-07-31)

One normal install-and-generate blew through the 256KB / one-backup window
**twice**. Even deduplicated it would rotate away the engine install, which is
the single most valuable thing a bug report carries. The small size was
deliberate (so an agent can read the file whole) — the fix keeps that property
per-file and gets history from file *count* instead.

## The design

**1. One file, one writer.** Main becomes the sole file writer. The server keeps
mirroring to stdout (dev tools, and the pipe depends on it) but skips its own
file write when it is a fork. `typeof process.send === 'function'` is the
discriminator — true in a fork, false in main and false for a standalone
`node server.js`, which must keep writing its own file in dev.

**2. Verbatim relay.** Main appends the child's structured lines **unchanged**,
preserving the child's original timestamp. Do NOT re-parse and re-log through
`logger.info(category, message)` — that stamps main's receive time and loses the
child's. Raw output (no logger behind it: dotenv's banner, a library
`console.log`, Node module-resolution errors) is still formatted under
`[server]`, which is the whole reason the pipe exists.

**3. Rotation.** Active file stays `app.log` so `logger.getLogPath()`,
`routes/system.js` (two call sites) and the in-app log download keep working. At
>=256KB it is renamed `app-YYYYMMDD-HHMMSS.log` and a fresh `app.log` starts.
Immutable archives, no N-file rename shuffle.

**4. Pruning.** At rotation, list `app-*.log`, sort by name (chronological),
unlink past the newest 20. ~5MB, ~40k lines of history.

**5. Byte cap, not line cap.** 256KB is already tracked and O(1); ~2000 lines,
which is the stated goal. A line cap needs a counter carried across restarts or
a read-on-boot. Swap to lines only if the user asks.

## Deliberately NOT in scope

- **Rotate-on-app-start.** Would have made this session's install one clean file,
  but quick restarts churn tiny files and evict real history. Offered, declined
  for now.
- Changing the `[ERROR]` level of Node's stderr warnings (they are warnings).
- `"type": "module"` in `resources/app/package.json` to stop the ES-module
  reparse. Correct, far too broad for this card.

## Verification

**Verify mode:** auto

1. `node tests/logger-sink-userdata.test.cjs` — extend it: assert only one
   process writes, archives are created and pruned at the limit, and the child's
   original timestamp survives the relay verbatim.
2. Race regression: two processes appending concurrently across a rotation
   boundary must never leave an archive smaller than the cap. Drive it with two
   child processes in the test, not by mirroring the logic.
3. Live, on a rebuilt portable: install the engine, then confirm the engine
   install is still readable on disk afterwards — the exact thing that was lost.
4. No duplicate lines: `sort | uniq -d` over a real session's log is empty
   modulo genuinely repeated messages.

## State

- `2012f6c6` — sink fix. CORRECT, proven, keep.
- `59b154c4` — dedup. Superseded by single-writer; the drop became a verbatim
  relay in `writeChildLine`, and its test case survives as check 4.
- Design implemented 2026-07-31 (uncommitted at time of writing): `routes/logger.js`
  fork-skip + serialized appends + timestamped archives + prune 20;
  `main.js` `writeChildLine` relays structured lines and their indented stacks
  through `logger.appendRaw`. Verification 1 and 2 pass — see `validation.md`.
- **Remaining: verification 3 and 4**, both live. Rebuild the artifacts, install
  the engine on Windows, confirm the install is still readable on disk after.
  1.3.0 must not ship before that leg.
