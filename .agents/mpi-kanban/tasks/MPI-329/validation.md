# MPI-329 Validation

## Proven (live, 4090 pod, direct-8188)
- Volume vs disk switch: 80.4s -> 9.0s (Krea2, evicted reload). Cold 76.5s -> 20.7s.
- Krea2<->Qwen swap cycle, both disk-staged: 3-19s per switch.
- MPI-193 dedup working (0 dup packs). Pinned 231GB confirms cache starvation.

## Unit-verified (this session)
- `_clampVolumeDisk` (dynamic disk clamp): `tests/pod-volume-disk.test.cjs` 10/10
  (mirror+5 in-band, floor 100, ceiling 600, garbage→200 fallback).
- ESLint clean on all four touched frontend/backend files.
- Module loads (`node -e require routes/remotePodLifecycle.js` OK).

## NOT yet validated — LIVE (needs app RESTART + a fresh dev pod, user-gated: bills a Pod)
1. Dynamic disk: fresh volume Pod → confirm container disk = volume size + 5 (log line
   "container disk mirrored to volume: NGB"; RunPod Pod shows N GB disk).
2. Fast switch: restart app → connect fresh dev pod (EU-RO-1 vol 9t3awufudk) → generate on
   model A, switch to model B → observe ~9s switch (not 80s) + "Preparing…" toast on the
   first stage only. Repeat A↔B → stays disk-fast.
3. Stage-on-connect toggle: enable it in RunPod settings → connect → observe the "Warming
   the cloud engine — staging N models…" toast + all installed models staged before first
   gen → first gen is instant (no preflight block). Toggle OFF → lazy path (toast only on
   first gen of a model).
4. Toggle persists across app restart (storage round-trip through normalizeRunpodConfig).

Verify mode: user-ux (real app switch between two image models + the new toggle).
