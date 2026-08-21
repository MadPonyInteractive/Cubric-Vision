# MPI-563 — Remote WS drop misreports as out-of-memory

## Root cause

`comfyController._onWsDropped()` builds its error with a message that itself contains
the words "out of memory":

> "The remote engine disconnected mid-generation — the Pod may have run **out of memory**
> and restarted. Try a shorter or smaller generation, or reconnect from Settings → RunPod."

and tags it `err.code = 'engine_dropped'`.

`commandExecutor.js` has **no `engine_dropped` branch at all** (zero occurrences). The
generic OOM classifier — a regex over `err.message` — matches that text first and
returns, so every remote WS drop renders as:

> "Ran out of memory processing this — the inputs are likely too large. Try smaller or
> shorter media, or free up memory and run again."

## Why it matters (not just wording)

The swallowed message carries the **remedy**: `reconnect from Settings → RunPod`. After a
drop the engine is gone, so "try smaller media and run again" sends the user into a retry
that cannot succeed until they reconnect. Wrong action, not just wrong text.

Fires on every drop cause — user-stopped pod, network blip, host eviction, wrapper crash,
idle watchdog — regardless of whether memory was involved.

## Evidence (2026-08-14, MiniMax H3 `ref2v_ms`)

Two events in `%APPDATA%/Cubric Vision/logs/app.log`, identical signature:

```
remote SSE stream aborted: terminated
WebSocket error (may be transient)   x6
Remote WS dropped mid-generation — ending pending generations
Out of memory — ref2v_ms / minimax-h3-ref2va
```

Real cause was a 55.88 GiB-RAM Pod on a ~360-frame (15 s) run; `minRamGb` defaults to 0
so no floor was applied. Re-run on an 85.68 GiB host with `minRamGb: 65` completed clean.
The toast's wording happened to be true here **by coincidence** and sent the diagnosis to
the resolution setting (1536), which was never the problem.

## Checklist

- [ ] Add an `engine_dropped` code branch in `commandExecutor.js` **before** the OOM regex
- [ ] Surface `err.message` verbatim (already user-facing and accurate)
- [ ] Warning toast, not the bug-reporter dialog — matches the neighbouring branches
- [ ] Confirm the OOM regex still catches genuine ComfyUI OOM (message-based, code-less)
- [ ] `node --test "tests/*.test.cjs"` green
- [ ] `python <mpi-lib>/scripts/validate_board.py .` exit 0

## Out of scope

Not touching the RAM floor default (`minRamGb: 0`), and not adding a frame-count→RAM
guidance note. Both discussed and deliberately left — the user closed that line of work.
