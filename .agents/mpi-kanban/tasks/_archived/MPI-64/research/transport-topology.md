# Transport Topology — RunPod Remote Engine

**Status:** Design decision record. Not implementation. Verified against source 2026-06-11.

---

## Decision

**Chosen topology: Express backend proxy for all HTTP, Express WS proxy for all JSON events, renderer WSS-direct for binary preview frames only.**

The desktop app's renderer (`comfyController.js`) talks to `localhost:3000` Express routes — the same address it talks to today for `/comfy/status`, `/comfy/start`, etc. Express adds a new forwarding layer that carries the wrapper token server-side and forwards to the RunPod proxy URL. The renderer never holds the wrapper token, never constructs a RunPod URL, and never opens a cross-origin connection (except the narrow WS binary-preview exception documented below).

---

## Why Backend Proxy

Three properties of the existing codebase force this choice:

1. **`save-generation` streaming is backend-owned.** `routes/projects.js:1324–1500` calls `streamDownload(comfyViewUrl, filePath)` directly. The `comfyViewUrl` is built from `ComfyUIController.serverAddress` in `commandExecutor.js:33–49`. If `serverAddress` pointed at the RunPod proxy, Express would need to attach the auth token when fetching that URL. That token attachment is already in Express under the proxy topology, so `save-generation` changes are a one-line URL rewrite with no new auth logic.

2. **The token must never reach renderer-accessible storage.** `js/core/storageKeys.js` enumerates only localStorage keys (verified: no safeStorage, no keytar, no electron-store). Storing the wrapper token anywhere the renderer reads would expose it. Under backend proxy the token lives only in Express memory (loaded from OS-keychain via `safeStorage` — see `secret-storage.md`) and is attached by Express on every outbound request.

3. **Renderer changes stay minimal.** `comfyController.js:40` hardcodes `serverAddress = "127.0.0.1:8188"`. Under backend proxy, the adapter swap changes this to `"127.0.0.1:3000"` (or a configurable Express-forwarded path prefix) and Express translates paths. No CORS headers, no `Authorization` header construction in renderer, no WSS certificate handling.

---

## Binary Preview Frame Exception

`comfyController.js:270–297` receives binary `ArrayBuffer` messages from the ComfyUI WebSocket, slices off an 8-byte header, wraps the remainder as a JPEG blob URL, and calls `onPreview`. This is the only renderer-side WS consumer of binary data.

**Problem:** Node.js `ws` proxying of binary WebSocket frames is straightforward, but the Express `http-proxy` / `ws` package adds latency and buffering that is undesirable for latent preview frames (they fire at ~5–10 fps during sampling and need low jitter to feel live). Additionally, Express WS proxy requires a full duplex relay; the renderer WS is long-lived and auto-reconnects on close.

**Decision:** The renderer opens a **direct authenticated WSS connection** to the RunPod proxy URL for the event channel. This is the single exception to the backend-proxy rule. The token is embedded as a query parameter in the WS upgrade URL (not a header, because browser `WebSocket` does not support custom headers). The upgrade is rejected by the wrapper if the token is absent or invalid (see `wrapper-api-contract.md` §WS Auth Gate).

**Why this is acceptable:**
- The token is transmitted over TLS (RunPod proxy is HTTPS/WSS).
- The token is not stored in localStorage, project files, or any persistent renderer state — it is fetched from Express via a new local-only endpoint (`GET /remote/ws-token`) immediately before opening the WS connection. The renderer holds it only in memory for the lifetime of the WS object.
- The WS URL is constructed by the renderer adapter (`remoteEngineClient.js`) only when remote mode is active, using the Pod ID and token retrieved from Express. The Pod ID is not secret.
- This mirrors the existing local pattern: the renderer already opens `ws://127.0.0.1:8188/ws?clientId=...` directly, so the shape is unchanged; only the host and the auth param change.

The renderer adapter fetches `GET /remote/ws-token` → receives `{ wsUrl, token }` → opens `new WebSocket(wsUrl)`. Express generates `wsUrl` using the stored Pod ID and token, returns it over the local loopback connection (no TLS required, no cross-origin), and does not log the token value.

---

## Full Topology Diagram

```
Renderer (comfyController.js / commandExecutor.js)
    │
    │  HTTP (localhost:3000) — all routes
    │  WS (localhost:3000)   — JSON events (text frames only, proxied)
    │  WSS (runpod proxy)    — binary preview frames only (renderer-direct, token in query)
    ▼
Express (routes/remoteProxy.js — new)
    │
    │  HTTPS + Bearer token — all forwarded requests
    │  WS relay             — JSON frames only
    ▼
RunPod HTTP Proxy  (https://[POD_ID]-8889.proxy.runpod.net)
    │
    ▼
Cubric Wrapper (Python, port 8889 inside Pod)
    │
    │  http://127.0.0.1:8188  (loopback, no auth needed inside Pod)
    ▼
ComfyUI (port 8188, NOT exposed publicly)
```

