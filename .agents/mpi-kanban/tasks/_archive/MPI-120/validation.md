# MPI-120 Validation

## What shipped
Offline detection + fast-fail across the two network flows, plus the three
silent-hang bugs the investigation found.

New shared helper `routes/netCheck.js`:
- `isNetworkDownError(err)` — classifies a thrown fetch/socket error as
  network-down (checks `err.code` AND `err.cause.code` — Node global fetch wraps
  the socket code in `cause.code`). Codes: ENOTFOUND, EAI_AGAIN, ENETUNREACH,
  EHOSTUNREACH, ECONNREFUSED, ECONNRESET, ETIMEDOUT.
- `checkOnline({timeoutMs=4000})` — real internet probe: HEAD huggingface.co
  then api.runpod.io, short timeout, never throws. Returns false only on
  network-down/abort.

Wiring:
1. **Pre-flight before downloads** — `routes/downloadManager.js` `/comfy/models/download/start`:
   `checkOnline()` → 503 `{offline:true}` if offline. Renderer
   `js/services/downloadService.js` → `ui:warning` toast (not error dialog).
2. **Pre-flight before RunPod connect** — `routes/remoteProxy.js`
   `/remote/pod/create` + `/remote/pod/reconnect`: `checkOnline()` → 503
   `{offline:true}`. Renderer: `MpiSettings.js` (warning toast + hint), `shell.js`
   boot auto-connect (StatusBar warning, stays local, no modal).
3. **wrapperFetch fast-fail** — `routes/remoteModels.js`: network-down error now
   throws `offline` immediately instead of retrying 16× (~32s). Transient proxy
   5xx still retries (unchanged).
4. **waitForWrapperReady fast-fail** — `routes/remoteEngine.js`: bails on
   network-down instead of polling the full 4-min budget. Cold-start tolerance
   (proxy reachable but warming) unchanged.
5. **Download TCP-stall timeout** — `routes/downloadManager.js`: NDH `timeout: 30000`
   (was -1 = infinite). Socket inactivity timeout, NOT a total-download cap
   (verified against NDH source: maps to http(s)RequestOptions.timeout).

## Automated checks DONE (this session)
- All 5 backend modules `require()` clean (no syntax / circular-require error).
- `isNetworkDownError` unit: cause.code ENOTFOUND→true, direct ENOTFOUND→true,
  HTTP-503-string→false, ECONNREFUSED→true, null→false. All pass.
- `checkOnline()` live (online): true in ~109ms (no perceptible latency online).
- eslint on the 3 frontend files: clean, 0 warnings.

## Live tests DEFERRED to user (need a real offline host)
Run the app, then disconnect the network (Wi-Fi off / pull ethernet / airplane mode):

1. **Download offline:** Settings → install any model → expect a "You're offline"
   **warning toast** within ~4s (NOT the GitHub-report error dialog, NOT a job
   stuck at 0%).
2. **RunPod Connect offline (Settings):** Settings → RunPod → Connect → expect
   the engine hint + warning toast "You're offline", button back to "Connect",
   within ~4s (NOT a ~32s hang).
3. **RunPod auto-connect offline (boot):** with a saved warm Pod + network off,
   launch the app → expect a StatusBar warning "You're offline — staying local",
   app stays usable locally (NOT a long hang / confusing error).
4. **TCP-stall (optional, harder to repro):** point a dep URL at a black-hole
   host (firewall-drop) → download should FAIL within ~30s, not hang at 0%.
5. **Reconnect when back online:** turn network back on → Connect from Settings
   succeeds normally (probe adds ~100ms, imperceptible).

## Notes / decisions
- Detection = backend HEAD probe (not navigator.onLine — reports LAN not internet).
  Single backend gate; both renderer callers (Settings + boot) get it free.
- Offline = expected/actionable → toast/warning per `feedback_error_dialog_vs_toast`.
- Scope confirmed by user: all 4 fixes in one card (preflight+toast, wrapperFetch,
  TCP-stall, waitForWrapperReady). No separate follow-up cards.
- Branch: stayed on RunPod (per `project_runpod_branch_v110`).
