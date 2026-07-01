# MPI-160 — validation (min system-RAM floor)

## Built 2026-07-01 (branch RunPod). Files:
- `js/core/storage.js` — `minRamGb` field + `normalizeMinRamGb` (default 0, clamp 2000).
- `js/components/.../MpiSettings/MpiSettings.js`:
  - "Min system RAM (GB)" `MpiInput` under the GPU picker (real DC + non-CPU only);
    writes `state.runpodConfig.minRamGb`. Re-renders pickers on CPU↔GPU boundary.
  - Connect body sends `minMemoryInGb` (skipped for `__cpu__` / 0).
  - `ramFloorMissed` branch → honest message; auto-retry ON → wait, OFF → stop.
- `js/components/.../MpiSettings/MpiSettings.css` — `.mpi-settings__minram-row`.
- `routes/remoteProxy.js` — `_createPodInternal` sets `spec.minMemoryInGb`; when set,
  creates via GraphQL (proven path); create+reconnect routes read/pass it +
  surface `ramFloorMissed`.
- `routes/runpodRemote.js` — `createPodGraphql` maps `spec.minMemoryInGb` → input.

## Verified pre-test
- node --check + ESLint clean on all edited files.
- App boots clean (no errors from changes in app.log).
- API-honors-minMemoryInGb already PROVEN live (research/api-probe ADDENDUM: 200GB →
  SUPPLY_CONSTRAINT, 90/16/none → create).

## USER TEST (one-go)
1. Settings → RunPod → pick EU-RO-1 → pick RTX 5090. A "Min system RAM (GB)" input
   appears under the GPU picker.
2. Set it to **90** → Connect. Expect: lands a ≥90GB host (check status-bar RAM /
   pod specs show ~92GB). Generate to confirm it's a real pod.
3. Set it to **200** (impossible) → Connect. Expect (auto-retry OFF): a clear message
   "No host with ≥200 GB system RAM for <card> in EU-RO-1 right now…", NO pod created,
   no bill. With auto-retry ON: it enters the wait loop instead.
4. Set it to **0** (or clear) → Connect works exactly as before (no floor).
5. Pick "No GPU — download only" → the RAM input disappears (not applicable to CPU).

## Notes / known
- High-RAM creates route through GraphQL (REST POST /pods was NOT proven to accept
  minMemoryInGb). If a future card only deploys via REST enum AND needs a floor, that
  combination is untested — flag if it comes up.
