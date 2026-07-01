"""Merge a model-side and clip-side extracted LoRA into one .safetensors.

Second half of the LTX LoRA-merge flow (see docs/builder/research/lora-merge-ltx.md).
The KJNodes LoraExtractKJ node writes the model delta (diffusion_model.* keys) and the
clip delta (text_encoders.* keys) as TWO separate files. Their key namespaces are
disjoint, so combining is a plain dict union — no math, no collision.

Gemma's vision tower (vision_model.*) is dropped: LTX only conditions on Gemma's text
half, and those keys otherwise log as NOT LOADED and bloat the file.

Usage:
    python merge_lora.py <model.safetensors> <clip.safetensors> <out.safetensors>
"""
import sys
from safetensors.torch import load_file, save_file

model_f, clip_f, out_f = sys.argv[1], sys.argv[2], sys.argv[3]
sd = load_file(model_f)
clip = load_file(clip_f)

# LTX uses Gemma's text half only; vision_model.* keys are dead weight the app logs as NOT LOADED.
clip = {k: v for k, v in clip.items() if "vision_model" not in k}

dup = set(sd) & set(clip)
assert not dup, f"key collision (unexpected): {list(dup)[:5]}"  # disjoint prefixes, asserts the assumption

n_model = len(sd)
sd.update(clip)
save_file(sd, out_f)
print(f"merged {n_model} model + {len(clip)} clip (vision dropped) = {len(sd)} keys -> {out_f}")
