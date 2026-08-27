"""MPI-607: make MelodramaBox find the Gemma text encoder in the shared model store.

Stock `ensure_text_encoder` checks exactly ONE directory --
`get_folder_paths("text_encoders")[0]` -- and downloads if it is not there.
`[0]` is always ComfyUI's own models dir: extra_model_paths.yaml roots are
APPENDED, never prepended (no `is_default: true` anywhere), so a snapshot in
G:/CubricModels is invisible to the stock lookup and it re-downloads ~8 GB.

The DiT and the audio components already resolve correctly -- they go through
get_filename_list / get_full_path, which scan every registered root. This makes
the text encoder behave the same way.
"""
import io

p = r"G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-MelodramaBox/dramabox_nodes/downloader.py"
s = io.open(p, encoding="utf-8").read()

helper = '''def _text_encoder_roots():
    """Every registered `text_encoders` root, in ComfyUI's own order.

    MPI-607: extra_model_paths.yaml roots are appended to this list, never
    prepended, so `[0]` alone never sees the shared Cubric model store.
    """
    try:
        import folder_paths
        return list(folder_paths.get_folder_paths("text_encoders"))
    except Exception:
        return [config.TEXT_ENCODER_DIR]


def ensure_text_encoder('''

old_def = "def ensure_text_encoder("
assert s.count(old_def) == 1, "ensure_text_encoder def: got %d" % s.count(old_def)
s = s.replace(old_def, helper)

old_body = '''    dirname = dirname or config.TEXT_ENCODER_4BIT_DIRNAME
    dest = os.path.join(config.TEXT_ENCODER_DIR, dirname)
    if _is_valid_text_encoder_snapshot(dest):
        return dest
'''

new_body = '''    dirname = dirname or config.TEXT_ENCODER_4BIT_DIRNAME

    # MPI-607: honour every registered text_encoders root, not just [0].
    for _root in _text_encoder_roots():
        _cand = os.path.join(_root, dirname)
        if _is_valid_text_encoder_snapshot(_cand):
            log.info("[DramaBox] Text encoder found at %s" % _cand)
            return _cand

    dest = os.path.join(config.TEXT_ENCODER_DIR, dirname)
'''

assert s.count(old_body) == 1, "ensure_text_encoder body: got %d" % s.count(old_body)
s = s.replace(old_body, new_body)

io.open(p, "w", encoding="utf-8").write(s)
print("patched", p)
