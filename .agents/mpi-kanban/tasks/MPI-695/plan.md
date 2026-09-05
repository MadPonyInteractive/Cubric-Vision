# MPI-695 Plan — the smoke runner's stall watchdog can never fire

## Root cause

`waitReady` treats every throw from its probe as transient:

```js
try { if (await probe()) return true; } catch { /* keep polling */ }
```

The install probe uses a throw to mean the opposite — give up now:

```js
else if (Date.now() - lastMoveMs > STALL_MS) throw new Error('stalled');
```

So `STALL_MS` (10 min of no byte movement) shortens nothing. `lastMoveMs` is
never reset, so the probe throws on every subsequent poll and the loop dots on
for the full `timeoutMs` of **3 hours** before `{ soft: true }` returns false and
the Pod-recycle branch runs. The trailing `.catch(() => false)` catches only a
rejection from `waitReady` itself, never the probe's, which is already caught
inside the loop.

The cause is not the catch. It is that **a probe has two things to say — "blip,
retry" and "stop, this is pointless" — and only one channel to say them in.**
Deleting the catch would fix the stall and break Pod-boot waits, where a
connection refused against a booting Pod is normal and must be retried.

## Blast radius — every `waitReady` call site (shared primitive)

| Site | Probe | Classification |
|---|---|---|
| Pod-ready wait (`/remote/comfy/status`) | `(await app('/remote/comfy/status')).ready` | Throws only transiently (a booting Pod refuses connections). **The swallow is load-bearing — must keep working.** |
| install, first round | movement check, throws `'stalled'` | **The bug.** Give-up signal swallowed. |
| install, retry round | no movement check at all | **Second hole.** A Pod that dies during the retry hangs the full 3 h with nothing watching. |

## Fix

1. `class GiveUp extends Error {}` — a probe throwing this means the wait is
   pointless now. `waitReady` ends on it (soft → `false`, otherwise `die`);
   every other throw stays transient and keeps polling. One channel per meaning.
2. Extract `installProbe(modelId)` and use it for **both** rounds. The retry
   carried a stripped copy with no movement check — a copy is how that hole got
   there, so the fix is one factory, not a second patched copy. Net deletion.

Not doing: a `stall` option on `waitReady`. That would move install-specific
byte-counting into a generic wait primitive, which is the wrong home.

## Verification

**Verify mode:** auto

`node scripts/smoke-workflows.mjs --self-check`, extended with:

- `GiveUp` + `{ soft: true }` returns `false` in well under the timeout. With
  `timeoutMs = 60_000` the pre-fix code takes the full 60 s; asserting the
  elapsed time is under a second is what discriminates fixed from broken.
- a non-`GiveUp` throw is still swallowed and still polls — asserted by elapsed
  time crossing one 5 s poll interval, so the Pod-boot path provably did not
  become "die on the first connection refusal".
- `installProbe` throws `GiveUp` only after `STALL_MS` with no movement, and
  returns `false`/`true` correctly on a moving and a settled job.

Live behaviour stays unproven by design: the runner is GPU-lease gated behind
the 1.4.5 release matrix and a live run rents a Pod to pull ~290 GB.

Note: the self-check gains ~5 s of real sleeping for the transient-throw assert.
That is deliberate — it is the assert that guards the paid-hardware path.

## Current State

Implemented and mutation-verified; see `validation.md`. Card sits at
`validating` for the same reason as [[MPI-692]] — the next live smoke run is the
first execution against a real Pod.

## Remaining Work

None in code. Live confirmation only: a stalled install should recycle the Pod
in ~10 min instead of ~3 h.

## Completed

- `GiveUp` + the two-channel `waitReady` catch
- `installProbe` factory shared by both install rounds; `IN_FLIGHT` lifted to
  module scope so the factory can live beside `waitReady`
- nine `--self-check` asserts, three mutations

## Plan Drift

- 2026-09-05: the first draft of the stall assert used `stallMs: 0`, which is a
  coin flip — both probe calls land in the same millisecond, so
  `now - lastMoveMs` is `0` and `> 0` is false. Deterministic at `-1`. The test
  was wrong, not the code; caught because the assert failed on the first run.
