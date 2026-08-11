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
| `url`      | object URL for the JPEG blob. **Paint it and forget it → the bus frees it.** RETAIN it (buffer, replay, hold past the next frame) and it is **yours to revoke** — see Blob ownership. |

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

## Clip runs vs still runs — read it off the GENERATION, never latch it (MPI-535)

A burst previewer sends **one `VHS_latentpreview` marker per sampler run**, then a whole
clip of `PREVIEW_IMAGE` frames per step. That marker is the only thing separating a clip
run (accumulate + loop) from an ordinary still run (each frame replaces the last), and it
fires **exactly once**. So it is recorded on the generation, not on whoever was mounted
when it arrived:

```js
activeGenerations.resetPreview(genId, { length, rate }); // marker → durable per-run state
activeGenerations.getPreviewClip(genId);                 // {rate, length} | null — re-read per frame
```

`MpiGalleryBlock` hands the result to the card with **every** frame; the card mirrors it
and never latches. That is what makes a missed marker survivable, and it has to be:

- The card may not be in `_cardMap` yet when the marker lands.
- `setGenerating(null)` on any grid render calls `_clearPreviewImage()` →
  `_stopPreviewPlayback()`, which wipes playback state — reachable in the window between
  the marker and the first frame, before `latestPreviewUrl` is set.
- **A single-pass H3 run is ONE prompt = ONE marker for the whole run.** Multi-stage is two
  prompts (preview, then Finish), so it gets a second arming and *looks* fine — which is
  exactly how this shipped: reported as "single-pass is broken", actually a race that a
  later single-pass run won. Reproduced deterministically by delivering frames with no
  marker at all; the card now self-heals on the next frame.

