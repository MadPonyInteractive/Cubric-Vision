# merge-loras

Combine a model-side + clip-side extracted LoRA into ONE `.safetensors` so a stack of
LoRAs ships as a single file instead of three loose ones.

This is the SECOND half of the LTX LoRA-merge flow. The FIRST half (extracting the
stacked delta out of ComfyUI) and the WHY (four dead-end approaches before this one)
live in **[docs/builder/research/lora-merge-ltx.md](../../../docs/builder/research/lora-merge-ltx.md)** — read that first.

## Quick use

The KJNodes `LoraExtractKJ` node writes two files to ComfyUI's output dir (model delta =
`diffusion_model.*` keys, clip delta = `text_encoders.*` keys). Union them:

```bash
"G:/ComfyUi/python_embeded/python.exe" merge_lora.py \
  <model_extract.safetensors> \
  <clip_extract.safetensors> \
  <G:/CubricModels/loras/LTX2.3/output.safetensors>
```

Load the result with the standard **`LoraLoader`** node (model+clip), strength 1.0/1.0.
NOT `LoraLoaderModelOnly` — that drops the clip half.

## Notes

- Namespaces are disjoint (`diffusion_model.*` vs `text_encoders.*`), so the merge is a
  plain dict union — the script asserts no collision.
- Gemma's `vision_model.*` keys are dropped (LTX ignores the vision tower; they'd log as
  `NOT LOADED` and bloat the file).
- ComfyUI writes extracts to its `--output-directory` (check `run_nvidia_gpu.bat` — on
  this machine it's redirected to `D:\WORK\Images\Outputs`, NOT `output/loras/`).
