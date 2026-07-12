"""
generate_boogu.py
Boogu-Image-Edit handler: one template → three per-TIER runtime files.

The template (boogu_edit_template.json) is a single graph with ONE UNETLoader
(title "Load Diffusion Model") and THREE sampler chains selected by an MpiAnySwitch
reading `Input_Tier` (an MpiInt). Each tier is produced by baking TWO values:

  1. UNETLoader.unet_name  → the tier's diffusion weight
  2. Input_Tier.int        → 1/2/3, which makes the switch pick that tier's sampler
                             chain (cfg/steps/scheduler/sampler are baked in the graph)

Tier map (per the workflow's Input_Tier wiring — the live bench is the source of truth):
  Tier 1 = HIGH     (bf16,               euler   cfg4   30-step simple      +AuraFlow 3.16)
  Tier 2 = BALANCED (turbo_int8_convrot, lcm     cfg1    8-step sgm_uniform)
  [REMOVED] the old fp8_scaled tier — dark/underexposed on Blackwell (sm_120), MPI-266.
  Template collapsed from 3 chains to 2 (bf16=1, int8=2).

Ships as two sibling ModelDefs (modelFamily 'Boogu-Image-Edit', one sizeTier each).
Input_Image is REQUIRED (an edit needs a source) → no placeholder stamping.

Standalone:  python generate_boogu.py
Orchestrated: build(source_path, out_dir)

Node lookup is by `_meta.title` — never by node id (ids change on every re-export).
"""

import json
import copy
from pathlib import Path

# ─── CONFIG ──────────────────────────────────────────────────────────────────
# template filename → list of (output_name, tier_int, unet_name)
MODEL_VARIANTS = {
    "boogu_edit_template.json": [
        ("boogu_edit_high.json",     1, "boogu_image_edit_bf16.safetensors"),
        # Balanced = the turbo int8_convrot weight (was "low"). fp8_scaled dropped (dark on
        # Blackwell/sm_120 — MPI-266). Template collapsed to TWO tiers: bf16=1, int8=2.
        ("boogu_edit_balanced.json", 2, "boogu_image_edit_turbo_int8_convrot.safetensors"),
    ],
}
# ─── END CONFIG ───────────────────────────────────────────────────────────────

UNET_TITLE = "Load Diffusion Model"
TIER_TITLE = "Input_Tier"
CAPTURE_TITLE = "Output_Image"
SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/


def _find_by_title(workflow: dict, title: str) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return node
    return None


def _find_id_by_title(workflow: dict, title: str) -> str | None:
    for nid, node in workflow.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _prune_to_capture(workflow: dict) -> None:
    """Drop every node NOT upstream of Output_Image. The authoring bench carries A/B
    compare widgets (rgthree comparers, per-tier PreviewImage taps) that are dead in a
    shipped run but ComfyUI still validates their class at prompt time — keeping them
    would force an rgthree-comfy dep for nodes the app never renders. The three tier
    sampler chains all remain (they feed the MpiAnySwitch → Output_Image)."""
    cap = _find_id_by_title(workflow, CAPTURE_TITLE)
    if cap is None:
        return
    keep: set[str] = set()

    def walk(nid: str) -> None:
        if nid in keep or nid not in workflow:
            return
        keep.add(nid)
        for v in workflow[nid]["inputs"].values():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                walk(v[0])

    walk(cap)
    dropped = [nid for nid in workflow if nid not in keep]
    for nid in dropped:
        del workflow[nid]
    if dropped:
        print(f"  [PRUNE] dropped {len(dropped)} bench node(s) not upstream of {CAPTURE_TITLE}")


def _generate_one(template_path: Path, output_name: str, tier: int, unet_name: str, out_dir: Path) -> Path | None:
    workflow = copy.deepcopy(json.loads(template_path.read_text(encoding="utf-8")))

    unet = _find_by_title(workflow, UNET_TITLE)
    if unet is None:
        print(f"  [WARN] No '{UNET_TITLE}' node in {template_path.name} — skipping {output_name}")
        return None
    unet["inputs"]["unet_name"] = unet_name

    tier_node = _find_by_title(workflow, TIER_TITLE)
    if tier_node is None:
        print(f"  [WARN] No '{TIER_TITLE}' node in {template_path.name} — skipping {output_name}")
        return None
    tier_node["inputs"]["int"] = tier

    _prune_to_capture(workflow)

    out_path = out_dir / output_name
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {output_name}  (tier {tier}, {unet_name})")
    return out_path


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Build the three tier files for the ONE template."""
    variants = MODEL_VARIANTS.get(source_path.name)
    if variants is None:
        print(f"  [WARN] {source_path.name} not in MODEL_VARIANTS — nothing to do")
        return []
    print(f"Template: {source_path.name}")
    written = [_generate_one(source_path, name, tier, unet, out_dir) for name, tier, unet in variants]
    return [p for p in written if p is not None]


def main() -> None:
    """Standalone: rebuild every Boogu template from files alongside this script."""
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
