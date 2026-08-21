# MPI-501 — restart-comfy must never land on a running queue

**Umbrella:** MPI-467 (the 1.4 smoke umbrella). **This card blocks its clean evidence.**

## The defect

`js/services/comfyController.js:543` restarts the remote ComfyUI **unconditionally** when
`state.remoteComfyNeedsRestart` is set. It never reads the queue, so `proc.terminate()` can land
on a prompt mid-sample. The dispatch that TRIGGERED the gate is retried right after, so the user
who caused it is covered — **any other in-flight prompt is destroyed with no error, no toast and
no log line.** User-facing cost: a queued batch silently loses work.

## Why it is provably a requested restart, not a crash

`wrapper.py` `ComfyManager.restart()` has exactly ONE caller — the `POST /wrapper/restart-comfy`
route (`wrapper.py:907`). `_supervise` answers an unexpected ComfyUI exit with `os._exit(1)`, and
`start.sh` ends in `exec python -m uvicorn` with no respawn, so a genuine crash takes the whole
container down. Both times this fired, the Pod lived and later ops passed.

## What it has cost — twice, the same op

| matrix | op | symptom |
|---|---|---|
| 2nd, 2026-08-08 ~19:55Z | `minimax-h3/t2v_ms` | polled a dead prompt_id for 15 min, reported "timed out", sent a whole session hunting a model bug that did not exist |
| 3rd, 2026-08-09 03:22Z | `minimax-h3/t2v_ms` | orphaned at 169s; the runner's new detection named the mechanism in ~30s |

The op is healthy — PROVEN at 216s on the same graph and Pod, and its sibling `i2v_ms` passed at
132s in the same run.

## Caller narrowed to the renderer (3rd matrix)

The server-side caller `routes/remoteModels.js:862` is **excluded by evidence**: it only fires
when `out.installed` is non-empty, and `app.log` records `03:00:59 [runpod] universal nodes: 7/7
already on volume`. So it came through `/proxy/restart-comfy` — `comfyController.js:543` or the
dev radial at `js/shell/navigation.js:268`. The renderer was demonstrably live on the engine path
for the whole run: its own `commandExecutor.js:519` was POSTing `/remote/hot-store/ensure` and
taking 409s. Transcript order matches the chain exactly — `hot-store: 3/3 file(s) on Pod disk`
then the orphan.

## Agreed fix (with the user, 2026-08-09)

Drain-wait on `GET /proxy/queue` (already a plain passthrough of ComfyUI's
`{queue_running, queue_pending}`) **before** POSTing the restart. The gate runs BEFORE our own
dispatch is queued, so waiting cannot deadlock. On timeout, **refuse loudly** — surface an
actionable message and throw — rather than restart and destroy someone else's prompt. Cover the
`navigation.js` radial too: a restart must never land on a running queue regardless of who asked.

**Detection half is already shipped** (MPI-467): an orphaned prompt now fails in ~30s naming this
mechanism instead of timing out at 15 minutes.
