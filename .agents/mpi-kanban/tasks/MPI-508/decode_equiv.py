"""CPU-only proof that the reworked previewer decodes exactly like KJNodes.

No GPU, no generation: it loads the real taeh3 weight, decodes a tiny random
latent through both implementations and compares the pixels, then drives the
whole push() path with a stubbed PromptServer to count what would be sent.
"""
import importlib.util
import sys
import types
from pathlib import Path

import torch

COMFY = Path("c:/AI/Mpi/Cubric-Vision/engine/ComfyUI_windows_portable/ComfyUI")
NODES = Path("c:/AI/Mpi/ComfyUi-MpiNodes")
WEIGHT = Path("G:/CubricModels/vae/taeh3.safetensors")

sys.path.insert(0, str(COMFY))

# stub `server` so importing preview.py doesn't drag ComfyUI's whole web stack in
sent = []


class _Srv:
    last_node_id = "1"
    client_id = "test"

    def send_sync(self, kind, payload, *a):
        sent.append((kind, payload if isinstance(payload, dict) else len(payload)))


srv_mod = types.ModuleType("server")
srv_mod.PromptServer = types.SimpleNamespace(instance=_Srv())
srv_mod.BinaryEventTypes = types.SimpleNamespace(PREVIEW_IMAGE=1)
sys.modules["server"] = srv_mod

import comfy.model_management as mm  # noqa: E402
import comfy.utils  # noqa: E402

mm.get_torch_device = lambda: torch.device("cpu")
mm.intermediate_device = lambda: torch.device("cpu")

sys.path.insert(0, str(NODES))
import preview  # noqa: E402


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


kj = _load(COMFY / "custom_nodes/comfyui-kjnodes/nodes/tiny_vae.py", "kj_tiny_vae")

sd = comfy.utils.load_torch_file(str(WEIGHT), safe_load=True)

ours = preview._TAEHV(24)
ours.load_state_dict(sd)
ours = ours.eval().to(device="cpu", dtype=torch.float32)
theirs = kj.TAEHVDecoder(sd, device="cpu", dtype=torch.float32)
print("h3 detected by KJ:", theirs.is_h3, "| our patch_size:", ours.patch_size,
      "| latent_channels:", ours.latent_channels, "| t_upscale:", ours.t_upscale)

torch.manual_seed(0)
latent = torch.randn(1, 24, 17, 4, 4)

with torch.no_grad():
    mine = preview._decode_clip(ours, latent)          # [B,3,T,H,W]
    kjs = theirs._decode_h3_full(latent)               # [B,3,T,H,W]
    plain = ours.decode(latent)                        # what TAEHV.decode alone gives

print("ours  :", tuple(mine.shape))
print("kj    :", tuple(kjs.shape))
print("plain :", tuple(plain.shape), "(no per-chunk trim -> more frames, misaligned)")
assert mine.shape == kjs.shape, "frame count differs from KJNodes"
assert torch.allclose(mine, kjs, atol=1e-5), f"max diff {(mine - kjs).abs().max()}"
print("PIXELS MATCH KJNodes, max diff", float((mine - kjs).abs().max()))

# the old code path, for the record: C and T transposed by the reshape
old = latent.movedim(2, 1).reshape((-1,) + tuple(latent.shape[-3:])).unsqueeze(0)
with torch.no_grad():
    scrambled = ours.decode(old)
print("old path decoded", tuple(scrambled.shape), "from a C/T-transposed buffer;",
      "mean |diff| vs correct:", float((scrambled[:, :, :plain.shape[2]] - plain).abs().mean()))

# full push() path on the real flat-pack shape (video + audio), stubbed server
video = torch.randn(1, 24, 17, 4, 4)
audio = torch.randn(1, 32, 2, 93)
packed, shapes = comfy.utils.pack_latents([video, audio])
print("packed", tuple(packed.shape), "shapes", [list(s) for s in shapes])

vae = types.SimpleNamespace(first_stage_model=ours)
p = preview._TinyVaePreviewer(vae, 8.0, shapes)
with torch.no_grad():
    p.push(packed)
markers = [s for s in sent if s[0] == "VHS_latentpreview"]
frames = [s for s in sent if s[0] != "VHS_latentpreview"]
print("marker:", markers)
print("frames sent:", len(frames), "| first frame bytes:", frames[0][1])
assert len(markers) == 1 and markers[0][1]["length"] == mine.shape[2]
assert len(frames) == mine.shape[2]
with torch.no_grad():
    p.push(packed)
assert len([s for s in sent if s[0] == "VHS_latentpreview"]) == 1, "marker must be sent once"
print("second push sent", len(sent) - len(frames) - 1, "more frames, no second marker")
print("OK")
