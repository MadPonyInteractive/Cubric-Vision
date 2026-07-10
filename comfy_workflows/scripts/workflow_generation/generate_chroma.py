"""
generate_chroma.py — Chroma (Flash) handler (t2i / i2i share ONE graph).

Chroma got an i2i operation the same way Krea2 did: one t2i graph serves both t2i
and i2i, switched at RUNTIME by the injected `Input_Is_i2i` boolean (commandRegistry
i2i op → injectParams {Input_Is_i2i:true}; t2i injects nothing). Because the graph
carries an OPTIONAL LoadImage that a plain t2i never fills, the runtime file can't be
a raw export — ComfyUI validates the baked image filename on every run, and the baked
boolean decides whether t2i accidentally runs as i2i. So the template routes through
this handler to reset both to their safe t2i defaults.

Chroma is a SINGLE variant (no SFW/NSFW split, no style rack, no bypass LoRA — unlike
krea2), so this handler is just the placeholder/boolean reset. One template → one file:
  Chroma_t2i_template.json -> Chroma_t2i.json   (serves t2i + i2i)

Two things a hand-export cannot be trusted to carry:

  1. STAMP the optional image input to the staged placeholder. `Input_Image` runs with
     no image on a plain t2i (the injector fills it only for i2i), so ComfyUI validates
     the BAKED filename — a raw export carries whatever test image was open.

  2. FORCE `Input_Is_i2i` to false. It is the RUNTIME t2i/i2i switch: the i2i op injects
     true, t2i injects nothing and relies on the baked false. A template exported mid-i2i
     test bakes true — which would make every plain t2i silently run as i2i.

Orchestrated: build(source_path, out_dir) — routed by the `Chroma_` prefix (registry.py).
Standalone:  python generate_chroma.py

Node lookup is by `_meta.title` (MPI-116 naming law) — never by node id.
"""

import json
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

OPTIONAL_IMAGE_TITLE = "Input_Image"
PLACEHOLDER = "placeholder.png"        # staged by routes/comfy.js WORKFLOW_INPUT_DEFAULTS
IS_I2I_TITLE = "Input_Is_i2i"


def _find_by_title(workflow: dict, title: str) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return node
    return None


def _stamp_placeholder(workflow: dict) -> None:
    """Reset the optional LoadImage to the staged placeholder, so a plain t2i (which
    injects nothing into it) passes ComfyUI's graph validation."""
    node = _find_by_title(workflow, OPTIONAL_IMAGE_TITLE)
    if node is None:
        raise SystemExit(f"[FAIL] No LoadImage titled '{OPTIONAL_IMAGE_TITLE}' — graph changed?")
    before = node["inputs"].get("image")
    node["inputs"]["image"] = PLACEHOLDER
    if before != PLACEHOLDER:
        print(f"  [STAMP] {OPTIONAL_IMAGE_TITLE}: {before!r} -> {PLACEHOLDER!r}")


def _force_t2i_default(workflow: dict) -> None:
    """Force the t2i/i2i switch boolean to false. The i2i op injects true at submit; a
    plain t2i injects nothing and depends on this baked false. A template exported during
    an i2i test bakes true — which would make every t2i run as i2i."""
    node = _find_by_title(workflow, IS_I2I_TITLE)
    if node is None:
        raise SystemExit(f"[FAIL] No boolean titled '{IS_I2I_TITLE}' — i2i switch missing?")
    before = node["inputs"].get("boolean")
    node["inputs"]["boolean"] = False
    if before is not False:
        print(f"  [I2I]   {IS_I2I_TITLE}.boolean: {before!r} -> False")


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Emit the one Chroma runtime file (serves t2i + i2i)."""
    base = source_path.name[: -len("_template.json")]  # Chroma_t2i_template.json -> Chroma_t2i
    print(f"Template: {source_path.name}")
    workflow = json.loads(source_path.read_text(encoding="utf-8"))
    _stamp_placeholder(workflow)
    _force_t2i_default(workflow)
    out_path = out_dir / f"{base}.json"
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {out_path.name} ({len(workflow)} nodes)")
    return [out_path]


def main() -> None:
    """Standalone: rebuild every Chroma template alongside this script."""
    templates = sorted(SCRIPTS_DIR.glob("Chroma_*_template.json"))
    if not templates:
        print("[SKIP] No Chroma_*_template.json found.")
        return
    for t in templates:
        build(t, WORKFLOWS_DIR)
    print("\nDone.")


if __name__ == "__main__":
    main()
