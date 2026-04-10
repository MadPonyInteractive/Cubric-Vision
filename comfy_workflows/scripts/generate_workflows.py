"""
generate_workflows.py
Generates ComfyUI workflow JSON files from templates by swapping the checkpoint model.

Usage:
    python generate_workflows.py

Edit the WORKFLOWS list below to add/remove templates and their model variants.
All output files are written to the comfy_workflows/ folder (one level up from this script).
"""

import json
import copy
from pathlib import Path

# ─── CONFIG ──────────────────────────────────────────────────────────────────

WORKFLOWS = [
    {
        "template": "sdxl_t2i_template.json",
        "models": [
            ("sdxl_t2i_Lustify7.json",         "SDXL\\lustify_7.safetensors"),
            ("ill_t2i_AlchemyMix176.json",       "ILL\\ramthrustsNSFWPINK_alchemyMix176.safetensors"),
            ("ill_t2i_AnimeMixV80.json",        "ILL\\animemix_v80.safetensors"),
            ("pony_t2i_AnimerJeiV30.json",      "PONY\\animergemeij_v30VAE.safetensors"),
        ],
    },
    {
        "template": "sdxl_upscaler_template.json",
        "models": [
            ("sdxl_upscaler_Lustify7.json",     "SDXL\\lustify_7.safetensors"),
            ("ill_upscaler_AlchemyMix176.json","ILL\\ramthrustsNSFWPINK_alchemyMix176.safetensors"),
            ("ill_upscaler_AnimeMixV80.json",  "ILL\\animemix_v80.safetensors"),
            ("pony_upscaler_AnimerJeiV30.json", "PONY\\animergemeij_v30VAE.safetensors"),
        ],
    },
    {
        "template": "sdxl_detailer_template.json",
        "models": [
            ("sdxl_detailer_Lustify7.json",     "SDXL\\lustify_7.safetensors"),
            ("ill_detailer_AlchemyMix176.json","ILL\\ramthrustsNSFWPINK_alchemyMix176.safetensors"),
            ("ill_detailer_AnimeMixV80.json",  "ILL\\animemix_v80.safetensors"),
            ("pony_detailer_AnimerJeiV30.json", "PONY\\animergemeij_v30VAE.safetensors"),
        ],
    },
]

# ─── END CONFIG ───────────────────────────────────────────────────────────────

CHECKPOINT_TITLE = "Checkpoint"
SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent


def find_checkpoint_node(workflow: dict) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict):
            meta = node.get("_meta", {})
            if meta.get("title") == CHECKPOINT_TITLE:
                return node
    return None


def generate(template_path: Path, output_name: str, ckpt_name: str) -> None:
    workflow = copy.deepcopy(json.loads(template_path.read_text(encoding="utf-8")))
    node = find_checkpoint_node(workflow)
    if node is None:
        print(f"  [WARN] No '{CHECKPOINT_TITLE}' node found in {template_path.name} — skipping {output_name}")
        return
    node["inputs"]["ckpt_name"] = ckpt_name
    out_path = WORKFLOWS_DIR / output_name
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {output_name}")


def main() -> None:
    for entry in WORKFLOWS:
        template_path = SCRIPTS_DIR / entry["template"]
        if not template_path.exists():
            template_path = WORKFLOWS_DIR / entry["template"]
        if not template_path.exists():
            print(f"\n[SKIP] Template not found: {template_path}")
            continue
        print(f"\nTemplate: {entry['template']}")
        for output_name, ckpt_name in entry["models"]:
            generate(template_path, output_name, ckpt_name)
    print("\nDone.")


if __name__ == "__main__":
    main()
