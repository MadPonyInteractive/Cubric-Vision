"""
generate_wan.py
WAN 2.2 handler: from ONE API export, produce ONE app workflow file.

  <name>.json — the whole model, both stages, verbatim apart from baked fallbacks

There is NO `_stage2` twin any more (MPI-452/MPI-456). The twin used to be derived
here by physically splicing out the stage-1 sampler and flipping a boolean node,
because an OUTPUT_NODE is always executed and an ExecutionBlocker only travels
DOWNSTREAM — so gating after the sampler never stopped the sampler. `MpiStageLatents`
removes the reason: its latent inputs are LAZY, so a continue simply never asks for
them and the stage-1 sampler is genuinely skipped. One file now serves both stages,
and the app picks between them by injecting the node's `is_continue` widget.

That also deleted this module's only WAN-specific knowledge — the per-class
output-slot → input-name splice map that the bypass rewrite needed.

ALL node lookup is by `_meta.title` — never by node id (ids change on re-export).

Authoring contract (you, once per workflow, in the ComfyUI graph):
  - ONE MpiStageLatents, titled "Input_Video_Latent"
  - no MpiSaveLatent / MpiLoadLatent left over
  - Save (API), drop the file in the App folder.
"""

import json
from pathlib import Path

# The node that owns the two-stage handshake. The title is load-bearing:
# commandExecutor.js injects `Input_Video_Latent.is_continue` / `.is_preview` /
# `.load_path`, and injection SILENTLY SKIPS a title matching no node — so a rename
# does not error, it just makes every continue re-run stage 1 and hand back a
# different sample than the one the user approved.
STAGE_TITLE = "Input_Video_Latent"
STAGE_CLASS = "MpiStageLatents"

# (title, widget key, shipped value) — forced to the value the graph must run when
# injection does not reach it, which is exactly when a wrong value is hardest to spot.
BAKED_WIDGETS = [
    # A shipped template always starts at stage 1, never mid-flow.
    (STAGE_TITLE, "is_preview", False),
    (STAGE_TITLE, "is_continue", False),
    (STAGE_TITLE, "save_path", "mpi_stage1"),
    (STAGE_TITLE, "load_path", "mpi_stage1"),
]

# Same, but skipped when the title is absent: t2v has no frame slots at all, while
# i2v carries both. Non-empty is NOT a cosmetic leftover — each feeds a media-presence
# check that picks the branch, so a stray value makes the graph believe a frame is
# there and condition on a file that does not exist. (The 2026-08-06 i2v export came
# back with Input_Start_Frame="s" and Input_End_Frame="d".)
OPTIONAL_BAKED = [
    ("Input_Start_Frame", "string", ""),
    ("Input_End_Frame", "string", ""),
]

# Titles that MUST survive. Each entry is a set of acceptable alternatives.
REQUIRED_TITLES = [
    {"Output_Video"},          # final capture (tier-2 SaveVideo, MPI-127)
    {"Output_Preview"},        # preview capture — without it a preview run returns nothing
    {STAGE_TITLE},             # the two-stage handshake
]


def _find_node_id_by_title(wf: dict, title: str) -> str | None:
    for nid, node in wf.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _assert_stage_node(wf: dict) -> None:
    """Exactly one stage node, correctly titled, with no leftovers of the old pair."""
    stage = [(nid, n) for nid, n in wf.items()
             if isinstance(n, dict) and n.get("class_type") == STAGE_CLASS]
    if len(stage) != 1:
        raise SystemExit(
            f"[FAIL] {len(stage)} {STAGE_CLASS} node(s), expected exactly 1 — this node "
            f"IS the two-stage handshake. Zero means the graph cannot continue from a "
            f"preview at all; two means the app's widget injection hits both.")
    nid, node = stage[0]
    title = node.get("_meta", {}).get("title", "")
    if title != STAGE_TITLE:
        raise SystemExit(
            f"[FAIL] {STAGE_CLASS} node {nid} is titled {title!r}, expected "
            f"{STAGE_TITLE!r} — the app injects into that title and injection SILENTLY "
            f"SKIPS a title that matches no node, so a rename makes every continue "
            f"re-run stage 1 and return a different sample")

    leftovers = [nid for nid, n in wf.items()
                 if isinstance(n, dict)
                 and n.get("class_type") in ("MpiSaveLatent", "MpiLoadLatent")]
    if leftovers:
        raise SystemExit(
            f"[FAIL] {STAGE_CLASS} is present but node(s) {leftovers} still use the old "
            f"MpiSaveLatent/MpiLoadLatent pair — delete them; two savers writing one "
            f"filename is a race, not a redundancy")


def _bake_widgets(wf: dict) -> None:
    """Force each baked widget to its shipped fallback.

    A LINKED input is a hard failure, not something to bake over: the app injects into
    these by title, so an input driven by a wire makes the injection land on a value
    nothing reads and the graph runs whatever the upstream happens to produce."""
    for title, key, want in BAKED_WIDGETS:
        nid = _find_node_id_by_title(wf, title)
        if nid is None:
            raise SystemExit(
                f"[FAIL] no node titled {title!r} — the app injects into it by title, "
                f"and injection SILENTLY SKIPS a title that matches no node")
        _bake_one(wf, nid, title, key, want)

    for title, key, want in OPTIONAL_BAKED:
        nid = _find_node_id_by_title(wf, title)
        if nid is not None:
            _bake_one(wf, nid, title, key, want)


def _bake_one(wf: dict, nid: str, title: str, key: str, want) -> None:
    got = wf[nid]["inputs"].get(key)
    if isinstance(got, list):
        raise SystemExit(
            f"[FAIL] {title}.{key} is linked, not a widget — the app injects into it, "
            f"so a link makes every run use the same upstream value regardless of what "
            f"the user chose")
    wf[nid]["inputs"][key] = want
    if got != want:
        print(f"  [BAKE] {title}.{key}: {got!r} -> {want!r}")


def _assert_required_titles(wf: dict) -> None:
    present = {n.get("_meta", {}).get("title")
               for n in wf.values() if isinstance(n, dict)}
    for alts in REQUIRED_TITLES:
        if not (alts & present):
            raise SystemExit(
                f"[FAIL] missing a required node titled one of {sorted(alts)}")


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. source = API export. Writes ONE runtime file."""
    name = source_path.stem.removesuffix("_template")  # wan22_i2v_template -> wan22_i2v
    wf = json.loads(source_path.read_text(encoding="utf-8"))

    _assert_stage_node(wf)
    _bake_widgets(wf)
    _assert_required_titles(wf)

    out = out_dir / f"{name}.json"
    out.write_text(json.dumps(wf, indent=2), encoding="utf-8")
    print(f"  [OK]   {out.name} (one file, both stages)")

    return [out]
