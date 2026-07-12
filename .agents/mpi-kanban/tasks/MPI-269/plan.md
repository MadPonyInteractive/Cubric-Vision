# MPI-269 — Unified latent-preview bus (local + remote), engine-tagged

**Owner:** a SEPARATE session (isolated from MPI-259 Apps work). Standalone.

## Goal

One system that ingests latent-preview frames from BOTH engines — local ComfyUI WS and the
remote Pod WS — normalizes them, and emits a **clean, correctly-attributed, engine-tagged event**
any component can subscribe to. After this lands, showing live latents anywhere (gallery card,
app result pane, a future surface) = subscribe to one event, no per-consumer plumbing, no races.

Concrete acceptance: the MPI-259 SDXL-4K app's result pane shows live latents continuously
through a MULTI-SAMPLER single-prompt run (SDXL KSampler → PiD SamplerCustom) without going
broken at the stage-1→stage-2 boundary, and NEVER shows a different generation's latent.

## Why (the two observed bugs — 2026-07-12, MPI-259 SDXL-4K live run)

1. **App result pane stops showing latents after the stage-1→stage-2 sampler switch** — keeps the
   last stage-1 frame, which renders broken (`GET blob:… ERR_FILE_NOT_FOUND`) once revoked.
2. **Gallery card briefly showed the PREVIOUS generation's latent**, then switched to the current
   gen's latent a stage later. Mis-attribution across a gen boundary.

Both are attribution/lifecycle bugs in how binary preview frames get routed to a generation.

## Current plumbing (verified this session — the raw material)

The pipe already exists but is fragile:

- **Ingest (both engines share this):** `comfyController.connect()` sets `_ws.onmessage`
  (`js/services/comfyController.js:677` and `:706`). `binaryType='arraybuffer'`. A binary frame →
  `new Blob([_stripPreviewHeader(data)],{type:'image/jpeg'})` → `URL.createObjectURL` →
  `_routeMessage({ type:'preview', url })`. `_stripPreviewHeader` at `:36`.
  - Remote engine uses the proxy/renderer-direct WSS (`remoteEngineClient.wsUrl(clientId)`,
    `js/services/remoteEngineClient.js:195`); local uses `ws://…/ws`. Same onmessage handler, so
    remote + local ALREADY converge here — but nothing TAGS which engine a frame came from.
- **Route:** `_routeMessage` (`comfyController.js:~640`). A binary `preview` msg has **no
  `prompt_id`**, so it is routed to `this._activePromptId`'s listener (`:668`,
  `activeListener?.(msg)`). ⇐ **RACE #1**: `_activePromptId` is a single mutable pointer; at a
  gen/stage boundary an early frame of gen B can be attributed to gen A (or vice-versa) → bug #2.
- **Per-prompt handler:** `commandExecutor.js:1647` `if (msg.type==='preview'){ emitSamplingStart();
  exec.onPreview?.(msg.url) }`. `VHS_latentpreview` (`:1656`) → `onPreviewReset` (video only).
- **Fan-out:** `generationService.js:738` `exec.onPreview = url => { … callbacks.onPreview?.(url) }`
  → `activeGenerations.setPreview(id,url)` (`activeGenerations.js:76`) → sets
  `entry.latestPreviewUrl` + `entry.placeholderGroup.latestPreviewUrl` → `Events.emit(
  'generation:preview', { id, url })`.
- **Consumers today:** gallery placeholder card (reads `placeholderGroup.latestPreviewUrl` via the
  store re-render) and MpiBaseApp app pane (`MpiBaseApp.js:166` subscribes to `generation:preview`,
  matches `activeGenerations.get(id).tempId === _myTempId`, paints raw blob via `_paintResult`).
- **Blob lifecycle:** old preview blobs are NOT revoked mid-run; only the final one is revoked on
  `activeGenerations.end()` (`:105`, deferred one tick — MPI-211). No per-frame revoke → memory
  grows during a run (minor), and a consumer holding an OLD frame url shows broken once end() revokes.

## The event contract to build

Emit a normalized, engine-tagged preview event. Proposed shape (name/fields open, keep additive):

```
Events.emit('preview:frame', {
  engine: 'local' | 'remote',   // NEW — which engine produced it
  promptId,                     // the ComfyUI prompt this frame belongs to (see attribution below)
  generationId,                 // resolved regId (activeGenerations id) when known, else null
  url,                          // object URL for the jpeg blob
  seq,                          // monotonic frame counter per (engine,promptId) — lets a late
                                //   frame be dropped if a newer one already painted
})
```