Port 8188 is **not** listed in the Pod's exposed ports. Only port 8889 (wrapper) is exposed through RunPod proxy. ComfyUI is reachable only from inside the Pod.

---

## Local-Coupling Inventory Trace

| # | Seam | How it routes under chosen topology | Auth point |
|---|------|-------------------------------------|-----------|
| 1 | Renderer talks to ComfyUI directly (`comfyController.js:40`, renderer fetch to `:8188/prompt`, renderer WS to `:8188/ws`) | In remote mode, `serverAddress` is set to `"127.0.0.1:3000"` and the adapter intercepts. HTTP prompt submit goes renderer → Express → RunPod proxy → wrapper → ComfyUI. WS JSON events go renderer → Express WS relay → wrapper WS → ComfyUI WS. | Express attaches `Authorization: Bearer <token>` on all outbound HTTP. WS relay upgrades with token in query. Renderer never holds token for HTTP. |
| 2 | Binary preview frames (8-byte header + JPEG ArrayBuffer, `comfyController.js:270–297`) | Renderer WSS-direct exception. Renderer opens `wss://[POD_ID]-8889.proxy.runpod.net/ws?clientId=...&token=<token>` after fetching ephemeral token from `GET /remote/ws-token` (Express loopback). Wrapper strips/validates token on upgrade. Binary frames transit RunPod TLS → arrive as `ArrayBuffer` in renderer → existing blob-URL path unchanged. | Wrapper rejects WS upgrade if token absent or invalid (HTTP 401 before upgrade completes). Token is in TLS-encrypted query string; not stored in renderer persistence. |
| 3 | JSON WS event types (`prompt_ack`, `preview`, `execution_cached`, `executing`, `executed`, `progress`, `progress_state`, `commandExecutor.js:779–881`) | Text frames flow through Express WS JSON relay (renderer ↔ Express ↔ wrapper). Wrapper re-emits ComfyUI JSON events verbatim (plus synthesized events — see item 4). `prompt_ack` is synthetic; wrapper emits it after forwarding the prompt to internal ComfyUI and receiving the `prompt_id` ack. | Relay connection is authenticated at upgrade time by Express (checks token it holds server-side). |
| 4 | Model-init readiness from stdout (`routes/comfy.js:66–77,115`, SSE `GET /comfy/events/stream`, `commandExecutor.js:768`) | Express exposes `GET /comfy/events/stream` unchanged for local mode. In remote mode, the same SSE endpoint is served by Express but data comes from a wrapper SSE relay (`GET /wrapper/events/stream` on the Pod, auth'd). Wrapper synthesizes `comfy:model-initializing` and `comfy:model-init-complete` SSE events by monitoring ComfyUI's `GET /object_info` availability and the first `executing` WS event after a prompt post. See `wrapper-api-contract.md` §Readiness & Model-Init Signal. | Express forwards SSE over the authenticated HTTP channel. The `commandExecutor` SSE subscription path (`new EventSource('/comfy/events/stream')`) is unchanged. |
| 5 | Image/mask upload via ComfyUI `POST /upload/image`; video/audio path injection; trim temp files; `.latent` staging (`comfyController.js:539–566`, `commandExecutor.js:117–172`, `routes/comfy.js:170–195`) | Image/mask upload: renderer calls `POST /upload/image` → Express proxies to wrapper → wrapper calls internal `POST /upload/image` on ComfyUI. Video/audio: renderer can no longer inject absolute local paths. New Express route `POST /remote/upload/media` accepts a local file path, streams it to the wrapper `POST /wrapper/upload/media`, wrapper writes to `/workspace/comfyui/input/`. Trim flow: trim runs locally via existing `POST /api/video/trim-input` (unchanged), then the resulting temp file is uploaded via `POST /remote/upload/media`. Latent staging: Express `POST /comfy/stage-preview-latent` is intercepted in remote mode; instead of copying locally it calls `POST /wrapper/upload/latent` with the latent file bytes, wrapper writes to ComfyUI `input/`. | All wrapper upload endpoints require `Authorization: Bearer <token>`. Express attaches it. |
| 6 | Output capture: `executed` → view URLs built from `ComfyUIController.serverAddress` → `POST /project/save-generation` → `streamDownload(comfyViewUrl, filePath)` (`commandExecutor.js:33–49`, `routes/projects.js:1324–1500`) | View URLs are built with `serverAddress = "127.0.0.1:3000"` pointing at Express. Express `GET /proxy/view` route accepts the same query params (`filename`, `type`, `subfolder`, etc.), attaches the auth token, and streams the response from `https://[POD_ID]-8889.proxy.runpod.net/view?...`. `save-generation` calls `streamDownload` against `http://127.0.0.1:3000/proxy/view?...` — same host as today, one new Express route. | Token attached by Express on the outbound request. View URLs that reach the renderer (`commandExecutor.js:33–49`) are localhost Express URLs — unauthenticated locally by design, authenticated by Express when forwarding. Wrapper `/view` rejects requests without token. |
| 7 | Interrupt/queue ops renderer-direct (`POST /interrupt`, `POST /queue`, `comfyController.js:150–221`) | `comfyController.js` calls `http://${serverAddress}/interrupt` and `/queue`. With `serverAddress` pointing at Express, these become Express proxy routes (`POST /proxy/interrupt`, `POST /proxy/queue`) that forward to the wrapper with auth. Wrapper forwards to internal ComfyUI. | Express attaches token. Wrapper requires token on all non-health routes. |

Items 8–10 are architecture concerns that inform topology constraints but are not transport routing decisions:

- **Item 8 (boot gate):** Existing boot path calls `/comfy/status`, `/comfy/start`, etc. In remote mode, `shell.js` takes a parallel gate path (handled in app integration phase) that calls `/remote/status` and `/remote/ready` instead. Transport: standard Express HTTP, no auth issue.
- **Item 9 (model check):** `POST /comfy/models/check` is intercepted in remote mode by Express, which calls `GET /wrapper/models/status` on the wrapper. Standard HTTPS + token.
- **Item 10 (no secret store):** Resolved by the topology choice itself — token never enters renderer-accessible storage.

---

## Express Proxy Route Summary

New routes added to Express in `routes/remoteProxy.js` (Phase 2 App Integration):

| Express route | Forwards to | Purpose |
|---|---|---|
| `POST /proxy/prompt` | `POST /wrapper/prompt` | Workflow submit |
| `GET /proxy/view` | `GET /wrapper/view` | Output fetch (auth'd) |
| `POST /proxy/interrupt` | `POST /wrapper/interrupt` | Interrupt running job |
| `POST /proxy/queue` | `POST /wrapper/queue` | Clear / delete queue item |
| `POST /upload/image` (remote mode intercept) | `POST /wrapper/upload/image` | Image/mask upload |
| `POST /remote/upload/media` | `POST /wrapper/upload/media` | Video/audio upload |
| `POST /comfy/stage-preview-latent` (remote mode intercept) | `POST /wrapper/upload/latent` | Latent staging |
| `GET /comfy/events/stream` (remote mode intercept) | `GET /wrapper/events/stream` SSE relay | Model-init SSE |
| `GET /remote/ws-token` | Local only — returns `{ wsUrl, token }` | WS bootstrap for renderer |
| `GET /remote/status` | `GET /wrapper/health` | Pod readiness polling |
| `POST /comfy/models/check` (remote mode intercept) | `GET /wrapper/models/status` | Model availability on volume |

"Remote mode intercept" means the Express route checks `state.remoteEngineActive` (or equivalent backend flag) and either executes the existing local handler or forwards to the wrapper. Local mode behavior is byte-identical to today.

---

## No-Unauthenticated-Endpoint Guarantee

- ComfyUI port 8188 is not exposed in the Pod template. Unreachable from the internet.
- Wrapper port 8889 requires `Authorization: Bearer <token>` on all routes except `GET /wrapper/health` (which returns only `{ ready: boolean }` — no sensitive data).
- The WS upgrade on port 8889 requires `?token=<token>` in the query string; the wrapper rejects the upgrade with HTTP 401 if absent or invalid.
- The renderer-accessible `GET /remote/ws-token` returns the WS URL and a short-lived token over the local loopback (no network exposure). Express does not log the token value.
- View URLs that reach the renderer are `http://127.0.0.1:3000/proxy/view?...` — Express localhost, not RunPod URLs. Token is never embedded in renderer-visible URLs.

---

## Verify-Gate Checklist

- [x] Every inventory item 1–7 is traced through the topology in the table above.
- [x] No unauthenticated remote endpoint: ComfyUI not exposed; wrapper requires token on all non-health HTTP routes; wrapper requires token on WS upgrade.
- [x] Token is not in renderer-accessible storage: token lives in Express memory (loaded from OS keychain via `safeStorage`); renderer receives only an ephemeral `wsUrl` for the WS exception, over local loopback, held only in memory for the WS object lifetime.
- [x] `save-generation` streaming continues to work against localhost URLs (item 6 row).
- [x] `comfyController.js` changes are a `serverAddress` swap + adapter intercept, not CORS/auth-header work in renderer (exception: WS URL construction in remote adapter).
- [x] Binary preview frames (item 2) are carried through the WSS-direct exception with TLS protection and token gating at upgrade.
- [x] Model-init SSE (item 4) is relayed through the Express SSE proxy; `commandExecutor.js` SSE subscription path is unchanged.
- [x] Local mode behavior is unaffected: all intercepted Express routes fall through to existing handlers when `remoteEngineActive` is false.
