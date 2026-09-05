# MPI-695 Validation

## What ran

```
$ node scripts/smoke-workflows.mjs --self-check
  ⚠ give-up stalled — synthetic
.
  ⚠ transient did not become ready within 0 min
self-check OK (Input_Width=128, Input_Steps=1, Input_Frames=5, Input_Duration=1)

real    0m5.121s
```

The 5 s is the transient-throw assert paying one real poll interval. Deliberate —
it is the assert guarding the paid-hardware path.

Nine new asserts: `installProbe` raises `GiveUp` only after `stallMs` with no
movement, resets its clock when bytes move, reports an unregistered job as
not-done and a settled job as done; `waitReady` ends immediately on `GiveUp` and
still swallows-and-retries an ordinary throw.

## Mutation-verified — three mutations, three different failures

| Mutation | Result |
|---|---|
| probe throws plain `Error` instead of `GiveUp` | `FAILED: no byte movement past stallMs raises GiveUp, got Error: stalled…` |
| `waitReady` treats **every** throw as give-up | `FAILED: an ordinary throw is swallowed and polled again… (polls=1, 0ms)` |
| `waitReady` swallows `GiveUp` — **the pre-fix bug** | `FAILED: give-up must end the wait immediately, took 60108ms of a 60s budget` (ran 1m0.186s) |

The third reproduces the defect exactly: pre-fix a give-up burns the entire
budget — 60 s in the test, **3 hours** in production — and post-fix it ends in
under a second. Note the first assert (`=== false`) passes under that mutation:
the return value alone does not discriminate, only the elapsed time does, which
is why the timing assert exists.

The second is the one that matters for blast radius. It proves the suite catches
a regression that would make the Pod-ready wait at `:623` die on the first
connection refused against a still-booting host.

Mutant copies deleted.

## Blast radius swept — all three `waitReady` call sites

| Site | Change | Proof |
|---|---|---|
| `:623` Pod ready | none; transient throws still retried | mutation 2 above |
| `:1493` install | give-up now ends the wait in ~0 s instead of 3 h | mutations 1 + 3 |
| `:1507` install retry | **gained** a movement check it never had, via the shared factory | same `installProbe`, same asserts |

## CLOSED — the last gap shut live, 2026-09-05

The self-check fixture invented the job shape from the old inline probe, so
`installProbe`'s default `getJobs` — `(await app('/comfy/downloads/status')).jobs
|| []` — was the one unexercised line. Checked against the real route
(`scratchpad/check_probe_shape.mjs`, read-only):

```
top-level keys: success, version, jobs
`jobs` is an array: true
jobs: 13
  modelId=sdxl-nsfw status=complete deps=10 depKeys=id|status|downloadedBytes|totalBytes|error
  j.modelId  string    j.status  string    d.downloadedBytes  number
```

Every field the probe reads is present with the assumed type, `.jobs || []` is
the right envelope, and the 13 real jobs sit at `complete` — which
`!IN_FLIGHT.includes('complete')` correctly reads as done. `deps[].status` is
there too, which is what the failed-dep filter downstream reads.

The poll loop itself was exercised live in the same session under [[MPI-692]]:
the real `waitReady` polled the real app three times, printing dots, and returned
true normally.

So: movement/stall logic proven by fixture with real timing and mutation-verified
three ways, job shape proven against live data, loop proven live. Closing.

**Honest residual:** no live multi-gigabyte download has run through this code —
the volume has been full since the 2026-09-05 release matrix, so every install
since has verified in about a second. The give-up path has therefore never fired
in production, only under mutation. It is not being held open for that: the
checks that define the card ran and passed, and waiting for a production stall is
waiting for a failure that may not come for months. If the music-maker run
(MPI-664 / MPI-694) does download fresh weights, its transcript is worth reading
as confirmation — dots under `[1/N] <model>` — but nothing depends on it.

## Was: NOT verified (superseded above)

The `getJobs` default (`app('/comfy/downloads/status')`) has not executed — it is
the same call the old inline probe made, relocated unchanged, but no live run has
exercised it. Live verification is refused by design: GPU-lease gated behind the
1.4.5 release matrix, and a live run rents a Pod to pull ~290 GB.

## How this card closes

A smoke run that actually **downloads** weights — not one that re-verifies an
already-filled volume. The 2026-09-05 release run (minimax-h3) shows the
difference: `installing 9 deps` at 09:10:06.336Z, `installs verified` at
09:10:07.000Z. One second, **zero dots** — the probe returned true on its first
call and the wait never looped, so it exercised nothing.

Expected closer: the music-maker models (MPI-664 MiniMax Music 3, MPI-694 Stable
Audio 3). Unlike [[MPI-692]], a clean run is **sufficient** here — dots under
`[1/N] <model>` mean the wait is really polling, which is `installProbe`'s whole
mechanism: bytes moving, clock resetting, false then true. No induced failure
needed.

A stall appearing naturally would be a bonus, not a requirement: the line to
look for is `⚠ install <id> stalled — no bytes moved for 10 min` followed by the
Pod recycle, where the pre-fix code dotted on for three hours.

MPI-664 has been asked (message `65ea3341`) to preserve the install section of
`dev_configs/smoke-run.txt` before the next run truncates it.

## Constraints honoured

`dev_configs/` untouched. One source file, claimed in `files.json` before the
first edit. The peer's run (`pid 17864`) read the file at import and cannot be
reached by a disk edit.
