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
cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

A PR run is superseded by its own next push and cancelling it is right. A push to
master or to a release branch is a permanent point in history — the only way to
know which commit broke the suite is to let its run finish.

Cost: more runner minutes. The repo is public, so Actions minutes are free.

## What "done" looks like

- `tests.yml` cancels PR runs only.
- A push to master leaves the previous master run alive (verified on the next
  two commits that land close together, or by the run list showing no new
  `cancelled` on master).
- No other change. The pre-push hook is left alone — once every master commit
  has a verdict, it already does what it was written to do.
