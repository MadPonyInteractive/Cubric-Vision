# MPI-80 Validation — Session cost feedback

**Status:** PASSED — live-verified by user 2026-06-15.

## What was validated

Project-page bottom-left "last session" slot now shows a live **current session**
duration + cost while cloud-connected, replacing the static "last session" relative
time. Falls back to "last session" when local/disconnected.

## Live test (RunPod L4 Pod, EU-RO-1)

1. Enabled RunPod remote engine, connected to an L4 Pod.
2. Bottom-left slot label flipped `last session` → `current session`.
3. Value rendered `0min/$0.01` then climbed `1min/$0.01` on the 5s feed tick —
   matched the RunPod console Telemetry (Uptime 55s, account billing).
4. After the seconds-format follow-up: slot read `30s/$0.00` and ticked seconds
   from connect (no longer stuck at `0min`).

User confirmation: *"this is verified."*

## Coverage

- Duration source: `lastStartedAt` (REST Pod field) → `now − lastStartedAt`.
  Billing-true; survives container OOM restart (lastStartedAt only moves on a real
  Pod start/resume).
- Cost source: `costPerHr` (REST Pod field, real billed rate).
- Live refresh: connection feed re-fetches `/remote/pod/specs` + re-emits
  `remote:connection` every connected tick (5s), not just on the connect edge.
- Format ladder: `<60s` → `Ns`; `<60min` → `Nmin`; else `Nh Mm`; cost `$X.XX`.

## Bugs found + fixed during validation

1. Built on `runtime.uptimeInSeconds` (GraphQL-only) → always null on the REST API
   → slot never left "last session". Fixed: read `lastStartedAt` + `costPerHr`.
2. Connection feed fetched specs only on the connect EDGE → badge painted once and
   froze. Fixed: per-tick re-fetch/re-emit.
3. Sub-minute uptime showed `0min` → added seconds to the format ladder.

## Files

- `routes/remoteProxy.js` — `/remote/pod/specs` payload (landed earlier in HEAD).
- `js/shell.js` — per-tick specs re-fetch + re-emit (commit `1d39aa9`).
- `js/shell/heroStats.js` — render + format + label flip (commit `1d39aa9`).
- `index.html` — session-stat label id (commit `1d39aa9`).
