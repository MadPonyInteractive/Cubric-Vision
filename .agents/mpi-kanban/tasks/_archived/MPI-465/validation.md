# MPI-465 — validation

Both halves of the bar are met. The card's own attention line set it:
*"the REMOTE half, i.e. the Pod image running the 0.30.0 engine, which the MPI-467 smoke matrix
proves. Close this card on smoke-evidence.json, not on another local check."*

## LOCAL half — user-confirmed 2026-08-08

LTX image-to-video ops all tested and passed on this machine (same for WAN and both H3 models).

## REMOTE half — smoke-evidence.json, third matrix, 2026-08-09

The matrix reached the GPU stage for the first time and LTX executed on the shipped Pod image:

```
PASS ltx-23-balanced/t2v_ms   78s   1 media
PASS ltx-23-balanced/i2v_ms   42s   2 media
engine: { want: 0.30.0, got: 0.30.0, proven: true }
```

Ran on L4 `orxp87067tddah`, EU-RO-1, volume `aghcuvg7nl`, gate 7 clear
(`Pod image built from 0.30.0, matches node_lock`). Real wall-clock and real media out — not the
4s no-op shape that let a dead graph read as a pass.

**This is the model that shipped dead for six days.** KJNodes calling `.to()` on a ModelPatcher
is executed-and-green on 0.30.0 now, on the engine users will actually get.

## Not closed by this card

The matrix's one remaining failure is `minimax-h3/t2v_ms`, which is MPI-501 (a renderer-triggered
`restart-comfy` landing on a running queue) and has nothing to do with LTX. `release:check` still
refuses the evidence for that one op — tracked on MPI-467, not here.
