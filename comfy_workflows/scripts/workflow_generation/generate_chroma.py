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
krea2), so this handler is just the boolean reset. One template → one file:
  chroma_t2i_template.json -> chroma_t2i.json   (serves t2i + i2i)

One thing a hand-export cannot be trusted to carry:

  FORCE `Input_Is_i2i` to false. It is the RUNTIME t2i/i2i switch: the i2i op injects
  true, t2i injects nothing and relies on the baked false. A template exported mid-i2i
  test bakes true — which would make every plain t2i silently run as i2i.

  (MPI-272: the optional image input is now a self-gating MpiLoadImageFromPath — no
  placeholder stamp needed; a plain t2i just leaves the `string` empty.)

Orchestrated: build(source_path, out_dir) — routed by the `chroma_` prefix (registry.py).
Standalone:  python generate_chroma.py

Node lookup is by `_meta.title` (MPI-116 naming law) — never by node id.
"""

import json
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

# MPI-272: optional image input migrated to a self-gating MpiLoadImageFromPath —
# no placeholder stamp needed. Only the runtime t2i/i2i boolean still needs forcing.
IS_I2I_TITLE = "Input_Is_i2i"


def _find_by_title(workflow: dict, title: str) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return node
    return None


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
    base = source_path.name[: -len("_template.json")]  # chroma_t2i_template.json -> chroma_t2i
    print(f"Template: {source_path.name}")
    workflow = json.loads(source_path.read_text(encoding="utf-8"))
    _force_t2i_default(workflow)
    out_path = out_dir / f"{base}.json"
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {out_path.name} ({len(workflow)} nodes)")
    return [out_path]


def main() -> None:
    """Standalone: rebuild every Chroma template alongside this script."""
    templates = sorted(SCRIPTS_DIR.glob("chroma_*_template.json"))
    if not templates:
        print("[SKIP] No chroma_*_template.json found.")
        return
    for t in templates:
        build(t, WORKFLOWS_DIR)
    print("\nDone.")


if __name__ == "__main__":
    main()
