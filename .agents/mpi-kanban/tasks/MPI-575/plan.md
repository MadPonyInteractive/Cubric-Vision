# MPI-575 Plan

## Current State

Root cause settled 2026-08-29 **from source arithmetic — the GPU run the card
asked for was not needed**, and it is NOT what the card description says. Both
candidates in that description are disproven; it is kept as the historical read.

### What the card got wrong

- **Candidate 1 (audio tokens decoded as video, `shape is None`) — disproven.**
  `LTXVConcatAVLatent` produces a nested latent, so `comfy/samplers.py:1282`
  packs it and `latent_shapes` has **2** entries. KJNodes therefore *does* get
  `shape = latent_shapes[0]` (`ltxv_nodes.py:916`) and its slice
  (`cut = prod(shape[1:])`, then reshape) is character-for-character the same
  math as `comfy.utils.unpack_latents` at `comfy/utils.py:1424`. The video half
  is sliced correctly. No audio tokens reach the previewer.
- **Candidate 2 (`num_keyframes` wrong) — disproven.** The count is right, and
  foley/extend carry no `LTXVAddGuide` at all, so it is 0 there.

### The actual defect

`WrappedPreviewer.decode_latent_to_preview_image` announces the clip contract:

    ltxv_nodes.py:646   send_sync('VHS_latentpreview', {'length': num_images, ...})

`num_images` is the **latent** frame count. But the graph feeds it
`taeltx2_3.safetensors`, a TAEHV, so `LTX2SamplingPreviewOverride.execute`
(`ltxv_nodes.py:953`) sets `taeltx = True` and each latent frame decodes to 8
pixel frames. The same class says so 42 lines later:

    ltxv_nodes.py:688   ind = (ind + 1) % ((leng - 1) * 8 + 1)     # the REAL ring

So it announces N and streams `(N-1)*8+1`. `previewClipPlayer` sizes its ring by
the announced `length` — deliberate, documented, MPI-535 — so the ring holds only
the tail of each burst, and burst 1 starts at index 0. That is exactly the
reported "flashes the first frame, then just the last frames".

Measured against Fabio's live run (`fv/i2v_ms_004`, `ltx-23-balanced`, 72 frames
@24fps): 10 video latent frames after the 2 guide latents are trimmed →
announced length **10**, frames actually streamed **73**.

Cross-check that closes it: our own `MpiVideoSamplingPreview`
(`ComfyUi-MpiNodes/preview.py:129`) announces `images.size(0)` — the *decoded*
count — and H3, which uses it, has never flashed. Two emitters of one event; one
counts latents, one counts frames.

## Approach

Fix at the source by deleting the third-party node from our path. Our node
already does everything KJ's does and does it right: it unpacks the AV pack via
`latent_shapes` (H3 packs video+audio identically), decodes through a TAEHV, and
announces the honest length. It is missing exactly one thing — the keyframe trim,
because H3 has no `LTXVAddGuide` and LTX i2v has two.

1. `ComfyUi-MpiNodes/preview.py`: read `keyframe_idxs` off the positive cond in
   `_PreviewWrapper.__call__` and trim that many trailing frames in
   `_TinyVaePreviewer.push`. Same read KJ does, ~6 lines.
2. Push MpiNodes, bump `dev_configs/node_lock.json`.
3. Swap `LTX2SamplingPreviewOverride` → `MpiVideoSamplingPreview` in the four LTX
   graphs. Drop the `latent_upscale_model` link, which KJ nulls anyway whenever
   the VAE is a TAEHV; keep the loader node, `LTXVLatentUpsampler` still uses it.
4. Fabio re-exports each graph from ComfyUI so the checked-in JSON stays readable
   and in sync (his call, 2026-08-29).

### Deliberately not done

No wall-clock throttle. Our node decodes the whole clip every step where KJ
decodes a rate-limited window; at 8 steps and 10-31 latent frames that is a tiny
VAE doing less than H3 already does per run. Add one if a long foley clip crawls
— the node's own comment already flags where.

## Verification

**Verify mode:** user-ux

One real LTX run: the live preview loops the whole clip continuously instead of
flashing frame 0 and then the tail.
