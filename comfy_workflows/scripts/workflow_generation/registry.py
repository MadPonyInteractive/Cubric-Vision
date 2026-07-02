"""
registry.py — filename-prefix → handler routing for the generation orchestrator.

Convention: every SOURCE workflow dropped into this folder ends in `_template.json`.
The orchestrator globs `*_template.json` here, matches each against the first
HANDLERS rule whose `match` prefix fits, and routes it to that handler module
(`generate_<handler>.py`). First match wins, so order specific before general.

Each handler exposes `build(source_path: Path, out_dir: Path) -> list[Path]`.

Add a new family = add a HANDLERS rule + a generate_<handler>.py module, then
drag the `*_template.json` source into this folder.

NEVER key on node IDs downstream — IDs change on every re-export. All node lookup
is by `_meta.title` (the app's MPI-116 naming law).
"""

# (filename prefix, handler name). First matching prefix wins.
HANDLERS = [
    ("sdxl_",     "sdxl"),   # sdxl_t2i_template.json, sdxl_upscaler_template.json, ...
    ("Wan22_5B_", "wan5b"),  # Wan22_5B_ti2v_template.json — MUST precede Wan22_ (first match wins)
    ("Wan22_",    "wan"),    # Wan22_i2v_template.json, Wan22_t2v_template.json
    ("LTX_",      "ltx"),    # MPI-127: source = LTX_i2v_t2v_template.json (do NOT rename)
]


def handler_for(filename: str) -> str | None:
    for prefix, handler in HANDLERS:
        if filename.startswith(prefix):
            return handler
    return None
