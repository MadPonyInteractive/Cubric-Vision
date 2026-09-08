"""MPI-607: DramaBoxUnloadModels is a SIDE-EFFECT node with no IS_CHANGED, so
ComfyUI caches it and the side effect silently does not happen.

Measured: a pre-encode unload wired with trigger = the (constant) text-encoder
handle was listed in execution_cached on generations 2 and 3 -- it never ran, the
resident DiT was never evicted, and the text encode OOM'd exactly as if the node
were absent. The node only appears to work when its trigger happens to vary
(e.g. the conditioning, which changes with the prompt).

A node whose whole purpose is a side effect must never be cached. NaN != NaN, so
returning NaN is the standard ComfyUI idiom for "always re-execute".
"""
import io

p = r"G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-MelodramaBox/dramabox_nodes/model_management.py"
s = io.open(p, encoding="utf-8").read()

old = """    RETURN_TYPES = (any_type,)
    FUNCTION = "unload"
    CATEGORY = "DramaBox/vram\""""

new = """    RETURN_TYPES = (any_type,)
    FUNCTION = "unload"
    CATEGORY = "DramaBox/vram"

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # MPI-607: this node exists ONLY for its side effect. Without this,
        # ComfyUI caches it whenever its inputs are unchanged and the unload
        # never happens -- which is invisible except as an OOM further down the
        # graph. NaN != NaN, so the node always re-executes.
        return float("NaN")"""

assert s.count(old) == 1, "unload class tail: got %d" % s.count(old)
io.open(p, "w", encoding="utf-8").write(s.replace(old, new))
print("patched", p)
