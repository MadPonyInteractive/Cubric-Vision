"""Build Klein t2i + edit workflows as LiteGraph files loadable in the ComfyUI UI.

Conventions copied from krea2_t2i_template.json:
  Input_* titles on Mpi* nodes (the app's injection targets)
  6 user LoRA slots (MpiLoraModel chain, lora_name 'None')
  Input_Positive / Input_Seed / Input_Width / Input_Height
  Output_Image on the capture node
Klein-specific (proven MPI-353):
  cfg 1.0, euler, 8 steps, ConditioningZeroOut for the negative (neg is dead at cfg 1)
  Flux2Scheduler sigmas + SamplerCustomAdvanced
  edit = ReferenceLatent chain, sampler starts from the source latent

Run: python build_klein_ops.py    -> writes into the bench workflows folder
"""
import json, os

OUT = r"G:/ComfyUi/ComfyUI/user/default/workflows"

# LoRA folder prefix for this family (matches dep layout loras/<family>/)
LORA_DIR = "flux2-klein\\"


class G:
    """Minimal LiteGraph builder: nodes on a grid, links auto-numbered."""

    def __init__(self):
        self.nodes, self.links, self.nid, self.lid = [], [], 0, 0

    def add(self, type_, title=None, widgets=None, pos=(0, 0), size=(340, 90)):
        self.nid += 1
        n = {
            "id": self.nid, "type": type_, "pos": list(pos), "size": list(size),
            "flags": {}, "order": self.nid, "mode": 0,
            "inputs": [], "outputs": [],
            "properties": {"Node name for S&R": type_},
            "widgets_values": widgets or [],
        }
        if title:
            n["title"] = title
        self.nodes.append(n)
        return n

    def out(self, node, name, type_):
        node["outputs"].append({"name": name, "type": type_, "links": [], "slot_index": len(node["outputs"])})
        return (node, len(node["outputs"]) - 1)

    def inp(self, node, name, type_, src=None):
        slot = {"name": name, "type": type_, "link": None}
        node["inputs"].append(slot)
        if src is not None:
            self.link(src, node, len(node["inputs"]) - 1)
        return slot

    def link(self, src, dst_node, dst_slot):
        src_node, src_slot = src
        self.lid += 1
        self.links.append([self.lid, src_node["id"], src_slot, dst_node["id"], dst_slot,
                           src_node["outputs"][src_slot]["type"]])
        src_node["outputs"][src_slot]["links"].append(self.lid)
        dst_node["inputs"][dst_slot]["link"] = self.lid

    def dump(self, path):
        g = {"last_node_id": self.nid, "last_link_id": self.lid,
             "nodes": self.nodes, "links": self.links, "groups": [],
             "config": {}, "extra": {}, "version": 0.4}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(g, f, indent=1)
        print("wrote", path, f"({len(self.nodes)} nodes)")


def backbone(g, x=0):
    """Loaders + 6-slot user LoRA chain + text encode. Returns handles."""
    unet = g.add("UNETLoader", "Load Diffusion Model",
                 ["flux-2-klein-4b.safetensors", "default"], (x, 0))
    m = g.out(unet, "MODEL", "MODEL")

    # baked outpaint LoRA (mandatory for outpaint, harmless elsewhere)
    baked = g.add("LoraLoaderModelOnly", "Klein Outpaint LoRA",
                  [LORA_DIR + "flux2-klein-4b-outpaint.safetensors", 1.1], (x, 120))
    g.inp(baked, "model", "MODEL", m)
    m = g.out(baked, "MODEL", "MODEL")

    # 6 user LoRA slots, chained
    for i in range(1, 7):
        n = g.add("MpiLoraModel", f"Input_Lora_{i}", ["None", 1], (x, 240 + i * 110))
        g.inp(n, "model", "MODEL", m)
        m = g.out(n, "MODEL", "MODEL")

    clip = g.add("CLIPLoader", "Load CLIP",
                 ["qwen_3_4b.safetensors", "flux2", "default"], (x, 960))
    c = g.out(clip, "CLIP", "CLIP")

    vae = g.add("VAELoader", "Load VAE", ["flux2-vae.safetensors"], (x, 1080))
    v = g.out(vae, "VAE", "VAE")

    prompt = g.add("MpiText", "Input_Positive", ["a photograph of a fox in autumn woods"], (x + 380, 960))
    p = g.out(prompt, "STRING", "STRING")

    enc = g.add("CLIPTextEncode", "CLIP Text Encode (Prompt)", [""], (x + 760, 960))
    g.inp(enc, "clip", "CLIP", c)
    g.inp(enc, "text", "STRING", p)
    pos = g.out(enc, "CONDITIONING", "CONDITIONING")

    # negative is DEAD at cfg 1.0 -> zero it out rather than expose a useless box
    zero = g.add("ConditioningZeroOut", "Conditioning Zero Out", [], (x + 760, 1080))
    g.inp(zero, "conditioning", "CONDITIONING", pos)
    neg = g.out(zero, "CONDITIONING", "CONDITIONING")

    return dict(model=m, clip=c, vae=v, pos=pos, neg=neg, enc=enc)


