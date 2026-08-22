"""MPI-567: kill the visible box edge without killing the shadow.

edge_profile.py established the cause: the model RE-GRADES the whole crop (signed mean holds
its sign and grows with depth into the box), so this is not VAE round-trip drift and the
`ImageCompositeMasked` candidate in verdict.md is a no-op -- its mask would be the box, which
is exactly what InpaintStitchImproved already blends with.

Configs here attack the re-grade itself (denoise, prompt), ramp it (mask_blend_pixels,
feathered noise mask), or remove a pointless resample. Each is measured on TWO axes because
either one alone can be gamed:

  edge_step    mean |result-photo| in a 12px band just inside each non-border box edge.
               Under ~2 is invisible. This is the defect.
  shadow_ratio changed px outside the object's own bbox / that bbox's area. This is the
               feature. Baseline auto: sun 0.606, overcast 1.039, anime 0.780. A config that
               fixes the edge by suppressing the shadow has fixed nothing.

Judged on sun/overcast/anime only. Night and indoor are dark and low-contrast and
under-report -- see verdict.md and blending-into-a-photo.md Measuring the rectangle.

Usage:  python seamfix.py base,d085,d070,d055
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageDraw

O = L.O
PLATES = ["sun", "overcast", "anime"]
AUTO = (0.25, 0.60)          # the winning box: +25% out, +60% down
RESULTS = L.LP + "/seamfix_results.json"
BASELINE_SHADOW = {"sun": 0.606, "overcast": 1.039, "anime": 0.780}

UNET = "flux-2-klein-4b-int8-convrot.safetensors"
CLIP = "qwen_3_4b.safetensors"
VAE = "flux2-vae.safetensors"
SEED = 134002004938138
INPAINT_MODE = "\U0001F5BC️ Image Inpainting"

# Verbatim from run_lp.py -- the prompt the baseline was measured on.
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

# Nothing in BLEND_PHYSICS2 tells the model to leave the rest of the frame alone, and the
# overcast plate lifts a uniform +11 across the whole box. This adds that one instruction.
KEEP_REST = (" Do not relight, recolour or re-expose the rest of the photograph: every part "
             "of the image away from the object must keep exactly the brightness, colour and "
             "contrast it already has.")

# name -> overrides. denoise, blend (mask_blend_pixels), feather (noise-mask blur radius in
# px, 0 = hard rectangle), prompt_keep, rescale (False drops ImageScaleToTotalPixels).
CONFIGS = {
    "base":     {},
    "d085":     {"denoise": 0.85},
    "d070":     {"denoise": 0.70},
    "d055":     {"denoise": 0.55},
    # InpaintCropImproved caps mask_blend_pixels at 64. verdict.md proposed 96/128, which the
    # node cannot take: an out-of-range widget makes ComfyUI prune that branch and still
    # report status_str "success" in ~0.2s with nothing sampled and no error anywhere.
    "b048":     {"blend": 48},
    "b064":     {"blend": 64},
    # f* feather INWARD from the auto box: the ramp is paid for out of the shadow's room,
    # which is why overcast drops to 61% / 46% of baseline shadow.
    "f032":     {"feather": 32},
    "f096":     {"feather": 96},
    # g* feather OUTWARD: grow the box by F and feather by F, so the original auto box is
    # still at full denoise strength (shadow room intact) and the ramp lives in new margin.
    # GrowMaskWithBlur.blur_radius caps at 100, so grow 128 cannot be built -- it prunes the
    # branch and reports success with nothing sampled, exactly like blend 96 did.
    "g064":     {"grow": 64},
    "g096":     {"grow": 96},
    "g096k":    {"grow": 96, "prompt_keep": True},
    # CONTROL for g096: same grown box, HARD mask. At grow 96 the right edge falls off the
    # canvas on all three plates, so part of g096's gain is the seam leaving the image rather
    # than the ramp working. If this scores like g096, the feather is doing nothing.
    "g096hard": {"grow_only": 96},
    # Ramp wider than the node's 100px blur cap, by chaining two passes. On these plates only
    # the TOP edge survives this much growth -- left/right/bottom fall off the canvas.
    "g192":     {"grow_only": 192, "feather": 96, "passes": 2},
    # FOUR live edges on a real object case. The auto box grown by 96+ runs off the canvas,
    # so these use a tighter core (+12% instead of +25%/+60%) chosen so core+96 still fits:
    # object (233,665,696,987) -> core (178,626,751,1026) -> outer (82,530,847,1122).
    # Less shadow room than auto by construction; the point here is the seam, on all sides.
    # Ramp CENTRED on the auto box edge: grow only 96 (so the photo-change cost stays near
    # g096) but ramp 192 (so the gradient is as gentle as g192's). The interpolation between
    # "ramp outside, photo moves" and "ramp inside, shadow shrinks".
    "gc":       {"grow_only": 96, "feather": 96, "passes": 2},
    "s000":     {"core_frac": (0.12, 0.12)},
    "s096":     {"core_frac": (0.12, 0.12), "grow": 96},
    # 9B was judged better by eye on all five plates in session 7, but its SEAM was never
    # measured. It needs qwen_3_8b_int8_convrot -- pairing it with 4B's qwen_3_4b dies
    # with a shape error that reads as a LanPaint bug and is not one (MPI-600).
    "b9":       {"unet": "flux-2-klein-9b-int8-convrot.safetensors",
                 "clip": "qwen_3_8b_int8_convrot.safetensors"},
    "b9g096":   {"unet": "flux-2-klein-9b-int8-convrot.safetensors",
                 "clip": "qwen_3_8b_int8_convrot.safetensors", "grow": 96},
    "keeprest": {"prompt_keep": True},
    "norescale": {"rescale": False},
}


def build(stamped, mask_png, prefix, denoise=1.0, blend=32, feather=0, passes=1,
          prompt_keep=False, rescale=True, num_steps=2, unet=UNET, clip=CLIP):
    def n(nid, cls, inputs, title=None):
        g[str(nid)] = {"class_type": cls, "inputs": inputs, "_meta": {"title": title or cls}}
    g = {}
    text = BLEND_PHYSICS2 + (KEEP_REST if prompt_keep else "")
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
        "mask_blend_pixels": blend, "mask_hipass_filter": 0.1,
        "extend_for_outpainting": False, "extend_up_factor": 1.0,
        "extend_down_factor": 1.0, "extend_left_factor": 1.0, "extend_right_factor": 1.0,
        "context_from_mask_extend_factor": 1.0, "output_resize_to_target_size": True,
        "output_target_width": 1024, "output_target_height": 1024,
        "output_padding": "32", "device_mode": "gpu (much faster)"})
    if rescale:
        n(5, "ImageScaleToTotalPixels", {"image": ["4", 1], "upscale_method": "nearest-exact",
                                         "megapixels": 1.0, "resolution_steps": 16})
        pixels = ["5", 0]
    else:
        # The crop already comes out at output_target 1024x1024; scaling it to 1.0 MP
        # downsamples to ~1008 and the stitch upsamples it straight back.
        pixels = ["4", 1]
    n(6, "VAELoader", {"vae_name": VAE})
    n(7, "VAEEncode", {"pixels": pixels, "vae": ["6", 0]}, "Encode ref 1")
    n(8, "CLIPLoader", {"clip_name": clip, "type": "flux2", "device": "default"})
    n(9, "CLIPTextEncode", {"clip": ["8", 0], "text": text})
    n(10, "ReferenceLatent", {"conditioning": ["9", 0], "latent": ["7", 0]})
    n(11, "FluxGuidance", {"conditioning": ["10", 0], "guidance": 4.0})
    n(12, "ConditioningZeroOut", {"conditioning": ["9", 0]})
    if feather:
        # Shrink by R then blur by R: the mask ramps 0 -> 1 from the box edge inward, so the
        # re-grade fades out instead of stepping. Crop/stitch keep the hard rectangle.
        # blur_radius caps at 100, so a wider ramp than that has to be chained.
        noise_mask = ["4", 2]
        for i in range(passes):
            nid = 19 + i
            n(nid, "GrowMaskWithBlur", {
                "mask": noise_mask, "expand": -feather, "incremental_expandrate": 0.0,
                "tapered_corners": True, "flip_input": False,
                "blur_radius": float(feather), "lerp_alpha": 1.0, "decay_factor": 1.0},
              "feather noise mask %d/%d" % (i + 1, passes))
            noise_mask = [str(nid), 0]
    else:
        noise_mask = ["4", 2]
    n(13, "SetLatentNoiseMask", {"samples": ["7", 0], "mask": noise_mask})
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


# --- metrics ----------------------------------------------------------------
def edge_step(photo, res, box, size):
    """mean |diff| in a 12px band inside each box edge that is NOT the image border."""
    d = L._diff_L(photo, res)
    W, H = size
    x0, y0, x1, y1 = box
    rects = {"top": (x0, y0, x1, y0 + 12), "bottom": (x0, y1 - 12, x1, y1),
             "left": (x0, y0, x0 + 12, y1), "right": (x1 - 12, y0, x1, y1)}
    border = {"top": y0 <= 0, "bottom": y1 >= H, "left": x0 <= 0, "right": x1 >= W}
    out = {}
    for name, rect in rects.items():
        if border[name]:
            out[name] = None
            continue
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).rectangle(rect, fill=255)
        out[name] = round(L._mean(d, m), 2)
    return out


def shadow_ratio(photo, stamped, res, size):
    obj, _ = L.changed_bbox(photo, stamped)
    d = L._diff_L(photo, res).point(lambda v: 255 if v > L.CHANGE_T else 0)
    m = Image.new("L", size, 255)
    ImageDraw.Draw(m).rectangle(obj, fill=0)
    px = d.histogram(m)[255]
    area = max(1, (obj[2] - obj[0]) * (obj[3] - obj[1]))
    return round(px / area, 3)


def outside_mean(photo, res, box, size):
    d = L._diff_L(photo, res)
    m = Image.new("L", size, 255)
    ImageDraw.Draw(m).rectangle(box, fill=0)
    return round(L._mean(d, m), 3)


def load_results():
    if os.path.exists(RESULTS):
        return json.load(open(RESULTS, encoding="utf-8"))
    return []


def grow_px(box, size, n):
    """Grow a box by n px on every side, clamped to the image."""
    W, H = size
    x0, y0, x1, y1 = box
    return (max(0, x0 - n), max(0, y0 - n), min(W, x1 + n), min(H, y1 + n))


def find_on_disk(prefix):
    """Existing SaveImage output for a config/plate, so a crashed run costs no GPU twice."""
    got = sorted(f for f in os.listdir(O) if f.startswith(prefix) and f.endswith(".png"))
    return got[-1] if got else None


def main():
    os.makedirs(L.LP, exist_ok=True)
    remeasure = "--remeasure" in sys.argv
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    names = argv[0].split(",") if argv else ["base"]
    for nm in names:
        if nm not in CONFIGS:
            raise SystemExit("unknown config %r; have %s" % (nm, ",".join(CONFIGS)))
    rows = load_results()
    keep = [r for r in rows if r["config"] not in names]

    for nm in names:
        cfg = CONFIGS[nm]
        print("\n=== %s  %s ===" % (nm, json.dumps(cfg) if cfg else "(baseline)"))
        print("  %-9s %6s  %7s %7s %7s %7s   %7s %7s  %s"
              % ("plate", "secs", "top", "bottom", "left", "right",
                 "shadow", "outside", "worst"))
        for tag in PLATES:
            photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
            stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
            bb, size = L.changed_bbox(photo, stamped)
            core = L.grow_box(bb, size, *cfg.get("core_frac", AUTO))
            # A `grow` config moves the CUT outward and feathers back to the core box, so the
            # seam to measure is the outer edge -- that is where the stitch meets real photo.
            grow = cfg.get("grow", 0) or cfg.get("grow_only", 0)
            kw = {k: v for k, v in cfg.items()
                  if k not in ("grow", "grow_only", "core_frac")}
            if grow:
                box = grow_px(core, size, grow)
                if "grow" in cfg:            # grow_only = same box, hard mask (the control)
                    kw["feather"] = grow
            else:
                box = core
            mp = "%s/box_%s_%s.png" % (L.LP, tag, nm)
            L.write_mask(box, size, mp)
            prefix = "mpi567_sf_%s_%s" % (nm, tag)
            if remeasure:
                got = find_on_disk(prefix)
                if not got:
                    print("  %-9s no file on disk for %s" % (tag, prefix))
                    continue
                r = {"files": [got], "secs": 0.0}
            else:
                g = build(stamped, mp, prefix, **kw)
                try:
                    r = L.queue(g)
                except Exception as e:
                    print("  %-9s FAILED %s" % (tag, str(e)[:500]))
                    continue
            # Take OUR SaveImage, not whatever else the graph emitted: a large
            # mask_blend_pixels makes InpaintStitchImproved emit a temp preview, which
            # lands in <comfy>/temp and is not in O at all.
            mine = [f for f in r["files"] if f.startswith(prefix)]
            if not mine:
                # Never let this read as a result. A pruned branch reports success.
                raise SystemExit(
                    "config %r plate %r: SaveImage produced nothing in %.1fs (files=%s). "
                    "The sampler branch never ran -- check every widget against "
                    "/object_info for an out-of-range value." % (nm, tag, r["secs"], r["files"]))
            out = "%s/%s" % (O, mine[-1])
            st = edge_step(photo, out, box, size)
            sh = shadow_ratio(photo, stamped, out, size)
            om = outside_mean(photo, out, box, size)
            worst = max(v for v in st.values() if v is not None)
            base_sh = BASELINE_SHADOW[tag]
            flag = "EDGE OK" if worst < 2 else ""
            if sh < base_sh * 0.8:
                flag += "  SHADOW LOST (%.0f%% of baseline)" % (100 * sh / base_sh)
            print("  %-9s %6.1f  %7s %7s %7s %7s   %7.3f %7.3f  %6.2f %s"
                  % (tag, r["secs"], st["top"], st["bottom"], st["left"], st["right"],
                     sh, om, worst, flag))
            keep.append({"config": nm, "overrides": cfg, "tag": tag, "box": list(box),
                         "file": os.path.basename(out), "secs": r["secs"], "edge_step": st,
                         "shadow_ratio": sh, "outside_mean": om, "worst_edge": worst})

        # Save after every config: a crash in a later one must not cost the earlier GPU time.
        json.dump(keep, open(RESULTS, "w", encoding="utf-8"), indent=1)

    print("\nwrote", RESULTS)


if __name__ == "__main__":
    main()
