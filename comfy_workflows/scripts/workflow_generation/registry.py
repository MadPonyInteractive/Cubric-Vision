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
    ("sdxl_",     "sdxl"),   # sdxl_t2i_template.json — the ONE master template (MPI-365)
    ("wan22_5b_", "wan5b"),  # wan22_5b_ti2v_template.json — MUST precede wan22_ (first match wins)
    ("wan22_",    "wan"),    # wan22_i2v_template.json (t2v deprecated, MPI-470)
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
    ("minimax_h3_", "h3"),   # MPI-452: minimax_h3_fl2va_template.json — ONE graph → ONE runtime
                             # file, no _stage2 twin. The op is NOT an injected int: routing
                             # derives from which media is present (has_img1/has_img2 through
                             # lazy MpiIfElse), so illegal states are unreachable. Bakes the
                             # bench's leftover media paths / canvas / stage flags away.
    ("nvidia_pid_", "pid"),  # MPI-507: nvidia_pid_template.json — ONE single-branch graph → FOUR
                             # runtime files, one per VAE-locked path. Bakes UNETLoader.unet_name,
                             # PiD_VAE.vae_name and PiDConditioning.latent_format. Four FILES rather
                             # than one injected graph because each path is its own plugin: an
                             # unknown COMBO value on any output-reachable node is rejected by
                             # validate_prompt BEFORE execution, so one graph naming all four
                             # weights would fail for a user holding a single plugin.
    ("klein_",    "klein"),  # MPI-354: klein_t2i_template.json — ONE MASTER graph → ONE runtime
                             # file. Every op (t2i/i2i/depth/edit/inpaint/detail/upscale) lives
                             # in this one graph and is selected by the injected Input_wf_type;
                             # lazy evaluation prunes the unselected branches at run time, so
                             # there is no op split, no tier axis and no content axis.
]


def handler_for(filename: str) -> str | None:
    for prefix, handler in HANDLERS:
        if filename.startswith(prefix):
            return handler
    return None