def sampler(g, b, sigmas_src, latent_src, x=1600):
    """CFGGuider + SamplerCustomAdvanced at Klein's proven settings."""
    guider = g.add("CFGGuider", "CFGGuider", [1], (x, 0))
    g.inp(guider, "model", "MODEL", b["model"])
    g.inp(guider, "positive", "CONDITIONING", b["pos"])
    g.inp(guider, "negative", "CONDITIONING", b["neg"])
    gd = g.out(guider, "GUIDER", "GUIDER")

    sel = g.add("KSamplerSelect", "KSamplerSelect", ["euler"], (x, 140))
    sp = g.out(sel, "SAMPLER", "SAMPLER")

    seed = g.add("MpiInt", "Input_Seed", [891976866874171], (x, 260))
    sd = g.out(seed, "INT", "INT")

    noise = g.add("RandomNoise", "RandomNoise", [0, "fixed"], (x, 380))
    g.inp(noise, "noise_seed", "INT", sd)
    nz = g.out(noise, "NOISE", "NOISE")

    smp = g.add("SamplerCustomAdvanced", "SamplerCustomAdvanced", [], (x + 380, 0))
    g.inp(smp, "noise", "NOISE", nz)
    g.inp(smp, "guider", "GUIDER", gd)
    g.inp(smp, "sampler", "SAMPLER", sp)
    g.inp(smp, "sigmas", "SIGMAS", sigmas_src)
    g.inp(smp, "latent_image", "LATENT", latent_src)
    return g.out(smp, "LATENT", "LATENT")


def finish(g, b, lat, x=2400, prefix="klein"):
    dec = g.add("VAEDecode", "VAEDecode", [], (x, 0))
    g.inp(dec, "samples", "LATENT", lat)
    g.inp(dec, "vae", "VAE", b["vae"])
    img = g.out(dec, "IMAGE", "IMAGE")

    save = g.add("SaveImage", "Output_Image", [prefix], (x + 380, 0), size=(420, 460))
    g.inp(save, "images", "IMAGE", img)
    return img


def build_t2i():
    g = G()
    b = backbone(g)

    w = g.add("MpiInt", "Input_Width", [1024], (400, 0))
    h = g.add("MpiInt", "Input_Height", [1024], (400, 120))
    ws, hs = g.out(w, "INT", "INT"), g.out(h, "INT", "INT")

    lat = g.add("EmptyFlux2LatentImage", "Empty Latent", [1024, 1024, 1], (800, 0))
    g.inp(lat, "width", "INT", ws)
    g.inp(lat, "height", "INT", hs)
    ls = g.out(lat, "LATENT", "LATENT")

    sch = g.add("Flux2Scheduler", "Flux2Scheduler", [8, 1024, 1024], (800, 160))
    g.inp(sch, "width", "INT", ws)
    g.inp(sch, "height", "INT", hs)
    sg = g.out(sch, "SIGMAS", "SIGMAS")

    out = sampler(g, b, sg, ls)
    finish(g, b, out, prefix="klein_t2i")
    g.dump(os.path.join(OUT, "klein_t2i.json"))


def build_edit(n_refs=2):
    """Edit with n reference images. Chained ReferenceLatent = multi-ref (proven)."""
    g = G()
    b = backbone(g)

    cond = b["pos"]
    first_lat = None
    for i in range(1, n_refs + 1):
        ld = g.add("MpiLoadImageFromPath", f"Input_Image_{i}",
                   ["", "alpha", i == 1], (400, (i - 1) * 320))
        im = g.out(ld, "IMAGE", "IMAGE")
        g.out(ld, "MASK", "MASK")
        g.out(ld, "INT", "INT")
        g.out(ld, "INT", "INT")

        enc = g.add("VAEEncode", f"Encode ref {i}", [], (780, (i - 1) * 320))
        g.inp(enc, "pixels", "IMAGE", im)
        g.inp(enc, "vae", "VAE", b["vae"])
        el = g.out(enc, "LATENT", "LATENT")
        if first_lat is None:
            first_lat = el

        ref = g.add("ReferenceLatent", f"Set Reference Latent {i}", [], (1140, (i - 1) * 320))
        g.inp(ref, "conditioning", "CONDITIONING", cond)
        g.inp(ref, "latent", "LATENT", el)
        cond = g.out(ref, "CONDITIONING", "CONDITIONING")

    b["pos"] = cond  # guider must see the reference-carrying conditioning

    sch = g.add("Flux2Scheduler", "Flux2Scheduler", [8, 1024, 1024], (1140, 700))
    sg = g.out(sch, "SIGMAS", "SIGMAS")

    out = sampler(g, b, sg, first_lat)   # start from ref 1 = the image being edited
    finish(g, b, out, prefix="klein_edit")
    g.dump(os.path.join(OUT, f"klein_edit_{n_refs}ref.json"))


if __name__ == "__main__":
    build_t2i()
    build_edit(2)
    build_edit(3)
