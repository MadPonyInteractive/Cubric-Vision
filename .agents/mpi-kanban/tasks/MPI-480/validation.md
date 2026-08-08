# MPI-480 — validation

Fix commit: `20ac408b` — *a warming Pod's wrapper 404 is a toast, not a GitHub report*.

## Root cause (traced, not guessed)

`wrapperFetch` already classified 404/502/503/504 from the RunPod proxy as transient — it
retries exactly those. But `remoteInstallDep` threw a **bare** `Error`, so the classification
died at the throw. `downloadManager` aggregated it into a model-level `download:failed`
carrying only a message string, and the renderer — with nothing to branch on — fell through
to the `ui:error` Report-on-GitHub branch. The contract in `routes/remoteModels.js` had
promised a toast since MPI-120; nothing ever carried the verdict to the renderer.

The fix carries the verdict (`err.transient` → `dj.transient` → broadcast → `ui:warning`),
mirroring the MPI-427 `networkBlocked` path. The retry budget is **unchanged** — widening it
would hide this instance and leave the classification wrong.

## Blast radius swept

| consumer of the transient status | reaches the report dialog? | action |
|---|---|---|
| `remoteInstallDep` (`/wrapper/models/install`) | **yes** — the reported defect | stamped + plumbed end to end |
| `remoteModelsCheck` (`/wrapper/models/status`) | no — the install pre-check catches it non-fatally (`remote pre-check failed`, logged warn) and never returns an HTTP error | stamped anyway; same primitive, same defect class |
| `remoteUninstallDep`, `remoteModelPresent`, `remoteCancelInstall`, manifest, restart-comfy | no — each already swallows to `unsupported` / `false` / `{}` / a warn | no change |

The `_firePost` pre-flight dialog in `downloadService.js` cannot receive this condition:
`/comfy/models/download/start` responds `200` (register-before-respond) before any dep
install is attempted, so a wrapper 404 always arrives later over SSE.

## Acceptance

| # | criterion | status |
|---|---|---|
| 1 | transient 404/502/503/504 during warm-up → toast, not the dialog | **code shipped**, server half unit-proven; renderer branch is a 1:1 mirror of the proven `networkBlocked` branch |
| 2 | a GENUINE failure still reaches the report dialog | **proven** — `tests/remote-transient-install-toast.test.cjs` asserts 400 (with a real `sha256 mismatch` reason), 401, 403, 409, 500 and 501 are all left un-flagged |
| 3 | proven against a REAL cold `__cpu__` Pod inside its 404 window | **NOT DONE — blocked** (see below) |

## Test

`node --test tests/remote-transient-install-toast.test.cjs` — 5 checks, passing. Full suite
`npm test`: **493/493 pass, 0 fail** after the change.

It stubs `remoteProxy`/`remoteEngine` through `require.cache` so the REAL `wrapperFetch`
retry loop and the REAL `remoteInstallDep` throw site run with no app, no port and no Pod,
and swaps `globalThis.setTimeout` for an immediate-fire version so the real 15 x 2s budget
elapses instantly instead of taking ~30s per case.

## What is left, and why it is not done

Acceptance #3 needs an install POSTed at a real cold `__cpu__` Pod inside its 404 window.
That requires the app on :3000 and a remote-engine connect/disconnect. **Both were off
limits for this session** — a sibling agent was running the MPI-467 smoke fill against
exactly that app and that Pod, and the user placed them out of bounds mid-session.

This is a resource conflict, not a judgement call: any agent can run it once the Pod is
free. The recipe is the one the brief already gives — bring up a cold `__cpu__` download
Pod, wait for `/health` green, and POST an install immediately, before
`/wrapper/models/install` is routable. Expected after this fix: a warning toast reading
*"The remote engine isn't ready yet — install <model> again in a moment."*, and **no**
Download Failed + REPORT ON GITHUB dialog. `logs/app.log` should still carry the real
`remote install trigger failed for <dep>: wrapper install 404` line — the fix changes how
it is surfaced, never whether it is recorded.

## Acceptance #3 — cheaper than it looks (user, 2026-08-08)

**It does NOT need the smoke volume, and it does not need 350 GB.** The condition
being proven is a *timing* window on a cold Pod — `/health` green before
`/wrapper/models/install` is routable — which has nothing to do with volume size or
with which weights are on it. A throwaway ~10 GB network volume and the smallest dep
in the catalogue reproduce it identically, for pennies, with no dependency on the
MPI-467 smoke volume `aghcuvg7nl` being free.

Recipe:

1. Create a small volume in any datacenter (10 GB is plenty).
2. Create a `__cpu__` Pod against it.
3. Poll `/health` and POST `/comfy/models/download/start` for one small model the
   **instant** it goes green — the window is roughly 0.2s wide, so do not wait for
   `/remote/comfy/status.ready`.
4. Expected: a warning TOAST — *"The remote engine isn't ready yet — install <model>
   again in a moment."* — and **no** Download Failed + REPORT ON GITHUB dialog.
   `logs/app.log` must still carry the real
   `remote install trigger failed for <dep>: wrapper install 404` line.
5. Delete the Pod and the throwaway volume.

## Why the MPI-467 run of 2026-08-08 produced no evidence

An SSE capture on `/comfy/downloads/stream` ran for the whole fill (96 deps, 12
models) and recorded **zero** `download:failed` and **zero** `transient` events. The
404 window did not occur: the run's first two CPU Pods were recycled by the boot
watchdog, and the third was already warm by the time the first install POSTed.

That is a condition that did not arise, NOT a passing test. Do not tick #3 off it.
