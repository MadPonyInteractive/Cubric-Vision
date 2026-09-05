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

## NOT verified

The `getJobs` default (`app('/comfy/downloads/status')`) has not executed — it is
the same call the old inline probe made, relocated unchanged, but no live run has
exercised it. Live verification is refused by design: GPU-lease gated behind the
1.4.5 release matrix, and a live run rents a Pod to pull ~290 GB.

First real evidence, shared with [[MPI-692]]: the next live smoke run.

## Constraints honoured

`dev_configs/` untouched. One source file, claimed in `files.json` before the
first edit. The peer's run (`pid 17864`) read the file at import and cannot be
reached by a disk edit.
