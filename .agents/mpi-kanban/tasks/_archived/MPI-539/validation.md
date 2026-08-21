# MPI-539 — validation

**Verdict: PASSED live, 2026-08-11, by Fabio on his own machine and his own Pod.**
The card's own gate was "connect a download-only Pod, install onto it, kill the Pod,
confirm the Model Library returns to local truth with no frozen bar and no queued
install left pointing at nothing." All three parts observed.

## The drill

App restarted (a `routes/` change does not survive a renderer reload), CPU download
Pod connected, install started, second install queued behind it, Pod stopped from the
RunPod console while the first was still downloading.

## Observed

| Failure | Evidence |
|---|---|
| 4 — deps abandoned silently | `remote target inactive (remote inactive); failing 3 outstanding dep(s)` |
| 5 — model job never terminated | Card reached a real end state: **"Remote engine disconnected before the install finished."** Before this fix the card froze at N% with no reason and no Retry. |
| 5 — remote progress painting local truth | Fabio: *"The model library did update back to my local installation. That's proven."* |
| 5 — the dialog | Fixed after he hit it: it came up as **Download Failed / Report on GitHub**, now a HEADS UP toast. |
| 6 — queued install retargeting | **"SDXL NSFW was queued for the remote Pod, which is no longer connected — install cancelled."** It did NOT start downloading to his local disk. |

Detection latency, measured from `app.log`, not estimated:

```
18:05:57.500  remote install SSE closed (error); 3 dep(s) outstanding
18:06:00.038  remote Pod 0k532d4zig23ue is EXITED — self-healing to local
18:06:06.438  remote target inactive; failing 3 outstanding dep(s)
```

**9 seconds.** The 90s stall watchdog never had to fire. The window where the UI still
showed a live bar is RunPod stopping the container before the socket dies — not ours.
Fabio: *"a little delay, it's fine, mate."*

Bytes survive: on reconnect the volume's partials were credited (99% on disk, and 25% /
26% for the two cancelled ones), so an abandoned install costs no re-download.

## Automated

`tests/download-mode-pod-guards.test.cjs` — 5 tests, every guard mutation-checked
(removing it fails the test with the intended message). Full suite 560/560.

## Residual — NOT covered by the live run

Failures 1–3 (the `getEngine()` / `commandExecutor` / `_ensureRemoteHotStore` guards)
were never re-exercised live, because no generation was dispatched while a download-only
Pod was connected during any of today's runs. They rest on the original incident's
two-sided evidence (Pod container log + app log, recorded in the card) plus the
mutation-checked unit tests. The scenario is worth one deliberate pass sometime:
start a long local generation, connect a `__cpu__` Pod, confirm no staging is attempted
and remote mode is not torn down.

## Not this card

- The Pod OOM is **MPI-541**, and its hf_xet theory is now disproven — see that card.
- The disk-space message is unfixed and has TWO confirmed instances in today's log,
  one local and one remote. Next task, carried in the handoff.
