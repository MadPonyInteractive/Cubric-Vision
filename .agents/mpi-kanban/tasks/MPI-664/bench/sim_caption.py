# MPI-664 — walk the REAL converted API graph and execute its string half in Python,
# with the node semantics copied from the engine sources:
#   StringConcatenate  comfy_extras/nodes_string.py  -> delimiter.join((a, b))
#   RegexExtract/Replace  same file                  -> re.search / re.sub
#   MpiIfElse   ComfyUi-MpiNodes/if_else.py          -> true if boolean else false
#   MpiCompare  ComfyUi-MpiNodes/logic.py            -> a <op> (b or b_value)
#   MpiConvert  same                                 -> str(ceil(input))
# The bench is busy with another agent's job, so this stands in for the live probe.

import io
import json
import math
import re

API = r"C:/AI/Mpi/Cubric-Vision/comfy_workflows/flow_minimax_music.json"
G = json.load(io.open(API, encoding="utf-8"))

FLAGS = lambda n: ((re.IGNORECASE if n["inputs"].get("case_insensitive", True) else 0)
                   | (re.MULTILINE if n["inputs"].get("multiline", False) else 0)
                   | (re.DOTALL if n["inputs"].get("dotall", False) else 0))


def run(nid, over, memo):
    if nid in memo:
        return memo[nid]
    n = G[nid]
    ins = dict(n["inputs"])
    for k, v in list(ins.items()):
        if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int):
            ins[k] = run(v[0], over, memo)
    if nid in over:
        ins.update(over[nid])
    c = n["class_type"]
    if c in ("MpiText", "MpiString"):
        out = ins["string"]
    elif c == "MpiInt":
        out = ins["int"]
    elif c == "MpiFloat":
        out = ins["float"]
    elif c == "MpiSimpleBoolean":
        out = ins["boolean"]
    elif c == "MpiIfElse":
        out = ins["true"] if ins["boolean"] else ins["false"]
    elif c == "MpiCompare":
        b = ins.get("b", int(ins.get("b_value", 0)))
        out = {"==": lambda: ins["a"] == b, "!=": lambda: ins["a"] != b}[ins["operator"]]()
    elif c == "MpiConvert":
        out = str(math.ceil(ins["input"]) if ins["round"] else math.floor(ins["input"]))
    elif c == "StringConcatenate":
        out = ins["delimiter"].join((ins["string_a"], ins["string_b"]))
    elif c == "RegexReplace":
        out = re.sub(ins["regex_pattern"], ins["replace"], ins["string"],
                     count=ins.get("count", 0), flags=FLAGS(n))
    elif c == "RegexExtract":
        assert ins["mode"] == "First Group", ins["mode"]
        m = re.search(ins["regex_pattern"], ins["string"], FLAGS(n))
        gi = ins["group_index"]
        out = m.group(gi) if m and len(m.groups()) >= gi else ""
    else:
        raise AssertionError(f"{nid} {c} is not part of the string half")
    memo[nid] = out
    return out


LYRICS = "[Verse]\n<Singer A> walking home alone\n[Chorus]\n<The Choir> carry it together"
MARKED = ("[MOOD] Wistful and slowly lifting, a late-night walk that ends in daylight.\n\n"
          "[VOCAL] Close, breathy delivery with doubled harmonies on the last chorus.\n\n"
          "[ARRANGEMENT] Rhodes and brushed drums, a sub bass entering at the bridge.")

CASES = {
    "A — vocal, roster + notes + BPM 78": {
        "71": {"string": "Singer A (Male)\nThe Choir (Choir)"},
        "72": {"string": "Warm breathy tenor, layered gospel harmonies."},
        "69": {"string": "Dusty tape."}, "73": {"boolean": False},
        "70": {"int": 78}, "45": {"string": MARKED}, "46": {"string": LYRICS},
    },
    "B — instrumental (roster and lyrics still hold their values)": {
        "71": {"string": "Singer A (Male)"}, "72": {"string": "gospel harmonies"},
        "69": {"string": ""}, "73": {"boolean": True},
        "70": {"int": 0}, "45": {"string": MARKED}, "46": {"string": LYRICS},
    },
    "C — BPM auto, caption typed by hand with no markers": {
        "71": {"string": ""}, "72": {"string": ""}, "69": {"string": ""},
        "73": {"boolean": False}, "70": {"int": 0},
        "45": {"string": "A slow rainy piano piece that swells and then fades."},
        "46": {"string": LYRICS},
    },
    "D — the baked defaults, untouched": {},
}

# DERIVED, never hardcoded (MPI-664, 2026-09-03). These were the literals "97" and
# "78"; "78" was the FIRST `Lyrics_Gate`, so deleting that gate on 2026-09-02 left this
# bench raising KeyError on every run — and the lyrics half of the evidence in
# validation.md was carried forward from before the change rather than re-measured.
# Reading both ids off the encoder means the bench follows the graph instead of a
# snapshot of it.
ENC = next(k for k, n in G.items() if n["class_type"] == "MiniMaxMusic3TextEncode")
CAPTION_SRC, LYRICS_SRC = (G[ENC]["inputs"][k][0] for k in ("caption", "lyrics"))

for name, over in CASES.items():
    memo = {}
    caption = run(CAPTION_SRC, over, memo)
    lyrics = run(LYRICS_SRC, over, memo)
    print("=" * 78)
    print("###", name)
    print("--- caption ---")
    print(caption)
    print("--- lyrics ---")
    print(repr(lyrics))

    # The contradiction that cost two GPU runs: the caption forbids vocals while the
    # encoder is handed words to sing. Assert both halves agree, per case.
    if over.get("73", {}).get("boolean"):
        assert lyrics.strip() in ("", "[start]"), f"{name}: instrumental run must send NO lyrics"
        assert "Instrumental." in caption, f"{name}: instrumental clause missing from caption"
    elif over.get("46"):
        assert "[Verse]" in lyrics, f"{name}: vocal run must keep its section tags"
        assert "<Singer A>" not in lyrics, f"{name}: voice markers must be stripped"

print("=" * 78)
print("OK — every case's caption and lyrics slot agree.")
