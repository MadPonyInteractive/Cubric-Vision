# MPI-269 — Unified latent-preview bus: consumer contract

The bus is BUILT and PROVEN (P1 + P2 + broken-frame gate + last-latent hold).
This is what a consumer subscribes to. No per-consumer plumbing, no engine checks,
no attribution logic — the bus did all of that.

## The event

```js
Events.on('preview:frame', ({ engine, promptId, seq, url }) => { ... })
```

| field       | meaning |
|-------------|---------|
| `engine`    | `'local'` (local ComfyUI WS) or `'remote'` (Pod proxy WSS). Already resolved. |
| `promptId`  | the ComfyUI prompt this frame belongs to (server-truth, from `execution_start`/`executing`). |
| `seq`       | monotonic per-promptId counter. Drop a frame if you already painted a higher seq. |
| `url`       | object URL for the JPEG blob. Owned by the emitter; do NOT revoke it yourself. |

Only REAL preview images fire this event. Non-image binary frames (stage/progress
markers, e.g. the type-3 93-byte marker at a multi-sampler boundary) are filtered
at ingest — you will never receive a broken frame, so you never need to guard for one.

## Resolve the generation

```js
const entry = activeGenerations.byPromptId(promptId); // → GenerationEntry | null
// entry.id is the regId; entry.tempId / entry.scope / etc. as before.
```
`null` = the frame arrived before the /prompt ack set the promptId (rare, transient).
Skip it — do NOT fall back to "the active gen" (that was the cross-gen bug).

## Last-latent hold (the key to "display anywhere")

A consumer that mounts (or repaints) BETWEEN frames — e.g. during the ~60s PiD
stage that emits no previews — gets the current latent immediately:

```js
const last = activeGenerations.getLastPreview(genId); // → {engine,promptId,seq,url} | null
if (last) paint(last.url);
```
This is what makes the pane hold the last latent through a gap instead of going
blank/broken. Call it on mount and whenever you'd otherwise show nothing.

## Migration plan (P4)

1. **MpiBaseApp** (`js/components/Organisms/MpiBaseApp/MpiBaseApp.js:166`) — currently
   subscribes `generation:preview` and matches `entry.tempId === _myTempId`. Switch to
   `preview:frame`, resolve via `byPromptId`, match the same tempId. On mount/paint-empty,
   seed from `getLastPreview`. Fixes the app-pane bug as a byproduct.
2. **Gallery placeholder card** — same migration; reads `placeholderGroup.latestPreviewUrl`
   today (still fed by the legacy path). Move it to `preview:frame` + `getLastPreview`.
3. **P5** — once BOTH migrated, retire the legacy `generation:preview` emit + the
   `exec.onPreview → setPreview` path (they duplicate the bus now).

## Both-engine rule (MANDATORY)
`engine` distinguishes local vs remote — the bus emits for both. A local-only test does
NOT verify remote ([[feedback_runpod_not_local_engine_proof]]). Remote previews arrive
over the renderer-direct WSS proxy; verify a remote-connected gen before closing P4.

## Open flag
LTX/VHS previews (MPI-166) were NOT live-run this session (LTX is slow). The gate accepts
them via a SOI+size fallback (>1KB JPEG passes even with a nonstandard event type), so they
are safe-by-default — but confirm on the next real LTX gen that its previews still show.

## Cross-window consumers (e.g. OS floating latent window when minimized)
A SEPARATE Electron BrowserWindow / OS-native window has its OWN JS context = its OWN
empty `Events` bus. It will receive NOTHING by subscribing to `preview:frame` directly
(this is why the debug popup opened via `window.open` showed nothing — different document,
different bus). Two options for such a consumer:
  (a) render it inside the SAME renderer (an in-document overlay), or
  (b) forward frames over IPC: the main renderer subscribes to `preview:frame` and
      `webContents.send`s `{engine, promptId, seq, url}` to the other window. NOTE: a
      `blob:` URL is per-document — it will NOT resolve in the other window. Send the
      raw bytes (or a data URL) over IPC, not the blob URL.

## Files changed this session (the bus itself — do not re-touch, just consume)
- `js/services/comfyController.js` — ingest tagging, `execution_start` attribution,
  `_stripPreviewHeader` broken-frame gate, `preview:frame` emit.
- `js/services/activeGenerations.js` — `byPromptId`, `getLastPreview`, bus listener,
  `_lastPreview` map + cleanup in `end()`.
