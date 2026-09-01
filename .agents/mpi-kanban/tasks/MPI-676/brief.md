# MPI-676 — master's red is found late, and on the wrong commit

Follow-up to MPI-675. That card fixed **one** red (an order-dependent test).
This one is about why reds keep going unnoticed until several commits later.

## Measured

`gh run list --branch master --limit 60` (2026-08-30 09:09Z → 2026-09-01 09:32Z):

| conclusion | runs |
|---|---|
| success | 37 |
| **cancelled** | **17** |
| failure | 5 |

**28% of pushes to master never produced a verdict.** `tests.yml` sets

```yaml
concurrency:
  group: tests-${{ github.ref }}
  cancel-in-progress: true
```

on *every* ref. Sessions here push directly to master, several commits minutes
apart, so each push kills the run started by the one before it.

## What that costs — the MPI-675 red, exactly

| time | commit | run |
|---|---|---|
| 08:51 | `e152cc10 fix(MPI-675): hand a user their log…` — **this is the commit that broke the suite** | 33489156063 → **cancelled** |
| 08:52 | `79faec57 chore(MPI-672): handoff pointer…` — adds one 4-line JSON file | 33489276364 → **failure** |

The breaking commit was never tested. A chore commit that touched nothing but a
handoff pointer wore the red, and the failure surfaced a commit late. This is not
a one-off: of the last 5 reds on master, **three** landed on a `chore:`, `docs:`
or `ci:` commit that could not plausibly have broken a test.

Second-order: `.husky/pre-push` reads the *last completed* run and blocks only on
`failure`. With cancels this common, the last completed run is usually
`cancelled`, so the guard that exists to stop a pile-up on a red master is
looking at a verdictless run most of the time.

## The change

```yaml
group: tests-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}
cancel-in-progress: true
```

A PR run shares a group with the rest of its ref and is cancelled when superseded,
which is correct — only the tip of a PR matters. A push gets `github.run_id` as its
group, which is unique, so it is a group of one: it cannot cancel a sibling and no
sibling can cancel it.

Cost: master runs now overlap instead of replacing each other. The repo is public,
so Actions minutes are free, and the free tier allows 20 concurrent jobs — far more
than the push rate here.

### First attempt, and why it was wrong

The obvious one-liner is to keep the ref group and turn cancelling off for pushes:

```yaml
cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

That was committed in `668a9041` and **it does not work**. With the group kept and
cancelling off, a second push does not cancel the running job — it *queues* behind
it as `pending`. Measured live: run 33493472210 sat pending for 37s behind
33493351437. GitHub keeps only ONE pending run per group, so the third push cancels
the second while it waits. Intermediate commits still end up with no verdict; the
cancellation just moves from in-progress to pending. Superseded by the unique-group
version above.

## What "done" looks like

- A push to master starts its run IMMEDIATELY, in parallel with any run already
  going, and neither is cancelled.
- PR runs still cancel their own superseded predecessors.
- No change to `.husky/pre-push` — once every master commit has a verdict, it
  already does what it was written to do.
