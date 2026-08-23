"""Re-register the "default" RoPE initialiser that transformers 5 removed.

transformers 4.x shipped ROPE_INIT_FUNCTIONS["default"] -> _compute_default_rope_parameters.
transformers 5.13 dropped BOTH: the dict now holds only
['dynamic','linear','llama3','longrope','proportional','yarn'], and
_compute_default_rope_parameters is gone. Qwen3-TTS falls back to "default" whenever
config.rope_scaling is None -- the normal case -- so every rotary embedding raises
KeyError: 'default' at construction.

The call contract is UNCHANGED in 5.13:
    (config, device, seq_len, layer_type) -> (inv_freq, attention_factor)
and the surviving `linear` initialiser is literally the default computation followed by
`inv_freq /= factor`. So the replacement below is that same body without the scaling
step -- not invented math, just the entry transformers stopped shipping.

INSERTION POINT: immediately after the module's last top-level import, NOT before the
first class. A class can be preceded by decorators (@dataclass/@auto_docstring), and
splitting a decorator from its class is a SyntaxError -- which is exactly what the first
version of this script did.

Idempotent: removes any previous block before inserting, so re-running is safe.
ASCII-only output on purpose (Windows console is cp1252).
"""
import io
import os
import py_compile
import sys

PACK = "G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-QwenTTS"
TARGETS = [
    "qwen_tts/core/models/modeling_qwen3_tts.py",
    "qwen_tts/core/tokenizer_12hz/modeling_qwen3_tts_tokenizer_v2.py",
]

BEGIN = "# --- BEGIN transformers 5 compat (_CUBRIC_DEFAULT_ROPE_COMPAT) ---"
END = "# --- END transformers 5 compat (_CUBRIC_DEFAULT_ROPE_COMPAT) ---"

BLOCK = BEGIN + '''
# transformers 5 removed ROPE_INIT_FUNCTIONS["default"] and
# _compute_default_rope_parameters. This restores the 4.x entry; the body matches the
# surviving `linear` initialiser minus its `inv_freq /= factor` scaling step.
if "default" not in ROPE_INIT_FUNCTIONS:
    def _cubric_default_rope_parameters(config=None, device=None, seq_len=None, layer_type=None):
        base = getattr(config, "rope_theta", None) or 10000.0
        partial_rotary_factor = getattr(config, "partial_rotary_factor", 1.0)
        head_dim = getattr(config, "head_dim", None) or (
            config.hidden_size // config.num_attention_heads)
        dim = int(head_dim * partial_rotary_factor)
        attention_factor = 1.0
        inv_freq = 1.0 / (
            base ** (torch.arange(0, dim, 2, dtype=torch.int64).to(
                device=device, dtype=torch.float) / dim))
        return inv_freq, attention_factor

    ROPE_INIT_FUNCTIONS["default"] = _cubric_default_rope_parameters
''' + END + "\n\n"


# An earlier revision of this script used different marker text and inserted the block
# in the wrong place (between a decorator and its class -- a SyntaxError). Match BOTH
# spellings so a re-run repairs that damage instead of stacking a second block on it.
BEGIN_PREFIXES = ("# --- BEGIN transformers 5 compat", "# --- transformers 5 compat")
END_PREFIXES = ("# --- END transformers 5 compat", "# --- end transformers 5 compat")


def strip_previous(lines):
    """Remove a previously inserted block in any marker spelling, if present."""
    start = end = None
    for i, line in enumerate(lines):
        if start is None and line.startswith(BEGIN_PREFIXES):
            start = i
        elif start is not None and line.startswith(END_PREFIXES):
            end = i
            break
    if start is None or end is None:
        return lines, False
    del lines[start:end + 1]
    while start < len(lines) and lines[start].strip() == "":
        del lines[start]
    return lines, True


def last_import_line(lines):
    """Index just past the final top-level import statement."""
    last = 0
    depth_open = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if depth_open:
            last = i + 1
            if stripped.endswith(")"):
                depth_open = False
            continue
        if line.startswith(("import ", "from ")):
            last = i + 1
            # a parenthesised multi-line import keeps going
            if "(" in line and ")" not in line:
                depth_open = True
    if last == 0:
        raise RuntimeError("no top-level import found")
    return last


def patch(rel):
    path = os.path.join(PACK, rel)
    with io.open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines(keepends=True)

    lines, removed = strip_previous(lines)
    idx = last_import_line(lines)
    lines.insert(idx, "\n" + BLOCK)

    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("".join(lines))

    print("PATCH  %s  (line %d%s)"
          % (rel, idx + 1, ", replaced previous block" if removed else ""))


def main():
    for rel in TARGETS:
        patch(rel)
    print("-" * 60)
    for rel in TARGETS:
        py_compile.compile(os.path.join(PACK, rel), doraise=True)
        print("COMPILES  %s" % rel)
    return 0


if __name__ == "__main__":
    sys.exit(main())
