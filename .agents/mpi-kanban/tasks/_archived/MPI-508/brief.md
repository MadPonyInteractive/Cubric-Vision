# MPI-508 — True-RGB sampling previews for H3 and LTX

Bench session 2026-08-09 (Fabio driving G:\ComfyUi, agent reading source). Everything
below was measured or read out of the shipped engine, not inferred.

## The two weights

| | file | bytes | sha256 | folder |
|---|---|---|---|---|
| LTX | `taeltx2_3.safetensors` | 23,531,296 | `f0773b4e3e57318e6aa4dd4a35e1d16213a5f160fbc0376163f06888bbcbe246` | `vae/` |
| H3 | `taeh3.safetensors` (madebyollin) | 22,709,752 | `4fd022bfcab08772fe0536b17ea1a3bbb5625be11e397868d1c5d891863d4c13` | `vae_approx/` |

Both from `madebyollin/taehv` (GitHub, `safetensors/`), Apache-2.0, no territory bar.
Staged on the bench at `G:/CubricModels/vae/` and `G:/CubricModels/vae_approx/`
(the H3 one still carries the A/B name `taeh3_ollin.safetensors` there).

Different folders because they are consumed differently: the LTX one is loaded by a
`VAELoader` **node** (so it must be in the `vae` folder key), the H3 one is read by
KJNodes through `folder_paths.get_filename_list("vae_approx")`.

`taeltx_2.safetensors` is a DIFFERENT weight despite the identical 23,531,296 size
(sha `6e4cc0469134213d0101a46877ea2bce1dc7cf06ff5f5aefb9e4076c03542f7b`) — untested,
kept in scratchpad. We run LTX 2.3, so `taeltx2_3`.

## LTX — a rewire, not a new node

`LTX2SamplingPreviewOverride` is already node `366` in both `ltx_i2v_t2v.json` and
`ltx_i2v_t2v_int8.json`. Its `vae` input is a **mode switch**:

```python
# custom_nodes/comfyui-kjnodes/nodes/ltxv_nodes.py:949-956
if vae.first_stage_model.__class__.__name__ == "TAEHV":
    taeltx = True
    latent_upscale_model = None
...
previewer = WrappedPreviewer(latent_rgb_factors, bias, rate=rate, taeltx=vae if taeltx else None)
```

We feed it the full video VAE → `taeltx` stays False → `latent_rgb_factors` → blocks.
The full VAE was only ever used for `per_channel_statistics` un/normalize around the
latent upscale; it never decoded a preview.

`comfy/sd.py:868` sniffs `decoder.22.bias` and builds `comfy.taesd.taehv.TAEHV`, so a
plain `VAELoader` on `taeltx2_3` produces exactly the object that check wants.

**Known trade, accepted:** the TAEHV path nulls `latent_upscale_model`, so the preview
goes from sharp-but-blocky to soft-but-real. Fabio ships it because playback SPEED is
finally honest — the old preview ran at a flash speed that misrepresented the video.

## H3 — no core path exists, KJNodes is the only route

- `MiniMaxH3Video` / `MiniMaxH3AV` set **no** `taesd_decoder_name`.
- `taeh3` is not in `latent_preview.VIDEO_TAES`.
- Core `TAESD` cannot load it regardless: `Decoder` hardcodes width 64, taeh3 is 96
  (Kijai) / 256 (ollin) wide.

So it goes through `ModelPreviewOverrideKJ`'s `tiny_vae` combo. `comfyui-kjnodes` is
already in `dev_configs/node_lock.json` — **no engine work**.

### Use ollin's, not Kijai's

| | tensors | shape | temporal |
|---|---|---|---|
| Kijai `MiniMax-H3-TAE` | 81, keys `1.bias…`, fp32, w96 | `1.weight [96,24,3,3]` | **none — 2D only** |
| madebyollin `taehv/taeh3` | 128, `encoder.*`+`decoder.*`, fp16, w256 | `decoder.1.weight [256,24,3,3]` | 4:1 upsample |

`_tiny_vae_decode_to_pil` walks `x0.shape[2]` = **latent** frames. With a 2D decoder you
get one image per latent frame (19 for a 3s clip) and playback runs ~4x fast; ollin's
`decode_video` expands back to pixel frames. Kijai's own README says his is the rough
one and points at ollin's.

### Widget values (measured on the bench, several wrong guesses first)

- `preview_frames` = **the clip frame count** — wire `MpiH3Length`'s `frames` output,
  the same INT feeding the H3 node's `length`.
- `preview_fps` = **24**.
- `max_resolution` 1024, `jpeg_quality` 80.
- `suppress_default_preview` **false** so core latent2rgb survives as a fallback.
- The node's `vae` input is **ignored on H3** — it is read only inside the `is_ltx`
  branch. Leave it unconnected.

Cost: **~5s on a 3s 864x480 clip**, accepted. `_tiny_vae_decode_to_pil` runs inline in
the sampler callback every step; the JPEG/WebP/NVENC encode is on a background thread.

## App-side work — H3 only, ~15 lines

`ModelPreviewOverrideKJ` does not use the core `ProgressBar`. It sends base64 frames on
a custom event:

```python
PromptServer.instance.send_sync("kj_preview_override", payload, PromptServer.instance.client_id)
# payload = {node_id, step, total, sigma, sigmas, image: <base64>, w, h}
```

`client_id` is the submitting client — us. `comfyController.js` posts `client_id` at
:1551 and connects with the same id at :904, so **the frames already arrive and nothing
decodes them**. Add a branch beside the binary-frame path (:804-818) that turns
`payload.image` into a blob URL on the existing `preview:frame` bus.

The LTX node needs none of this: its callback ends in `pbar.update_absolute(...)`, the
standard channel we already render. That difference is the whole reason the LTX half is
a pure graph change and the H3 half is not.

## Wiring checklist

1. R2 upload both weights (22 MB each) → `vision/models/vae/taeltx2_3.safetensors`,
   `vision/models/vae_approx/taeh3.safetensors`.
2. Dep entries: LTX one beside the other LTX VAEs; H3 one beside `taesdxl-decoder` /
   `taef1-decoder` / `taef2-decoder` in `assetDeps.js`. Drop the `_ollin` suffix.
3. Attach to **both LTX tiers** (shared graph) and **both H3 DiTs** (fl2va + r2va).
4. Graphs: LTX raw is ALREADY edited in the working tree (Fabio's bench export);
   H3 raw still needs the node added to both templates.
5. Convert raw → API **against the engine on :48188, never the bench on :8188** — the
   bench runs ahead (0.30.2 vs 0.30.0) and has silently shifted a widget before
   (memory `tool_comfy_schema_gate_before_workflow_sync`).
6. App: the `kj_preview_override` branch in `comfyController.js`.

## Bench side effect (leave it)

`G:/ComfyUi/ComfyUI/extra_model_paths.yaml` gained `vae_approx: vae_approx/` under
`cubric_models` — the bench had no mapping for that folder, so nothing in
`G:/CubricModels/vae_approx/` was visible to it. Backup at `extra_model_paths.yaml.bak`.
Not a repo file.
