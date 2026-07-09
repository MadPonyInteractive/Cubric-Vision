# MPI-120 — Current offline behavior (investigated 2026-06-20)

Ground-truth audit before designing the popup. Citations are `file:line`.

## 1. Model/engine downloads
- NDH `DownloaderHelper` built in `routes/downloadManager.js:241-244` with NO custom
  opts → defaults: `retry: false`, `timeout: -1` (no socket timeout).
- `ENOTFOUND` (DNS fail): NDH emits `'error'` FAST → `download:failed` SSE
  (`routes/downloadManager.js:210-216`, broadcast `355-359`, escalated `998-999`)
  → frontend `js/services/downloadService.js:266-322` → `ui:error` **dialog**
  (GitHub-report). Works, but message is raw (`getaddrinfo ENOTFOUND huggingface.co`)
  and it's a bug-report dialog, wrong surface for an expected offline state.
- TCP black-hole (DNS resolves, server unreachable): **SILENT HANG** — `timeout: -1`,
  download stuck at 0% forever.

## 2. RunPod connect
- Connect button entry: `MpiSettings.js:689-700` and boot auto-connect `shell.js:601-621`
  → `POST /remote/pod/create` (`remoteProxy.js:703`) or `/remote/pod/reconnect` (`:744`).
- Those routes use `_rest`/`_safeFetch` (`runpodRemote.js:43-57`, no timeout) → throws
  fast on `ENOTFOUND` → `_withKey` catch returns 502 `runpod_unreachable`
  (`runpodRemote.js:207-212`). **Fast-fail. Good.** But no offline-specific UX.
- `wrapperFetch` (`routes/remoteModels.js:81-125`): `retries:15`, `retryDelayMs:2000`
  → 16×2s. `catch(err)` retries ALL thrown errors incl. `ENOTFOUND`/`ENETUNREACH`
  → **~32s hang** before failure surfaces. Conflates "transient proxy 5xx" (retry OK)
  with "host offline" (retry pointless). Affects every post-connect wrapper call:
  model check, install, uninstall, upload, `_evaluatePodHealth`.
- `waitForWrapperReady` (`routes/remoteEngine.js:100-115`): polls `/health`
  `intervalMs:5000`, `timeoutMs:240000` (4 min), swallows fetch errors (`catch {}`)
  → **up to 4-min silent hang** offline. Reachable via reconnect-recreate fallback
  (`remoteProxy.js:793`).

## 3. Existing connectivity handling
- **NONE.** No `navigator.onLine`, no online/offline listeners, no network-error-code
  detection, no ping/HEAD helper anywhere in `js/` or `routes/`.

## 4. Pre-flight insertion points
- Download start (renderer): `js/services/downloadService.js:30-56`, fetch at `:41`.
  Backend handler: `routes/downloadManager.js:419`.
- RunPod activate (renderer): `MpiSettings.js:689` (Settings button) + `shell.js:601`
  (boot auto-connect). Backend: `remoteProxy.js:703` / `:744`.

## Silent-hang flags
1. `downloadManager.js:241-244` — `timeout:-1`, TCP stall = infinite 0% hang.
2. `remoteModels.js:95-123` — `wrapperFetch` retries offline errors = 32s hang.
3. `remoteEngine.js:100-115` — `waitForWrapperReady` = 4-min silent hang offline.
