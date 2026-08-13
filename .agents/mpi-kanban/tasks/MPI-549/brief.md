# MPI-549 - Tiled VAE decode for MiniMax H3 reference-to-video

## Symptom (Fabio, 2026-08-12, measured on a rented RunPod RTX 5090)

MiniMax H3 reference-to-video, three reference slots, Reference Detail = Max:

| Output | Result |
|---|---|
| 864x480 | completes, ~45s for 3s of video |
| 2K | OOM |
| 4K | OOM |

Card: RTX 5090, 32GB VRAM, 60GB system RAM.

Both failures surface as two toasts - "Ran out of memory processing this" followed
by "Remote engine disconnected - the Pod may have run out of memory and restarted"
- and need a reconnect from Settings before work continues. On a rented Pod that
is paid time lost, twice in one session.

## Cause

The decode runs directly on the full latent. There is no tiled decoding in the H3
workflows, so peak VRAM at decode scales with the full frame size and blows past
the card at 2K. Sampling is not the problem.

## Ask

Add tiled VAE decoding to the MiniMax H3 reference-to-video workflows.

Keep it simple: a single user-facing low-VRAM toggle. Do not expose tile size,
overlap or any other tuning to the user.

## Not in scope

- Tuning the tile parameters as user-facing settings.
- Other models' workflows - this card is H3 reference-to-video only. Widen it
  later if the same decode pattern shows up elsewhere.

## Open questions for whoever picks this up

- How much VRAM 2K and 4K actually need undecoded. Untested. Fabio's estimate is
  ~90GB, which would put it on an H100/A100-class card, but nobody has measured it.
- Whether Reference Detail = Match rather than Max already lets a 32GB card reach
  2K without any code change. Untested, and worth checking first because it may
  cost nothing.

## Origin

Found while producing the Cubric western film (Identity repo, MPI-74). That film
now generates every shot at 864x480 and upscales afterwards, which works, so this
card is not blocking it.

---

## Outcome: REJECTED (2026-08-13) - the premise was wrong

The card assumed "the decode runs directly on the full latent, there is no tiled
decoding". That is not true. Verified by reading the engine:

- `comfy/sd.py:957` - the H3 video VAE sets `self.handles_tiling = True`, with the
  comment "the model tiles internally (256px spatial, 17-frame temporal chunks)".
- `comfy/sd.py:1190-1213` - plain `VAEDecode` already catches OOM, calls
  `soft_empty_cache()`, and retries through `_decode_tiled_owned(tile=256//16,
  overlap=tile//4)`. The warning it logs is "Ran out of memory when regular VAE
  decoding, retrying with tiled VAE decoding."

So the `VAE Decode` node already in the H3 graphs IS the tiled path, and hits the
same `handles_tiling` branch a `VAEDecodeTiled` node would. Adding a tiled node
buys zero VRAM.

The correct reading of the observed failure: the decode tiled and STILL did not
fit in 32GB. Not "the decode was never tiled".

### Why a tiled node cannot be added anyway

An H3 `LATENT` is a `NestedTensor` bundling (video, audio) - see
`comfy_extras/nodes_minimax_h3.py:76`. Neither tiled node unbinds it, so both
error out when wired in (both reproduced by Fabio on the bench):

- `LTXVTiledVAEDecode` - unpacks `batch, channels, frames, height, width =
  samples.shape`; a nested `.shape` is 4D, so it raises `IndexError: too many
  indices for tensor of dimension 4`. LTX-specific node, never built for nested
  AV latents.
- Core `VAEDecodeTiled` - passes the NestedTensor straight to
  `vae.decode_tiled()`, raising `TypeError: to() received an invalid combination
  of arguments - got (NestedTensor)`. Its non-tiled sibling `VAEDecode` does have
  the unbind (`nodes.py:333`, `if latent.is_nested: latent = latent.unbind()[0]`);
  the tiled one simply never got that line. Upstream gap, not our wiring.

### What replaces it

MPI-551 shipped the "Experimental - High VRAM" note on every H3 2K/4K tier, so
the 2K/4K path is labelled rather than fixed. Anyone who wants it rents an
H100-class card. 864x480 plus an upscale afterwards remains the working route and
is what the western film (Identity MPI-74) uses.

### Left unmeasured

Nobody confirmed which stage OOMs. Fabio's read is that it came late, after the
whole thing had processed, which points at decode - but the Pod log was not
captured and `"retrying with tiled VAE decoding"` was never grepped for. If this
is ever reopened, that grep is step one. Note `MAX_PIXELS = 768*1344` in
`nodes_minimax_h3.py` caps the sampling canvas regardless of the requested
output, so "2K/4K" is upscale-after, not sampled at that size.
