# Latent-preview bus

One system ingests binary latent-preview frames from **both** engines (local ComfyUI
WS + remote Pod proxy WSS), attributes each to its generation, filters non-image
frames, and emits **one engine-tagged event any surface can subscribe to**. To show
live latents anywhere (gallery card, Flow pane, a future OS floating window) you
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
- **Route a multi-engine consumer by `engine`, NOT `byPromptId`.** The two engines are
  independent ComfyUI instances with **independent `promptId` spaces** — a local and a
  remote promptId can collide, so `byPromptId(promptId)` may return the wrong engine's gen.
  A consumer that shows local + remote side by side (the OS float window,
  `floatLatentBridge.js`) keys tiles by **engine lane** (`local`/`remote`) taken straight
  off the frame's `engine` tag. It does NOT derive lane from a promptId or genId lookup.
  It also can't resolve lane at `generation:started` — the store job registers only after
  an `await` inside `runCommand`, so the store is empty then. So the **first frame** owns
  tile creation: by then the store is populated and `generationStore.activeGenId(lane)`
  gives the correct gen (title/ownership). Per-lane "batch done" uses
  `generationStore.laneDepth(lane, excludeGenId)`.
- **Two onmessage closures.** `comfyController.connect()` has a reuse-path and a fresh-path
  onmessage handler — both must honor the `_stripPreviewHeader` null-skip. (A fix that
  updated only one shipped a broken frame on the fresh path; MPI-269 caught it in review.)

## Legacy path (retired — MPI-271)

The old `Events.emit('generation:preview', { id, url })` + `activeGenerations.setPreview`
path is **gone**. All three consumers (MpiBaseFlow Flow pane, MpiGalleryBlock placeholder
card, MpiGroupHistoryBlock viewer) subscribe to `preview:frame` + seed from
`getLastPreview`. The `preview:frame` bus listener in `activeGenerations` is now the
**sole writer** of `entry.latestPreviewUrl` / `placeholderGroup.latestPreviewUrl`, which the
non-subscriber reads still poll (queue-panel thumbnail, group-history mount-seed, gallery-grid
card re-mount). `exec.onPreview` survives only to re-emit `generation-queue:changed` so the
queue thumbnail refreshes as latents land. `generation:preview-reset` (MPI-167 stage-clip
drop) is unrelated and stays.

## What produces the frames — the TAESD decoders (MPI-420)

ComfyUI is launched with `--preview-method taesd` (`routes/comfy.js`, plus the `.bat`
patch in `routes/engine.js`). Its previewer looks in `models/vae_approx/` for a file whose
name **starts with** the latent format's `taesd_decoder_name`. **With no match it does not
fail — it falls back to `Latent2RGB`**, the blocky colour-blob previewer
(`latent_preview.py` `get_previewer`). That silence is why a missing decoder is easy to
miss: previews still arrive, they are just bad.

The decoders our models name ship as `engineAsset` deps under `vae_approx/` in
`assetDeps.js`. The folder key needs no `yamlHelper` edit — it derives from the first path
segment of `filename`.

**Read the latent format out of `comfy/supported_models.py`, never off the model's
lineage.** Krea 2 is Flux-lineage in the transformer only; its latent space is
Qwen-Image, which ComfyUI classifies as `Wan21`. Assuming "Krea 2 is Flux, so it uses
taef1" is wrong and was written into this table once already.

| Model | ComfyUI latent format | Decoder | Shipped? |
|---|---|---|---|
| SDXL Realistic / NSFW, ILL Anime (both), PONY Mix | `SDXL` | `taesdxl_decoder` | ✅ engineAsset, baked on Pod |
| Chroma (both) | `Flux` | `taef1_decoder` | ✅ engineAsset, baked on Pod |
| FLUX.2 Klein | `Flux2` | `taef2_decoder` | ✅ engineAsset, volume-installed on remote |
| **Krea 2, Qwen Image, Qwen Image Edit** | `Wan21` | `lighttaew2_1` | ❌ **deliberately never** — see below |
| **Wan 2.2** | `Wan22` | `lighttaew2_2` | ❌ **deliberately never** — see below |
| LTX | `LTXV` / `LTXAV` | none in 0.29.2 | n/a — latent2rgb is its ceiling |

### The `lighttaew*` decoders are a landmine — do not "fix" the blob previews with them

ComfyUI issue **#13366**, *"TAESD preview corrupts midsampling latent if lighttaew2_1 is
present"*: with the file installed and taesd previews on (we force them globally), the
previewer corrupts the **real generation latent** — degraded output, not just a bad
preview. It hits the `Wan21`/`Wan22`/Qwen family, which is Krea 2, both Qwen models and
Wan 2.2. **Re-checked 2026-08-05: #13366 still open, fix PR #13383 still unmerged, both
untouched since April.** So those five models keep the mediocre latent2rgb preview on
purpose. Full reasoning: [`models/krea2/preview-taesd.md`](models/krea2/preview-taesd.md).

The bytes are staged on R2 (`vae_approx/lighttaew2_2.safetensors`, sha `10124099…0ba16a`)
so that re-adding the dep is the whole job once that PR lands in our engine version.

The gap that WAS closed, silently costing quality until 1.4: `vae_approx/` ships inside
the **Windows** ComfyUI portable archive, but macOS/Linux provision by git-cloning
ComfyUI, which carries none of it — so every preview on those platforms was latent2rgb.
And the bundle predates FLUX.2, so Klein was a blob on every platform.

`taef2_decoder.safetensors` is **derived**, not re-hosted: `madebyollin/taef2` ships one
combined file and ComfyUI strict-loads the decoder half alone, so it is converted with
madebyollin's own index shift (`decoder.layers.N` → `N+1`). Regenerate it — or check a
future FLUX.3 — with the recipe in `tasks/MPI-420/validation.md`.

## Files
- `js/services/comfyController.js` — ingest, engine tag, attribution, broken-frame gate, `preview:frame` emit.
- `js/services/activeGenerations.js` — `byPromptId`, `getLastPreview`, `_lastPreview` map + bus listener.