`rate` and `length` are the clip's own contract and both are **used**, not decoration:
playback runs at `rate` (H3 announces 24, KJNodes' LTX override 16 — 8fps is only the
fallback) and the ring is sized by `length` (a shorter ring silently replays the clip's
tail — 48 of H3's 56 frames). Measured on the real card: 24 painted frames/s at rate 24,
7–8 at rate 8, and a no-clip burst still freezes on its last frame as it should.

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
| LTX | `LTXV` / `LTXAV` | none — core names no decoder | ✅ but NOT via this table — `ltx23-preview-taehv`, see below |
| MiniMax H3 | `MiniMaxH3Video` / `MiniMaxH3AV` | none — core names no decoder | ✅ but NOT via this table — `taeh3-decoder`, see below |

Both H3 rows and the LTX row route through a **node**, not core. What makes their frames
reach the app at all is that those nodes emit on the *standard* binary preview channel —
one `VHS_latentpreview` marker, then one `PREVIEW_IMAGE` per frame with a cursor walking
the clip in real time. That is the same road every other model's previews travel, which is
why neither needed a single line of app-side plumbing. A previewer that instead paints a
widget on its own node (KJNodes' `ModelPreviewOverrideKJ` base64s onto a private
`kj_preview_override` event) is invisible here no matter how good the picture is.

### The second kind of decoder — node-read, model-owned, NOT an engineAsset (MPI-508)

Everything above is read by **core's previewer**, which is why those decoders are
`engineAsset`: they belong to no model, a model-keyed install would never reach them, and
a GC with an "owner" would delete them.

H3 and LTX previews work a different way, and the difference decides every flag on the
dep. Core cannot serve either one:

- `MiniMaxH3Video` / `MiniMaxH3AV` and `LTXV` / `LTXAV` set **no `taesd_decoder_name`**, so
  `get_previewer` never even looks for a file.
- Core's `TAESD` could not load `taeh3` regardless — its `Decoder` hardcodes width 64 and
  taeh3 is 256.

So both are consumed by **nodes inside the graph**, not by the engine:

| dep | file | read by | how it is selected |
|---|---|---|---|
| `taeh3-decoder` | `vae/taeh3.safetensors` | our own `MpiVideoSamplingPreview` | **`MpiTinyVaeLoader`** wired to its `vae` input — a plain `VAELoader` **cannot load this file**, see below |
| `ltx23-preview-taehv` | `vae/taeltx2_3.safetensors` | KJNodes `LTX2SamplingPreviewOverride` | a plain `VAELoader` wired to its `vae` input |

#### `taeh3` needs `MpiTinyVaeLoader` — core's `VAELoader` raises on it (MPI-508)

`TAEHV.__init__` sizes its edge convs as `image_channels * patch_size**2` and selects
`patch_size = 2` only for `latent_channels in [48, 32]`. `taeh3` is a **24**-channel latent
with a **12**-wide decoder (3 RGB x 4 temporal frames), so core builds it 3 wide and the
load dies before sampling:

```
RuntimeError: Error(s) in loading state_dict for TAEHV:
  size mismatch for decoder.22.bias: checkpoint [12] vs model [3]
```

There is no branch in `comfy/sd.py` for that shape and no argument that reaches it, and
`comfy/taesd/taehv.py` is byte-identical on engine 0.30.0 and bench 0.30.2 — so this is a
missing case, not a version to wait out. `MpiTinyVaeLoader` rebuilds the two edge convs at
the right width (a strict state-dict load then matches all 128 tensors) and delegates any
decoder core already handles — `taeltx2_3` included — to `VAELoader`'s own path.

**Do not "simplify" the H3 graphs back to a `VAELoader`.** It is not a stylistic choice;
it is the difference between H3 generating and H3 dying on node load.

#### An OUTER_SAMPLE wrapper sees the FLAT pack, not the nested latent (MPI-508)

A multi-part latent (H3 = video + audio) reaches the sampler as **one flat tensor**. Core
restores the nested view in a callback wrapper it builds *before* calling `outer_sample`,
so a callback installed by an `OUTER_SAMPLE` wrapper sits **inside** that unpacker and
receives the raw pack, while core's own previewer — further out — receives the nested one.

Measured on H3: `x0` arrives as `(1, 1, 658752)` with `is_nested` **False**, against
`latent_shapes = [[1, 24, 17, 40, 40], [1, 32, 2, 93]]` — video + audio, which do sum to
658752. A shape guard expecting 4D/5D therefore rejects **every** step.

`MpiVideoSamplingPreview` unpacks it itself with `comfy.utils.unpack_latents(x0,
latent_shapes)[0]`; `latent_shapes` is handed to the wrapper for exactly this. This failed
**silently** before the fix — the node swallows preview errors by design, and a shape guard
that returns early raises nothing at all, so the symptom was previews that simply never
appeared while the generation succeeded. When previews are missing, check the frame COUNT
first: core's latent2rgb fallback still emits one frame per step on the same channel, so
"some previews" is not proof the node ran (6 frames on a 6-step sampler = core alone;
this node bursts a whole clip per callback).

Consequences, all deliberate:

- **Neither is an `engineAsset`.** They belong to specific models (H3's two DiTs, LTX's two
  tiers), a model-keyed install reaches them, and GC with the last owning model is the
  correct outcome. Do not "fix" them to match the rows above.
- **Both live in `vae/`, not `vae_approx/`** — a `VAELoader` reads the `vae` folder key.
  They are preview decoders in purpose and VAEs in plumbing. `vae_approx/` is for the
  core-read decoders only.
- **The #13366 landmine below does not reach them.** That corruption happens inside core's
  previewer loading a whole VAE; core never touches these files.

The LTX one is a **rewire, not an addition**: `LTX2SamplingPreviewOverride` was always in
the graph, fed the full video VAE. It branches on
`vae.first_stage_model.__class__.__name__ == "TAEHV"` and silently falls back to
`latent_rgb_factors` for anything else — which is why LTX previews were blocky for so long
while a preview-override node sat right there. Feeding it the tiny TAEHV flips the branch.
The trade: that path also nulls `latent_upscale_model`, so previews go from sharp-but-blocky
to soft-but-real, and playback speed becomes honest.

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

### Blob ownership — the RETAINER frees it, not the bus (MPI-508)

A burst previewer changes the arithmetic: a 5s H3 run mints **2500** blob URLs, not 20.
The obvious answer — the bus revokes each frame the next one replaces — is wrong, and so
is every variant of it. Measured on real H3 runs:

| bus-side rule | result |
|---|---|
| revoke on arrival | **2600** `ERR_FILE_NOT_FOUND` |
| revoke a lagged tail (ring of 64 > the card's window of 48) | 377, all after the run |
| flush on the terminal event | 1298, a flat 8/s over exactly 48 distinct URLs |
| **bus keeps only the newest; the retainer frees its own** | **3** |

Because `MpiGalleryGrid` **replays** a rolling 48-frame window at 8fps for an *unbounded*
time — the loop runs until the card is REMOVED, which for a video is minutes after the
last frame while the output downloads, saves and thumbnails. No lag and no lifecycle
event `activeGenerations` can see marks that moment.

So: `activeGenerations` owns exactly one URL per generation (the newest, revoked in
`end()`), and any consumer that holds a frame past the next one owns that frame.
`MpiGalleryGrid` revokes on eviction and on teardown. The cost is that frames reaching
**no** retainer (gallery unmounted) live until the page unloads — bounded by one run,
and cheaper than any of the three bugs above. The fix, if it ever matters, is a release
call from the consumer, never a guessed lag in the bus.

#### A tiny video decoder has NO random access — decode from frame 0 (MPI-508)

A TAEHV is temporal: its `MemBlock`s chain state forward, so frame N is only correct if
every frame before it was decoded in the same pass. `MpiVideoSamplingPreview` therefore
decodes the **whole clip, every sampler step** — not a cost choice, the only correct one.
Its first version walked a cursor over a window of the clip "as real time earned frames",
and **every frame came out green**.

Two faults, one root. The 5D latent was flattened frames-as-batch with
`reshape((-1,) + x0.shape[-3:])`, but on `[B,C,T,H,W]` those last three dims are
`(T,H,W)`, not `(C,H,W)` — so the reshape produced `[C,T,H,W]` labelled `[T,C,H,W]`,
transposing time and channels. **It never raised:** `TAEHV.decode` only transposes when
`shape[1] != latent_channels`, and the frame budget clamped the batch to exactly
`latent_channels`, so the scrambled buffer was accepted as a valid whole clip.

H3's chunking is honoured too: its VAE codes **17 pixel frames per 5 latent tokens**, so
each chunk's 3-frame prefix is trimmed rather than `TAEHV.decode`'s one global trim, then
the encoder's 3-token tail pad is dropped (17 tokens → 56 frames, not 65).

**Verify a decode without a GPU or a generation.** kjnodes' `TAEHVDecoder` reads the same
`taeh3` weight, so load the weight on CPU and assert our decode matches theirs
bit-for-bit on a random latent (it does — max diff 0.0). A clean state-dict load proves
nothing: pixel-shuffle interpretation and activation choice are parameterless, they load
perfectly and decode wrong.

## Files
- `js/services/comfyController.js` — ingest, engine tag, attribution, broken-frame gate, `preview:frame` emit.
- `js/services/activeGenerations.js` — `byPromptId`, `getLastPreview`, `_lastPreview` map + bus listener.
