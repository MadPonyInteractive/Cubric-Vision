"""
orchestrate.py — workflow-generation orchestrator.

Run this (via generate.bat) after dropping an updated `*_template.json` source
into this folder. It globs every `*_template.json`, hashes it, rebuilds only the
changed ones, and routes each to its handler (by filename prefix, see registry).
Outputs go to comfy_workflows/.

State: .state.json (sha256 per source) lives alongside this script.
Force a full rebuild with:  python orchestrate.py --all
"""

import sys
import json
import hashlib
import importlib
from pathlib import Path

import registry

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/
STATE_FILE = SCRIPTS_DIR / ".state.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(force: bool = False) -> None:
    state = {}
    if STATE_FILE.exists() and not force:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))

    sources = sorted(SCRIPTS_DIR.glob("*_template.json"))
    if not sources:
        print("No *_template.json sources in this folder. Drop one in and re-run.")
        return

    handlers = {}            # handler name -> module
    new_state = dict(state)
    built_any = False

    for src_path in sources:
        name = src_path.name
        handler_name = registry.handler_for(name)
        if handler_name is None:
            print(f"[SKIP] {name} — no handler rule (add a prefix to registry.HANDLERS)")
            continue

        digest = _sha256(src_path)
        if not force and state.get(name) == digest:
            print(f"[skip] {name} (unchanged)")
            continue

        print(f"[build] {name}  ->  handler '{handler_name}'")
        if handler_name not in handlers:
            handlers[handler_name] = importlib.import_module(f"generate_{handler_name}")
        handlers[handler_name].build(src_path, WORKFLOWS_DIR)
        new_state[name] = digest
        built_any = True

    STATE_FILE.write_text(json.dumps(new_state, indent=2), encoding="utf-8")
    print("\nDone." if built_any else "\nNothing to rebuild.")


if __name__ == "__main__":
    main(force="--all" in sys.argv)
