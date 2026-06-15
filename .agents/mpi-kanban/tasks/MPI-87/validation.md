# MPI-87 Validation

## Verified by user — 2026-06-15

User connected a RunPod Pod and confirmed the connect % shows up in the project-page
GPU slot during the connecting phase. Number climbs as expected. User noted it is
"obviously not 100% accurate" — expected and accepted: it is an elapsed-time estimate,
not a real layer count (RunPod's public API exposes no image-pull/extract progress;
verdict B, see brief.md / plan.md).

## What was checked

- [x] Percentage renders in `#heroStatGpu` while `phase === 'connecting'`.
- [x] Footer `#heroStatEngine` keeps `connecting · offline` (no duplicate "connecting" word).
- [x] Estimate climbs over the connect window — accuracy not exact, accepted by design.

## Notes / future tuning

- `_CONNECT_EST_MS = 240000` (4 min) is a tuned guess. Can be revisited if real pulls
  consistently run shorter/longer; the number is explicitly an estimate.
- Both connect paths emit: boot auto-connect (`_pollRemoteReady`, shell.js) and manual
  Settings connect (`_pollEngineReady`, MpiSettings.js).
