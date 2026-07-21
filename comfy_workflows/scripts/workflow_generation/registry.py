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
    ("wan22_5b_", "wan5b"),  # wan22_5b_ti2v_template.json — MUST precede wan22_ (first match wins)
    ("wan22_",    "wan"),    # wan22_i2v_template.json, wan22_t2v_template.json
    ("ltx_",      "ltx"),    # source = ltx_i2v_t2v_template.json (output lowercased by sync)
    ("krea2_",    "krea2"),  # MPI-242: krea2_t2i_template.json — no op split; stamps
                             # the optional-image placeholder + asserts the style rack.
    ("chroma_",   "chroma"), # MPI-252: chroma_t2i_template.json — i2i shares the t2i graph;
                             # stamps the optional-image placeholder so plain t2i validates.
                             # Lowercase-normalized (case-sensitive Pod FS) — MPI-291.
    ("boogu_",    "boogu"),  # MPI-257: boogu_edit_template.json — ONE graph → 3 per-tier
                             # files; bakes UNETLoader weight + Input_Tier int (no op split).
    ("qwen_edit_", "qwen"),  # MPI-300: qwen_edit_template.json — ONE graph → ONE runtime
                             # file; SAME int8 transformer every tier, Input_Tier injected at
                             # runtime by the qwenTier radio (no per-tier file, no tier bake).
]


def handler_for(filename: str) -> str | None:
    for prefix, handler in HANDLERS:
        if filename.startswith(prefix):
            return handler
    return None
