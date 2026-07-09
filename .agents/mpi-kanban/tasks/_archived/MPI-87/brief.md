# MPI-87 — Surface Pod image-pull / extraction progress during connect

> Promoted from MPI-64 OPEN-ITEMS L7. User-requested 2026-06-15. A real UX feature, not validation.

## Problem

First connect on a new image tag pulls + extracts the ~multi-GB Docker image onto the RunPod host. The
RunPod console shows real progress:

```
Download complete, waiting for extraction…
1/14 layers completed · 1 extracting · 40.48%
```

The app shows only a **flat ETA/spinner** for this entire window. On a slow first pull the user has nothing
to watch → thinks the app hung → may kill it (and lose a metered Pod mid-boot). Ties to MPI-64 L3
(connect-ETA copy) and G6 (first-pull 504).

## Open investigation (do this FIRST — not yet pinned)

The console's pull progress is RunPod's INFRA layer (their orchestrator pulling the image onto the host).
Is that % reachable by us?

- **If exposed via the RunPod GraphQL/REST Pod-status API** (a field on the Pod object — e.g.
  `runtime` / container state / `lastStatusChange` / a pull-progress field): the app's existing connect
  poller (the `/remote/comfy/status` + RunPod pod-status path) can read it and render a real progress bar.
- **If console-only** (only in the console's own websocket, not the public API): fall back to richer STAGED
  copy ("Pulling the engine image — first time on this GPU, several minutes…") instead of a flat spinner.

Pin which one BEFORE building any UI. Check the RunPod API Pod object fields + whatever
`routes/runpodRemote.js` already fetches.

## Likely files

- `routes/runpodRemote.js` / `routes/remoteProxy.js` — the RunPod pod-status fetch; add the pull/extract field
  if the API exposes it.
- The connect feed / Settings connect path (shell.js + MpiSettings.js) — render the progress bar / staged copy.
- The existing connect ETA copy (MPI-64 L3) is the fallback surface if the % isn't available.

## Verify

- During a real first-pull on a fresh image tag: the app shows live pull/extract progress (if the API exposes
  it) OR at minimum clear staged "pulling image" copy — instead of a flat spinner that reads as a hang.

## Related

- MPI-64 L3 (connect ETA first-boot vs warm-resume copy) — same surface, complementary.
- MPI-64 G6 (first-connect-on-new-tag 504 — image pull > 300s timeout).
- MPI-86 (cancel during connect) — both are "the long-first-connect UX" cluster.
