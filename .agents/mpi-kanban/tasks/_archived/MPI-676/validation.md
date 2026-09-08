# MPI-676 Validation

Shipped 2026-09-01 in `d637f9b4` (superseding `668a9041`).

## What shipped

```yaml
concurrency:
  group: tests-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}
  cancel-in-progress: true
```

A push gets `github.run_id` as its group — unique, so a group of one. It cannot cancel a
sibling and no sibling can cancel it. A PR keeps the ref group and keeps cancelling its
own superseded runs.

## Evidence — measured on the live board, not reasoned about

The push of `d637f9b4` landed while `33493351437` was already 3m31s into its run. The
three outcomes below are the whole point of the card:

| run | commit | old/new config | outcome |
|---|---|---|---|
| 33493351437 | `chore(MPI-664)` handoff pointer | old | **success**, 5m02s — *not* cancelled by the push that followed it |
| 33493638590 | `d637f9b4` — this change | new | **success**, 5m07s — `in_progress` 13s after the push, running in parallel with the above |
| 33493472210 | `668a9041` — the first attempt | intermediate | sat **`pending` for 7m29s**, blocked by the ref group, then ran |

Before this change, a push landing 59s into a run cancelled it — `33493278243`,
`cancelled` at 00:59, is the last example on the board.

`33493472210` is the first attempt failing in public: `cancel-in-progress: false` with the
ref group kept does not give a commit its own run, it queues it. Had a fourth push
followed, GitHub would have cancelled it while pending, because only one pending run is
held per group. Same lost verdict, different column.

## Not done here

- `.husky/pre-push` unchanged, deliberately. It reads the last COMPLETED master run and
  blocks on `failure`; it was defeated because that run was usually `cancelled`. Now that
  every master commit reaches a conclusion, it does what it was written to do. Revisit
  only if a real `failure` gets past it.
- Runner spend is not capped. Master runs now overlap instead of replacing each other.
  Public repo, so Actions minutes are free and the concurrent-job ceiling (20) is far
  above the push rate here. Worth re-checking if the repo ever goes private.
