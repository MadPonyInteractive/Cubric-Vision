# MPI-415 Validation — FIXED and live-verified 2026-07-31

## What changed

A fatal engine startup crash is now **reported**, not waited out.

| file | change |
|---|---|
| `routes/shared.js` | `processState.lastComfyExit` + `comfyStopRequested` (so a user Stop is never reported as a crash) |
| `routes/comfy.js` | 15-line rolling output tail; exit handler records `{code, signal, at, deliberate, tail}`; `/comfy/status` returns it; both cleared on a fresh spawn |
| `js/services/comfyController.js` | readiness poll aborts the moment the process is gone; `/comfy/start`'s 500 body is no longer discarded; `_describeComfyExit()` renders the sentence |

Two holes, one root cause — the startup path had **no way to distinguish "still
starting" from "already dead"**:

1. The poll loop only ever tested `check.ready`. A dead process returns
   `running: false`, which the loop ignored, so it kept polling a corpse for the
   full `COMFY_READY_TIMEOUT_S` and then blamed the clock.
2. `await fetch('/comfy/start', …)` discarded the response. That route answers
   **500 with a real message** when it cannot even spawn (e.g. *"ComfyUI Python not
   found. Provision engine first."*) — an instant, actionable error turned into a
   60-second wait ending in the same generic timeout.

## Live evidence — the real crash, on the box that produces it

Patched `routes/comfy.js`, `routes/shared.js`, `js/services/comfyController.js`
deployed to the Linux extract. All three were confirmed **byte-identical to HEAD**
before deploying, so the test isolates exactly this change.

`POST /comfy/start`, then poll `/comfy/status`:

```json
{ "code": 1, "signal": null, "deliberate": false, "tail": [ …7 lines…,
  "import sqlalchemy as sa",
  "ModuleNotFoundError: No module named 'sqlalchemy'" ] }
```

**Detected 3 seconds after the start request.** The old path waited the full
timeout and then said `ComfyUI server failed to become ready in time.`

## Message rendering — real payloads through the real function

`_describeComfyExit` extracted from the shipped source (not a copy) and driven with
the captured payload plus the SIGILL shape from the same box earlier tonight:

```
1. ComfyUI stopped while starting up — it exited with code 1. ModuleNotFoundError: No module named 'sqlalchemy'
2. ComfyUI stopped while starting up — it was killed by SIGILL. Fatal Python error: Illegal instruction
3. ComfyUI stopped while starting up — it exited with code 9. See logs/app.log for details.
```

Assertions: cause surfaced, exit code present, signal named, SIGILL cause present,
fallback guidance when nothing was printed, and the string is never the old generic
message. All passed. `eslint` clean on all five touched files.

Case 3 matters as much as 1 and 2 — a crash with no output still names the exit
code and points at the log, instead of claiming a timeout that did not happen.

## Scope decision — the CPU halves of this card are DROPPED

The user's call, 2026-07-31: CPU inference is a fallback essentially nobody uses,
so CPU-specific work is not worth carrying. Accordingly:

- **Not doing:** any `kornia_rs` pin, any CPU-capability preflight, any hardware
  requirement on the docs site. The ISA floor stays unconfirmed and unpublished.
- **Kept:** everything above. The timeout-masking defect is **not** CPU-specific —
  it fires for a wrong driver, a missing file, a full disk, any startup failure on
  any hardware. The ancient CPU was only how it was discovered.

## Not covered

The **remote/Pod** engine start path is untouched by this change. The Pod reports
its own lifecycle over SSE rather than through `/comfy/status`, so it does not share
this code. Worth a look if remote startup failures ever read as timeouts too.
