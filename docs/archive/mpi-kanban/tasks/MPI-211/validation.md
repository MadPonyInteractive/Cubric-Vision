# MPI-211 Validation

All 3 cosmetic console-noise issues fixed 2026-07-07. Fixes are logic-verified
(syntax + ordering self-check); each needs one live console-watch to confirm the
red row / warn is gone.

## Fix 1 — blob-404 on Stop
- **File:** [js/services/activeGenerations.js](../../../../js/services/activeGenerations.js) `end()`
- **Change:** `URL.revokeObjectURL` deferred via `setTimeout(…,0)` so the store
  broadcast derenders the placeholder tile + queue-panel thumbnail (both hold the
  blob as an `<img>` src synchronously) BEFORE the blob dies.
- **Self-check:** scratchpad `mpi211-order.mjs` → PASS (derender precedes revoke).
- **Live check:** connect remote, start a video gen, press Stop mid-preview.
  Console must NOT show `GET blob:… net::ERR_FILE_NOT_FOUND`.

## Fix 2 — /comfy/models/check 502 in Pod boot window
- **File:** [routes/comfy.js](../../../../routes/comfy.js) remote branch of `/comfy/models/check`
- **Change:** boot-window failure (`wrapper status 404` / ECONNREFUSED / fetch
  failed) now answers `200 {success:true, results:{}, pending:true}` instead of a
  hard 502. Empty `results:{}` → renderer loop no-ops → models keep prior installed
  state. Real failures still 502.
- **Live check:** CONNECT to a cold Pod. In the ~35s boot window the console must
  NOT show `models/check 502 (Bad Gateway)`; first post-ready check reconciles clean.

## Fix 3 — /remote/ws-token 409 when remote stopped
- **Files:** [routes/remoteProxyForward.js](../../../../routes/remoteProxyForward.js) `/remote/ws-token`,
  [js/services/remoteEngineClient.js](../../../../js/services/remoteEngineClient.js) refresh()
- **Change:** inactive-remote now answers `200 {wsBase:null, token:null, inactive:true}`
  instead of `409 remote_inactive` — kills the browser-native red network row and the
  client's scary warn. Only JS caller of ws-token; no other consumer relied on the 409.
- **Live check:** LOCAL·OFFLINE landing (remote stopped, no Pod). Console must NOT show
  `ws-token 409 (Conflict)` nor `[remoteEngine] WS token fetch failed`.

## Status
Logic-verified, NOT live-verified. Move to done after the 3 console-watches above pass.
