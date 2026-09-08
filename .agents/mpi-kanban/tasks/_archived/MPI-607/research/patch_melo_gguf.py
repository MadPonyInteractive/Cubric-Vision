"""MPI-607: make MelodramaBox's DiT dropdown actually list .gguf files.

The pack filters for ".gguf" in _folder_choices and can load one
(loaders.py:84 -> load_dit_gguf), but it never registers the extension with
ComfyUI. `folder_paths.supported_pt_extensions` is
{'.ckpt','.pt','.pt2','.bin','.pth','.safetensors','.pkl','.sft'} -- no '.gguf' --
so get_filename_list("diffusion_models") can never return one and the pack's own
documented instruction ("drop the .gguf in models/diffusion_models and pick it in
the DiT Loader") is impossible on a stock install.

Fixed by scanning the registered roots for .gguf ourselves rather than by adding
'.gguf' to supported_pt_extensions: that set is global and this bench runs 25
packs, so mutating it would put .gguf entries in every other pack's dropdowns too.

get_full_path does not filter by extension, so _resolve_model_file already works
once the name is offered.
"""
import io

p = r"G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-MelodramaBox/dramabox_nodes/loaders.py"
s = io.open(p, encoding="utf-8").read()

old = '''def _folder_choices(folder_name: str, known_filename: str, fallback_dir: str):
    """Files in a ComfyUI model folder, plus a download entry for
    `known_filename` when it isn't present yet."""
    try:
        import folder_paths
        files = [f for f in folder_paths.get_filename_list(folder_name)
                 if f.endswith((".safetensors", ".sft", ".gguf"))]
    except Exception:'''

new = '''def _gguf_in_roots(folder_name):
    """MPI-607: .gguf files under any registered `folder_name` root.

    ComfyUI's supported_pt_extensions has no '.gguf', so get_filename_list can
    never return one. Scanned here instead of adding '.gguf' to that global set,
    which every other installed pack shares.
    """
    import os
    try:
        import folder_paths
        roots = folder_paths.get_folder_paths(folder_name)
    except Exception:
        return []
    out = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, _, names in os.walk(root):
            for n in names:
                if n.endswith(".gguf"):
                    rel = os.path.relpath(os.path.join(dirpath, n), root)
                    out.append(rel.replace(os.sep, "/"))
    return sorted(set(out))


def _folder_choices(folder_name: str, known_filename: str, fallback_dir: str):
    """Files in a ComfyUI model folder, plus a download entry for
    `known_filename` when it isn't present yet."""
    try:
        import folder_paths
        files = [f for f in folder_paths.get_filename_list(folder_name)
                 if f.endswith((".safetensors", ".sft", ".gguf"))]
        files = sorted(set(files) | set(_gguf_in_roots(folder_name)))
    except Exception:'''

assert s.count(old) == 1, "_folder_choices: got %d" % s.count(old)
io.open(p, "w", encoding="utf-8").write(s.replace(old, new))
print("patched", p)
