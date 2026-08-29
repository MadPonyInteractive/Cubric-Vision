# Latent-preview decoders

**What PRODUCES the frames the `preview:frame` bus carries.** Split out of
[preview-bus.md](preview-bus.md) (MPI-571) because it is a different subject: that doc
is the bus CONTRACT — subscribe, attribute, consume — while this one is about model
weights, which decoder loads which latent format, and the two traps that silently
degrade or corrupt a run. Read this before adding any `vae_approx/` dep or wiring
previews for a new model.

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
| `ltx23-preview-taehv` | `vae/taeltx2_3.safetensors` | our own `MpiVideoSamplingPreview` | a plain `VAELoader` wired to its `vae` input — core builds a `TAEHV` from this one, unlike `taeh3` |

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

The LTX one started as a **rewire, not an addition**: KJNodes'
`LTX2SamplingPreviewOverride` was always in the graph, fed the full video VAE. It branches
on `vae.first_stage_model.__class__.__name__ == "TAEHV"` and silently falls back to
`latent_rgb_factors` for anything else — which is why LTX previews were blocky for so long
while a preview-override node sat right there. Feeding it the tiny TAEHV flipped the branch:
previews went from sharp-but-blocky to soft-but-real, and that path nulls
`latent_upscale_model`, so the loader it was wired to did nothing from then on.

**Both are now our node (MPI-575).** Flipping that branch also armed a bug in it: with a
TAEHV attached, one latent frame decodes to 8 pixel frames, but
`ltxv_nodes.py:646` still announces `VHS_latentpreview.length` as the **latent** count while
`ltxv_nodes.py:688` steps the frame index around the real `(N-1)*8+1` ring. The consumer
sizes its ring by the announced length (`previewClipPlayer`, MPI-535), so it held only the
tail of each burst — measured on a 72-frame LTX run: announced **10**, streamed **73**,
which is the "flashes frame 0 then the tail" report. `MpiVideoSamplingPreview` announces the
decoded count, which is why H3 never had it, so the four LTX graphs use it now and
`latent_upscale_model` left with the node that ignored it.

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
