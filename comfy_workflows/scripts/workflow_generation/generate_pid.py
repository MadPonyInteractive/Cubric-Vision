"""
generate_pid.py
NVIDIA PiD handler: ONE template → FOUR runtime files, one per VAE-locked path.

PiD ships four checkpoints (Flux1 / SD3 / Qwen-Image / SDXL) that share a graph
but not a latent space. The template (nvidia_pid_template.json) is a SINGLE
branch — the old four-branch graph with its `Input_Type` MpiAnySwitch is gone —
and each path is produced by baking THREE values:

  1. UNETLoader.unet_name          → the path's diffusion weight
  2. PiD_VAE.vae_name              → the matching architecture VAE
  3. PiDConditioning.latent_format → the latent space (flux/sd3/qwenimage/sdxl)

WHY FOUR FILES AND NOT ONE INJECTED GRAPH (MPI-507): each path becomes its own
installable plugin, so a user can hold the SDXL weight and not the other three.
`unet_name` is a COMBO fed by the diffusion_models folder listing, and ComfyUI's
validate_prompt rejects an unknown COMBO value on ANY node reachable from an
output — before execution, so lazy pruning never applies. A single graph naming
all four weights would therefore be rejected outright for a user holding one
plugin. One file per path names only its own weight and cannot hit that.

Everything else is identical across the four and stays in the template: gemma
CLIPLoader, the pixel_space VAELoader, KSamplerSelect (lcm), BasicScheduler
(simple / 4 steps / denoise 1.0), and the Input_Resolution switch that downscales
the finished 4096 image to 1k/2k/3k/4k.

No prune pass here — unlike the Boogu/Qwen benches, this template has no dead
nodes (all 25 are upstream of Output_Image), so there is nothing to drop.

Standalone:   python generate_pid.py
Orchestrated: build(source_path, out_dir)

Node lookup is by `_meta.title` — never by node id (ids change on every re-export).
The two VAELoaders are told apart by title: the architecture one is `PiD_VAE`,
the shared pixel-space one keeps the default `Load VAE` and is never touched.
"""

import json
import copy
from pathlib import Path

# ─── CONFIG ───────────────────────────────────────────────────────────────────
# template filename → list of (output_name, unet_name, vae_name, latent_format)
MODEL_VARIANTS = {
    "nvidia_pid_template.json": [
        ("nvidia_pid_flux.json",
         "pid_flux1_1024_to_4096_4step_bf16.safetensors", "ae.safetensors", "flux"),
        ("nvidia_pid_sd3.json",
         "pid_sd3_1024_to_4096_4step_bf16.safetensors", "sd3_vae.safetensors", "sd3"),
        ("nvidia_pid_qwen.json",
         "pid_qwenimage_1024_to_4096_4step_bf16.safetensors", "qwen_image_vae.safetensors", "qwenimage"),
        ("nvidia_pid_sdxl.json",
         "pid_sdxl_1024_to_4096_4step_bf16.safetensors", "sdxl_vae.safetensors", "sdxl"),
    ],
}
# ─── END CONFIG ───────────────────────────────────────────────────────────────

UNET_TITLE = "Load Diffusion Model"   # the single UNETLoader in the graph
VAE_TITLE = "PiD_VAE"                 # NOT the pixel_space loader, which keeps "Load VAE"
COND_TITLE = "PiD Conditioning"       # PiDConditioning's default display name (note the space)
SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

# latent_format is a fixed COMBO on PiDConditioning — a typo here bakes a value the
# engine rejects at prompt time, so check it against the node's own option list.
VALID_LATENT_FORMATS = {"flux", "sd3", "sdxl", "qwenimage"}


def _find_by_title(workflow: dict, title: str) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return node
    return None


def _generate_one(template_path: Path, output_name: str, unet_name: str,
                  vae_name: str, latent_format: str, out_dir: Path) -> Path | None:
    workflow = copy.deepcopy(json.loads(template_path.read_text(encoding="utf-8")))

    if latent_format not in VALID_LATENT_FORMATS:
        print(f"  [WARN] '{latent_format}' is not a PiDConditioning latent_format — skipping {output_name}")
        return None

    for title, key, value in (
        (UNET_TITLE, "unet_name", unet_name),
        (VAE_TITLE, "vae_name", vae_name),
        (COND_TITLE, "latent_format", latent_format),
    ):
        node = _find_by_title(workflow, title)
        if node is None:
            print(f"  [WARN] No '{title}' node in {template_path.name} — skipping {output_name}")
            return None
        node["inputs"][key] = value

    out_path = out_dir / output_name
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {output_name}  ({latent_format}, {unet_name}, {vae_name})")
    return out_path


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Build the four path files for the ONE template."""
    variants = MODEL_VARIANTS.get(source_path.name)
    if variants is None:
        print(f"  [WARN] {source_path.name} not in MODEL_VARIANTS — nothing to do")
        return []
    print(f"Template: {source_path.name}")
    written = [_generate_one(source_path, name, unet, vae, fmt, out_dir)
               for name, unet, vae, fmt in variants]
    return [p for p in written if p is not None]


def main() -> None:
    """Standalone: rebuild every PiD template from files alongside this script."""
    for template_name in MODEL_VARIANTS:
        template_path = SCRIPTS_DIR / template_name
        if not template_path.exists():
            template_path = WORKFLOWS_DIR / template_name
        if not template_path.exists():
            print(f"\n[SKIP] Template not found: {template_name}")
            continue
        print()
        build(template_path, WORKFLOWS_DIR)
    print("\nDone.")


if __name__ == "__main__":
    main()
