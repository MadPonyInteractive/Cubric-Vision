# MPI-420: build a ComfyUI-format taef2_decoder.safetensors from the official
# madebyollin/taef2 combined file, then PROVE it by strict-loading it into the
# exact class ComfyUI's previewer uses.
import sys, os, hashlib

COMFY = os.path.abspath("engine/ComfyUI_windows_portable/ComfyUI")
sys.path.insert(0, COMFY)

import torch
import safetensors.torch as stt
from comfy.taesd.taesd import TAESD

SP = sys.argv[1]
SRC = os.path.join(SP, "taef2.safetensors")
OUT = os.path.join(SP, "taef2_decoder.safetensors")

sd = stt.load_file(SRC)
print("source tensors:", len(sd))

# madebyollin's own convert_diffusers_sd_to_taesd: decoder indices shift by +1
# (ComfyUI's Decoder is an nn.Sequential whose element 0 is a Clamp layer).
out = {}
for k, v in sd.items():
    encdec, _layers, index, *suffix = k.split(".")
    if encdec != "decoder":
        continue
    out[".".join([str(int(index) + 1), *suffix])] = v.contiguous()
print("decoder tensors:", len(out))

stt.save_file(out, OUT)

# The real proof: load_state_dict is STRICT, so a wrong key set or a wrong shape
# fails here rather than mid-generation on a user's machine.
taesd = TAESD(None, OUT, latent_channels=128)
print("strict load into TAESD(latent_channels=128): OK")

# And it has to actually decode. 128-channel latent, 1/16 spatial.
with torch.no_grad():
    x = torch.zeros(1, 128, 8, 8)
    img = taesd.decode(x)
print("decode() output shape:", tuple(img.shape))

h = hashlib.sha256(open(OUT, "rb").read()).hexdigest()
print("OUT bytes:", os.path.getsize(OUT))
print("OUT sha256:", h)
