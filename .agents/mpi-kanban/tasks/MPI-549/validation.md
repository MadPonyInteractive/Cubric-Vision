# MPI-549 - Validation

## Verdict: REJECTED, no code shipped

Nothing was implemented, so there is no runtime check to pass. What was validated
is the card's premise, by reading the engine source that ships in
`engine/ComfyUI_windows_portable/ComfyUI`.

## Evidence

| Claim | Where | Reads |
|---|---|---|
| The H3 video VAE tiles internally | `comfy/sd.py:957` | `self.handles_tiling = True`, commented "the model tiles internally (256px spatial, 17-frame temporal chunks)" |
| Plain `VAEDecode` already falls back to tiled on OOM | `comfy/sd.py:1190-1213` | catches OOM -> `soft_empty_cache()` -> `_decode_tiled_owned(tile_x=256//16, tile_y=..., overlap=tile//4)`; logs "Ran out of memory when regular VAE decoding, retrying with tiled VAE decoding." |
| An H3 LATENT is a NestedTensor, not a plain tensor | `comfy_extras/nodes_minimax_h3.py:76` | `return {"samples": comfy.nested_tensor.NestedTensor((video, audio))}, frame_count` |
| `VAEDecode` unbinds it, `VAEDecodeTiled` does not | `nodes.py:332` vs `nodes.py:368` | the non-tiled node has `if latent.is_nested: latent = latent.unbind()[0]`; the tiled node passes `samples["samples"]` straight to `vae.decode_tiled()` |
| `LTXVTiledVAEDecode` cannot take a nested latent | `custom_nodes/ComfyUI-LTXVideo/tiled_vae_decode.py:59` | `batch, channels, frames, height, width = samples.shape` - a nested `.shape` is 4D |

Both node failures were also reproduced by Fabio on the bench at 127.0.0.1:48188
against `minimax_h3_r2va`, screenshots in the session:

- `LTXVTiledVAEDecode` (node 496) -> `IndexError: too many indices for tensor of dimension 4`
- `VAEDecodeTiled` (node 473) -> `TypeError: to() received an invalid combination of arguments - got (NestedTensor)`

## Conclusion

The fix the card asked for is already in the engine, and the node it asked to add
cannot be wired to an H3 latent. Closing as `rejected` rather than `complete` -
no behaviour changed.

## Not measured

Which stage actually OOMs at 2K on a 32GB card. The Pod log was never captured
and `"retrying with tiled VAE decoding"` was never grepped for, so "decode tiled
and still did not fit" is the most consistent reading, not a measurement. That
grep is step one if this is ever reopened.