Keep the existing `generation:preview { id, url }` as a thin compatibility shim (derive it from
`preview:frame` where `generationId` resolves) so nothing breaks in one shot — migrate consumers,
then retire.

## Attribution fix (the core of it)

The binary frame has no prompt_id, so `_activePromptId` is used. Harden it:

- Bind each preview frame to the prompt that is ACTUALLY executing right now, not a stale pointer.
  ComfyUI sends `executing { node, prompt_id }` / `execution_start { prompt_id }` JSON messages
  interleaved with the binary frames — track the **last executing prompt_id per socket** and stamp
  binary frames with THAT, updating it on every `executing`/`execution_start`. This closes RACE #1
  (a frame is attributed to whatever prompt the server says is running, not to whatever we last
  dispatched).
- Tag `engine` at the ingest site: the local onmessage stamps `'local'`, the remote/proxy path
  stamps `'remote'`. If both handlers are the same closure, thread the engine in from `connect()`
  (it already knows `_alwaysLocal` / `remoteEngineClient.isRemote()`).
- Resolve `generationId` from promptId via activeGenerations (entries carry `promptId` — set at
  ack). If unresolved (frame arrived before ack), buffer briefly or drop — do NOT fall back to
  "the active gen" blindly (that IS bug #2).

## Blob lifecycle fix (kills the broken-img)

- Revoke the PREVIOUS frame's blob when a newer frame for the same (engine,promptId) arrives, on a
  deferred tick (mirror the MPI-211 `setTimeout(…,0)` pattern so a synchronous re-render of the old
  url doesn't refetch a dead blob). Bounds memory + guarantees the only live blob is the latest.
- On generation end, the deferred final revoke stays as-is.

## Phases (verify each)

- **P1 — Ingest tagging + attribution.** Stamp `engine` + a server-truth `promptId` on every binary
  preview at the `comfyController` onmessage/route layer. Unit/log-verify: during a 2-sampler run,
  every frame carries the same promptId and the correct engine; during two back-to-back gens, no
  frame crosses over. **Verify:** add temp `clientLogger.debug` of `{engine,promptId,seq}` per frame,
  run SDXL-4K, confirm continuity across the stage boundary; run two gens, confirm no cross-attribution;
  remove the temp logs.
- **P2 — `preview:frame` event + compat shim.** Emit the normalized event; derive the legacy
  `generation:preview` from it. **Verify:** gallery card still shows latents (unchanged behavior).
- **P3 — Blob lifecycle.** Per-frame deferred revoke. **Verify:** no `ERR_FILE_NOT_FOUND` in console
  across a full multi-sampler run; memory doesn't grow unbounded (many frames).
- **P4 — Migrate consumers.** Gallery card + MpiBaseApp pane subscribe to `preview:frame`, filter by
  `generationId` (or engine+promptId). Fixes the app-pane bug as a byproduct. **Verify (user-ux):**
  SDXL-4K app pane shows latents CONTINUOUSLY through both samplers, never broken, never wrong-gen;
  gallery card same.
- **P5 (optional) — retire the shim** once both consumers are migrated.

## Both-engine rule (MANDATORY)

This is a dual-engine subsystem. Every change must be correct for the LOCAL ComfyUI WS AND the
remote Pod WS. A local-only verification does NOT verify remote ([[feedback_runpod_not_local_engine_proof]]).
Remote previews come over the renderer-direct WSS proxy; test a remote-connected gen too.

## Files (starting map)

- `js/services/comfyController.js` — ingest (`:677`,`:706`), `_stripPreviewHeader` (`:36`),
  `_routeMessage` (`:640`), `_activePromptId`.
- `js/services/commandExecutor.js` — `:1647` preview handler, `:1656` VHS reset, prompt-ack tracking.
- `js/services/generationService.js` — `:738` `exec.onPreview` fan-out.
- `js/services/activeGenerations.js` — `setPreview` (`:76`), `end`/revoke (`:102`), entry `.promptId`.
- `js/services/remoteEngineClient.js` — `wsUrl` (`:195`) engine-tag source.
- Consumers: `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` (placeholder preview render),
  `js/components/Organisms/MpiBaseApp/MpiBaseApp.js` (`:166` app pane).

## Out of scope

- The MPI-259 Apps work (this card exists so that work isn't blocked). MPI-259's app pane currently
  paints on `generation:preview` and will be migrated in P4.
- Video (VHS) preview windows already have their own reset (`VHS_latentpreview`); keep that behavior,
  just route it through the same tagged bus if convenient.

## Verification

**Verify mode:** user-ux (final acceptance = user watching latents in the app pane + gallery through
a real multi-sampler run, both engines).
