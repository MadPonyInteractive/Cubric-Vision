"""MPI-567: does LanPaint replace the relight + the ~25-node composite-back tail?

Route under test (shape A'): the stage-1 STAMPED composite goes in as the base, a BOX mask
marks where the model may work, InpaintCropImproved crops to it, LanPaint_KSampler denoises
only the masked region with the whole crop as a Flux.2 reference latent, and
InpaintStitchImproved puts it back. No whole-image relight, no difference-mask tail.

Wiring copied from Fabio's two bench workflows, not invented:
  LanPaint.json          -> the sampler's own wiring + settled widget values
  klein_t2i_template.json -> the crop/stitch wrapper and its tuned InpaintCrop settings
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L

O = L.O
TAGS = ["sun", "overcast", "night", "indoor", "anime"]

# out_frac, extra down_frac -- how much room the box gives the shadow.
VARIANTS = {
    "tight":    (0.02, 0.02),
    "auto":     (0.25, 0.60),
    "generous": (0.60, 1.20),
}

BLEND_PHYSICS2 = (
    "Place the object into the scene so it looks like it was always part of it, not "
    "pasted on: match the scene's lighting direction, colour temperature, contrast "
    "and art style, and let the scene's light and shadows fall across it. Ground it "
    "with contact shading where it meets the surface. Any cast shadow must follow the "
    "scene's own light in direction, length and softness; if the light is overhead or "
    "comes from behind the camera, keep the shadow small and directly beneath it, and "
    "if the light comes from behind the object, let its own edges catch that light "
    "instead of casting a shadow toward the camera. Do not add glow, haze, or an "
    "outline of light around it. Let nearby foreground elements overlap its edges. "
    "Keep the object's shape and design.")

UNET = "flux-2-klein-4b-int8-convrot.safetensors"
CLIP = "qwen_3_4b.safetensors"
VAE = "flux2-vae.safetensors"
SEED = 134002004938138
INPAINT_MODE = "\U0001F5BC️ Image Inpainting"


def build(stamped, mask_png, prefix, denoise=1.0, num_steps=2, unet=UNET, clip=CLIP):
    def n(nid, cls, inputs, title=None):
        g[str(nid)] = {"class_type": cls, "inputs": inputs, "_meta": {"title": title or cls}}
    g = {}
    n(1, "MpiLoadImageFromPath",
      {"string": stamped, "channel": "alpha", "block_if_empty": False}, "stamped")
    n(2, "MpiLoadImageFromPath",
      {"string": mask_png, "channel": "red", "block_if_empty": False}, "box mask")
    n(3, "MpiMaskSquareBbox", {"mask": ["2", 1], "padding": 64})
    n(4, "InpaintCropImproved", {
        "image": ["1", 0], "mask": ["2", 1], "optional_context_mask": ["3", 0],
        "downscale_algorithm": "bilinear", "upscale_algorithm": "bicubic",
        "preresize": False, "preresize_mode": "ensure minimum resolution",
        "preresize_min_width": 1024, "preresize_min_height": 1024,
        "preresize_max_width": 16384, "preresize_max_height": 16384,
        "mask_fill_holes": False, "mask_expand_pixels": 6, "mask_invert": False,
        "mask_blend_pixels": 32, "mask_hipass_filter": 0.1,
        "extend_for_outpainting": False, "extend_up_factor": 1.0,
        "extend_down_factor": 1.0, "extend_left_factor": 1.0, "extend_right_factor": 1.0,
        "context_from_mask_extend_factor": 1.0, "output_resize_to_target_size": True,
        "output_target_width": 1024, "output_target_height": 1024,
        "output_padding": "32", "device_mode": "gpu (much faster)"})
    n(5, "ImageScaleToTotalPixels", {"image": ["4", 1], "upscale_method": "nearest-exact",
                                     "megapixels": 1.0, "resolution_steps": 16})
    n(6, "VAELoader", {"vae_name": VAE})
    n(7, "VAEEncode", {"pixels": ["5", 0], "vae": ["6", 0]}, "Encode ref 1")
    n(8, "CLIPLoader", {"clip_name": clip, "type": "flux2", "device": "default"})
    n(9, "CLIPTextEncode", {"clip": ["8", 0], "text": BLEND_PHYSICS2})
    n(10, "ReferenceLatent", {"conditioning": ["9", 0], "latent": ["7", 0]})
    n(11, "FluxGuidance", {"conditioning": ["10", 0], "guidance": 4.0})
    n(12, "ConditioningZeroOut", {"conditioning": ["9", 0]})
    n(13, "SetLatentNoiseMask", {"samples": ["7", 0], "mask": ["4", 2]})
    n(14, "UNETLoader", {"unet_name": unet, "weight_dtype": "default"})
    n(15, "LanPaint_KSampler", {
        "model": ["14", 0], "seed": SEED, "steps": 4, "cfg": 1.0,
        "sampler_name": "euler", "scheduler": "simple",
        "positive": ["11", 0], "negative": ["12", 0], "latent_image": ["13", 0],
        "denoise": denoise, "LanPaint_NumSteps": num_steps,
        "LanPaint_PromptMode": "Image First",
        "LanPaint_Info": "LanPaint KSampler.", "Inpainting_mode": INPAINT_MODE})
    n(16, "VAEDecode", {"samples": ["15", 0], "vae": ["6", 0]})
    n(17, "InpaintStitchImproved", {"stitcher": ["4", 0], "inpainted_image": ["16", 0]})
    n(18, "SaveImage", {"images": ["17", 0], "filename_prefix": prefix})
    return g


def main():
    os.makedirs(L.LP, exist_ok=True)
    only = sys.argv[1].split(",") if len(sys.argv) > 1 else TAGS
    rows = []
    for tag in only:
        photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
        stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
        bb, size = L.changed_bbox(photo, stamped)
        print("[%s] object bbox %s in %s" % (tag, bb, size))
        for vname, (out_f, down_f) in VARIANTS.items():
            box = L.grow_box(bb, size, out_f, down_f)
            mp = "%s/box_%s_%s.png" % (L.LP, tag, vname)
            L.write_mask(box, size, mp)
            prefix = "mpi567_lp_%s_%s" % (tag, vname)
            g = build(stamped, mp, prefix)
            try:
                r = L.queue(g)
            except Exception as e:
                print("  %-9s FAILED %s" % (vname, str(e)[:400]))
                rows.append((tag, vname, box, None, None, str(e)[:80]))
                continue
            out = "%s/%s" % (O, r["files"][-1])
            m_auto = L.seam(photo, out)
            m_box = L.seam(photo, out, box=box)
            print("  %-9s box=%s %5.1fs  auto[fill %.3f ring %5.2f bg %5.2f]  "
                  "boxanchored[fill %.3f ring %5.2f bg %5.2f]  %s"
                  % (vname, box, r["secs"], m_auto["fill"], m_auto["ring"], m_auto["bg_mean"],
                     m_box["fill"], m_box["ring"], m_box["bg_mean"], r["files"][-1]))
            rows.append((tag, vname, box, m_auto, m_box, r["files"][-1]))
    with open(L.LP + "/results.json", "w", encoding="utf-8") as f:
        json.dump([{"tag": t, "variant": v, "box": b, "auto": a, "box_anchored": x,
                    "file": fn} for (t, v, b, a, x, fn) in rows], f, indent=1)
    print("\nwrote", L.LP + "/results.json")


if __name__ == "__main__":
    main()
