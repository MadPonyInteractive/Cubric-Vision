"""MPI-607: make kat3ri's DramaBox node read the shared Cubric model store.

Stock behaviour puts everything in `folder_paths.models_dir / "DramaBox"`, i.e.
<ComfyUI>/models/DramaBox. `folder_paths.models_dir` is ComfyUI's own models
root and NOTHING else -- extra_model_paths.yaml registers per-category search
paths, it never moves models_dir. So the shared store is invisible and this pack
would re-download all ~16.5 GB alongside MelodramaBox's copy.

This makes it look in the registered category roots first (diffusion_models /
vae / text_encoders), falling back to its own layout when nothing is there.
"""
import io

p = r"G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-DramaBox/nodes.py"
s = io.open(p, encoding="utf-8").read()

# ---- 1. helpers, inserted just above _download_models -------------------
old_def = "def _download_models():"
helper = '''# MPI-607: the shared Cubric model store is reachable only through the
# per-category folder_paths lookups, never through folder_paths.models_dir.
_SHARED_FOLDER = {
    "transformer": "diffusion_models",
    "audio_components": "vae",
}


def _shared_file(folder_name, filename):
    """Path to `filename` in any registered `folder_name` root, else None."""
    try:
        import folder_paths  # noqa: PLC0415
        hit = folder_paths.get_full_path(folder_name, filename)
    except Exception:
        return None
    return Path(hit) if hit else None


def _shared_dir(folder_name, dirname):
    """Path to subdirectory `dirname` in any registered root, else None."""
    try:
        import folder_paths  # noqa: PLC0415
        roots = folder_paths.get_folder_paths(folder_name)
    except Exception:
        return None
    for root in roots:
        cand = Path(root) / dirname
        if cand.is_dir() and any(cand.iterdir()):
            return cand
    return None


def _download_models():'''

assert s.count(old_def) == 1, "_download_models def: got %d" % s.count(old_def)
s = s.replace(old_def, helper)

# ---- 2. per-file lookup ------------------------------------------------
old_loop = """    paths = {}
    for name, filename in model_files.items():
        local_path = MODELS_DIR / filename
        if local_path.exists():"""

new_loop = """    paths = {}
    for name, filename in model_files.items():
        local_path = _shared_file(_SHARED_FOLDER[name], filename) or (MODELS_DIR / filename)
        if local_path.exists():"""

assert s.count(old_loop) == 1, "model file loop: got %d" % s.count(old_loop)
s = s.replace(old_loop, new_loop)

# ---- 3. gemma snapshot lookup ------------------------------------------
old_gemma = '''    gemma_dir = MODELS_DIR / "gemma-3-12b-it-bnb-4bit"'''
new_gemma = '''    gemma_dir = (_shared_dir("text_encoders", "gemma-3-12b-it-bnb-4bit")
                 or MODELS_DIR / "gemma-3-12b-it-bnb-4bit")'''

assert s.count(old_gemma) == 1, "gemma dir: got %d" % s.count(old_gemma)
s = s.replace(old_gemma, new_gemma)

io.open(p, "w", encoding="utf-8").write(s)
print("patched", p)
