# MPI-420 / ComfyUI #13366: does the TAESD previewer MUTATE the sampler's latent?
#
# The Krea2 doc (docs/models/krea2/preview-taesd.md) says installing lighttaew2_1
# corrupts real generations mid-sampling. We just shipped lighttaew2_2, which takes
# the same VIDEO_TAES branch. This does not trust the doc's 2026-07 snapshot or a
# GitHub PR status — it calls the exact previewer path on a known latent and diffs
# the tensor afterwards. Any change at all is the bug.
import sys, os
COMFY = os.path.abspath("engine/ComfyUI_windows_portable/ComfyUI")
sys.path.insert(0, COMFY)

import torch
import comfy.utils
from comfy.sd import VAE
from comfy.taesd.taesd import TAESD
from latent_preview import TAEHVPreviewerImpl, TAESDPreviewerImpl

SP = sys.argv[1]
torch.manual_seed(0)


def check(label, previewer, x0):
    before = x0.clone()
    try:
        previewer.decode_latent_to_preview(x0)
    except Exception as e:
        print(f"{label}: decode raised {type(e).__name__}: {e}")
        return
    same = torch.equal(before, x0)
    delta = (before - x0).abs().max().item()
    print(f"{label}: latent unchanged = {same}   max|delta| = {delta:.6g}")


# --- video branch: lighttaew2_2, the one the Krea2 doc warns about -------------
sd = comfy.utils.load_torch_file(os.path.join(SP, "lighttaew2_2.safetensors"))
vae = VAE(sd)
vae.first_stage_model.show_progress_bar = False
prev = TAEHVPreviewerImpl(vae)
# Wan 2.2 latent: [B, C=48, T, H, W]
x0 = torch.randn(1, 48, 3, 16, 16)
check("lighttaew2_2 (TAEHV/video path)", prev, x0)

# --- image branch: taef2, the FLUX.2 decoder ----------------------------------
taesd = TAESD(None, os.path.join(SP, "taef2_decoder.safetensors"), latent_channels=128)
prev2 = TAESDPreviewerImpl(taesd)
x1 = torch.randn(1, 128, 16, 16)
check("taef2_decoder (TAESD/image path)", prev2, x1)

# --- image branch control: taef1, shipped inside the portable bundle for months
taesd1 = TAESD(None, os.path.join(SP, "taef1_decoder.safetensors"), latent_channels=16)
prev3 = TAESDPreviewerImpl(taesd1)
x2 = torch.randn(1, 16, 16, 16)
check("taef1_decoder (TAESD/image path)", prev3, x2)
