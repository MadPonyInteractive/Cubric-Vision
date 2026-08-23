"""Check every node type in the staged bench workflows is actually registered.

Catches the "red missing node" case BEFORE a restart, by scanning each installed pack's
NODE_CLASS_MAPPINGS keys as text (no ComfyUI import needed) and diffing against the
types each workflow uses. Core ComfyUI types are allow-listed rather than parsed out of
the server, so an unknown CORE node shows up as UNKNOWN and gets eyeballed, never
silently passed.

ASCII-only output on purpose (Windows console is cp1252).
"""
import json
import os
import re

CUSTOM_NODES = "G:/ComfyUi/ComfyUI/custom_nodes"
WORKFLOWS = "G:/ComfyUi/ComfyUI/user/default/workflows"

STAGED = [
    "TTS_Chatterbox_all-nodes.json",
    "TTS_Qwen3_voice-design.json",
    "TTS_Qwen3_voice-clone.json",
]

# Built-in ComfyUI types used by these graphs.
CORE = {
    "LoadAudio", "PreviewAudio", "SaveAudio", "PreviewAny",
    "PrimitiveNode", "Note", "MarkdownNote", "Reroute",
    "PrimitiveString", "PrimitiveStringMultiline", "PrimitiveInt",
    "PrimitiveFloat", "PrimitiveBoolean", "String", "Int",
}

KEY_RE = re.compile(r'"([A-Za-z0-9_][A-Za-z0-9_. |()\-]*)"\s*:')


def registered_types():
    """Harvest quoted mapping keys from every pack's python files."""
    found = set()
    for pack in os.listdir(CUSTOM_NODES):
        pack_dir = os.path.join(CUSTOM_NODES, pack)
        if not os.path.isdir(pack_dir):
            continue
        for root, _dirs, files in os.walk(pack_dir):
            if "__pycache__" in root:
                continue
            for fn in files:
                if not fn.endswith(".py"):
                    continue
                path = os.path.join(root, fn)
                try:
                    with open(path, encoding="utf-8", errors="ignore") as fh:
                        text = fh.read()
                except OSError:
                    continue
                if "NODE_CLASS_MAPPINGS" not in text:
                    continue
                found.update(KEY_RE.findall(text))
    return found


def main():
    known = registered_types() | CORE
    print("registered node types discovered: %d" % len(known))
    print("=" * 66)

    missing_total = 0
    for name in STAGED:
        path = os.path.join(WORKFLOWS, name)
        if not os.path.exists(path):
            print("MISSING FILE  %s" % name)
            missing_total += 1
            continue
        with open(path, encoding="utf-8") as fh:
            graph = json.load(fh)
        types = sorted({n.get("type") for n in graph.get("nodes", []) if n.get("type")})
        unknown = [t for t in types if t not in known]
        status = "OK  " if not unknown else "GAPS"
        print("%s  %-38s %d node types" % (status, name, len(types)))
        for t in unknown:
            print("        UNKNOWN -> %s" % t)
        missing_total += len(unknown)

    print("=" * 66)
    print("VERDICT: %s" % ("ALL RESOLVE - no red nodes expected on restart"
                           if missing_total == 0
                           else "%d unresolved type(s), check above" % missing_total))
    return 1 if missing_total else 0


if __name__ == "__main__":
    raise SystemExit(main())
