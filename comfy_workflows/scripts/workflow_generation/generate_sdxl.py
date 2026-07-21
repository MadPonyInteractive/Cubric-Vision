"""
generate_sdxl.py  (was generate_workflows.py)
SDXL handler: generates per-model workflow JSONs from a template by swapping the
checkpoint model. One template → N model variants.

Standalone:  python generate_sdxl.py        # rebuilds ALL templates
Orchestrated: build(source_path, out_dir)    # rebuilds only the matching template

Node lookup is by `_meta.title` ("Checkpoint") — never by node id.
"""

import json
import copy
from pathlib import Path

# ─── CONFIG ──────────────────────────────────────────────────────────────────
# template filename → list of (output_name, ckpt_name)
MODEL_VARIANTS = {
    "sdxl_t2i_template.json": [
        ("t2i_sdxl_realistic.json",        "SDXL_Realistic.safetensors"),
        ("t2i_sdxl_nsfw.json",             "SDXL_NSFW.safetensors"),
        ("t2i_ill_anime_beauty.json",      "ILL_Anime_Beauty.safetensors"),
        ("t2i_ill_anime.json",             "ILL_Anime.safetensors"),
        ("t2i_pony_mix.json",              "PONY_Mix.safetensors"),
    ],
    "sdxl_upscaler_template.json": [
        ("upscaler_sdxl_realistic.json",   "SDXL_Realistic.safetensors"),
        ("upscaler_sdxl_nsfw.json",        "SDXL_NSFW.safetensors"),
        ("upscaler_ill_anime_beauty.json", "ILL_Anime_Beauty.safetensors"),
        ("upscaler_ill_anime.json",        "ILL_Anime.safetensors"),
        ("upscaler_pony_mix.json",         "PONY_Mix.safetensors"),
    ],
    "sdxl_detailer_template.json": [
        ("detailer_sdxl_realistic.json",   "SDXL_Realistic.safetensors"),
        ("detailer_sdxl_nsfw.json",        "SDXL_NSFW.safetensors"),
        ("detailer_ill_anime_beauty.json", "ILL_Anime_Beauty.safetensors"),
        ("detailer_ill_anime.json",        "ILL_Anime.safetensors"),
        ("detailer_pony_mix.json",         "PONY_Mix.safetensors"),
    ],
}
# ─── END CONFIG ───────────────────────────────────────────────────────────────

CHECKPOINT_TITLE = "Checkpoint"
SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

# The t2i graph now serves t2i + i2i (one graph, Input_Is_i2i flips the latent
# source — same pattern as krea2/chroma). The Input_Is_i2i boolean can't be trusted
# from a raw export, so we force it false here on every runtime (guarded — no-op on
# the upscaler/detailer graphs which have no Input_Is_i2i). MPI-272: the optional
# image input is now a self-gating MpiLoadImageFromPath — no placeholder stamp.
IS_I2I_TITLE = "Input_Is_i2i"


def _find_by_title(workflow: dict, title: str) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return node
    return None


def _force_t2i_default(workflow: dict) -> None:
    """Force the t2i/i2i switch boolean to false. The i2i op injects true at submit;
    a plain t2i injects nothing and depends on this baked false. A template exported
    during an i2i test bakes true, which would make every t2i run as i2i. No-op on
    graphs without the node (upscaler/detailer)."""
    node = _find_by_title(workflow, IS_I2I_TITLE)
    if node is None:
        return
    before = node["inputs"].get("boolean")
    node["inputs"]["boolean"] = False
    if before is not False:
        print(f"  [I2I]   {IS_I2I_TITLE}.boolean: {before!r} -> False")


def _generate_one(template_path: Path, output_name: str, ckpt_name: str, out_dir: Path) -> Path | None:
    workflow = copy.deepcopy(json.loads(template_path.read_text(encoding="utf-8")))
    node = _find_by_title(workflow, CHECKPOINT_TITLE)
    if node is None:
        print(f"  [WARN] No '{CHECKPOINT_TITLE}' node in {template_path.name} — skipping {output_name}")
        return None
    node["inputs"]["ckpt_name"] = ckpt_name
    _force_t2i_default(workflow)
    out_path = out_dir / output_name
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {output_name}")
    return out_path


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Build variants for the ONE template named by source_path."""
    variants = MODEL_VARIANTS.get(source_path.name)
    if variants is None:
        print(f"  [WARN] {source_path.name} not in MODEL_VARIANTS — nothing to do")
        return []
    print(f"Template: {source_path.name}")
    written = [_generate_one(source_path, name, ckpt, out_dir) for name, ckpt in variants]
    return [p for p in written if p is not None]


def main() -> None:
    """Standalone: rebuild every template from files alongside this script."""
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
