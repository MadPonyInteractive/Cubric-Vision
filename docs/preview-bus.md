# Latent-preview bus

One system ingests binary latent-preview frames from **both** engines (local ComfyUI
WS + remote Pod proxy WSS), attributes each to its generation, filters non-image
frames, and emits **one engine-tagged event any surface can subscribe to**. To show
live latents anywhere (gallery card, app pane, a future OS floating window) you
subscribe to one event — no per-consumer WS handling, no engine checks, no attribution
logic. Shipped MPI-269 (`8f057a7c`).

## Subscribe

```js
Events.on('preview:frame', ({ engine, promptId, seq, url }) => { … })
```

| field      | meaning |
|------------|---------|
| `engine`   | `'local'` or `'remote'` — already resolved at ingest from which WS URL the socket bound. |
| `promptId` | the ComfyUI prompt this frame belongs to. Server-truth (see Attribution). |
| `seq`      | monotonic per-`promptId` counter. Only assigned to REAL image frames. Drop a frame if you already painted a higher seq. |
| `url`      | object URL for the JPEG blob. Emitter owns it — do **not** revoke it yourself. |

Resolve the generation:
```js
const entry = activeGenerations.byPromptId(promptId); // GenerationEntry | null
```
`null` = frame arrived before the `/prompt` ack set the promptId (transient). Skip it —
never fall back to "the active gen" (that was the cross-gen mis-attribution bug).

## Last-latent hold (show latents anywhere, even between frames)

A consumer that mounts or repaints **between** frames — e.g. during a slow second sampler
that emits no previews for tens of seconds — gets the current latent immediately:

```js
const last = activeGenerations.getLastPreview(genId); // {engine,promptId,seq,url} | null
if (last) paint(last.url);
```
The bus records the last-good latent per generation (cleared on `end()`). This is what
keeps a pane showing the last latent through a gap instead of going blank.

## Broken-frame gate (why you never receive garbage)

ComfyUI sends **non-image binary frames on the same preview socket** — e.g. a type-3,
~93-byte stage/progress marker emitted when a second model initializes in a multi-sampler
workflow (SDXL → PiD). The gate in `comfyController._stripPreviewHeader` is **general, not a
special-case**: a frame is a preview image iff it declares **ComfyUI event type 1**
(first 4 bytes big-endian = `PREVIEW_IMAGE`) **OR** carries a JPEG SOI (`FF D8`) with a
`>1KB` payload. Everything else returns `null` → skipped → `preview:frame` never fires
for it → consumers keep their last latent.
- Do **not** rely on an SOI-scan alone: a non-image marker's bytes can contain a
  coincidental `FF D8` and false-match.
- The SOI+size fallback (accept a sizable JPEG even with a nonstandard event type) keeps
  nonstandard-header images working — e.g. KJNodes' VHS/LTX-2 preview override (MPI-166),
  which uses a 28-byte header instead of core ComfyUI's 8-byte one.

## Attribution (binary frames carry no prompt_id)

Binary preview frames have no `prompt_id`, so they're attributed to `_activePromptId` —
the prompt the **server** says is running. That pointer updates on **both**
`execution_start` and `executing` (JSON messages interleaved with the binary frames).
`execution_start` fires *before* the first `executing`; tracking only `executing` left a
window where an early frame of a new gen was attributed to the previous gen. Both = closed.

## Gotchas

- **`Events` is per-document.** A separate Electron `BrowserWindow` / `window.open` window
  imports its **own** `events.js` = its own empty bus → subscribing to `preview:frame`
  there receives nothing. A cross-window consumer (e.g. the planned OS floating latent
  window when minimized) must either render inside the same renderer, or forward frames
  over IPC. And a `blob:` URL is per-document — it will **not** resolve in another window;
  send raw bytes / a data URL over IPC, not the blob URL.
- **Both-engine rule.** `engine` distinguishes local vs remote and the bus emits for both,
  but a local-only test does **not** verify remote — remote previews arrive over the
  renderer-direct WSS proxy. Verify a remote-connected gen too.
- **Two onmessage closures.** `comfyController.connect()` has a reuse-path and a fresh-path
  onmessage handler — both must honor the `_stripPreviewHeader` null-skip. (A fix that
  updated only one shipped a broken frame on the fresh path; MPI-269 caught it in review.)

## Legacy path (being retired)

The old `Events.emit('generation:preview', { id, url })` + `exec.onPreview → setPreview`
path still runs (untouched, additive) so nothing broke in one shot. Consumers migrate to
`preview:frame` + `getLastPreview`, then the legacy path is retired (MPI-269 P4/P5).

## Files
- `js/services/comfyController.js` — ingest, engine tag, attribution, broken-frame gate, `preview:frame` emit.
- `js/services/activeGenerations.js` — `byPromptId`, `getLastPreview`, `_lastPreview` map + bus listener.
