"""
generate_h3.py — MiniMax H3 fl2va handler: ONE master template → ONE runtime file.

H3 is the second model after Klein where every op lives in a single graph, and the
FIRST where the op is not selected by an injected int at all. Routing is derived from
WHICH MEDIA IS PRESENT:

  * ops      — t2v / i2v (start frame) / end-frame-only / first+last-frame interpolation.
               `Input_Start_Frame` and `Input_End_Frame` are path strings; each feeds an
               MpiAnyChecker (`has img1` / `has img2`) and those two booleans drive four
               lazy MpiIfElse branches into four MiniMaxH3ImageToVideo nodes. Illegal
               states are unreachable BY CONSTRUCTION — there is no toggle to disagree
               with the media.
  * stages   — single file, no `_stage2` twin. The MpiStageLatents widgets
               `is_preview` + `is_continue` (see STAGE_TITLE below) gate the two
               SamplerCustomAdvanced passes through the lazy MpiSaveLatent `enabled`
               input, so stage 1 is genuinely skipped on a continue rather than being
               run and discarded. The standalone `Input_Preview_Only` /
               `Input_Is_Continue` boolean nodes are gone fleet-wide (MPI-473). (The
               twins the other video models still carry are MPI-456.)
  * tier     — none. H3 ships ONE pruned int8_convrot transformer.
  * audio    — H3 emits video AND stereo audio from one sampler pass as a packed
               NestedTensor. There is no separate audio latent, so the latent pair is
               `Output_Video_Latent` / `Input_Video_Latent` and MUST STAY THAT WAY: the
               app's `_latentRoleFromTitle` tags ANY title containing "audio" as the
               audio latent, so naming it `Output_AV_Latent` would silently break the
               stage-2 resume. `_assert_latent_titles` locks that in.

So this handler bakes only what the authoring bench leaves behind, and asserts the rest.
Every check exists because its failure mode is a plausible WRONG VIDEO, not an error.

Orchestrated: build(source_path, out_dir) — called by orchestrate.py after the
`minimax_h3_` prefix routes here (registry.py).
Standalone:  python generate_h3.py

Node lookup is by `_meta.title` (MPI-116 naming law) — never by node id.
"""

import json
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

MODEL_VARIANTS = {
    "minimax_h3_fl2va_template.json": "minimax_h3_fl2va.json",
}

# The one node that owns the two-stage handshake (MpiStageLatents, MPI-452). It replaced
# the eight-node cluster — MpiSaveLatent + MpiLoadLatent + two MpiBooleanInvert + MpiIfElse
# + MpiBlocker + MpiBooleanCompare + the two MpiSimpleBoolean gates — and the app addresses
# its widgets as `<title>.is_continue` / `.is_preview` / `.load_path` (the MPI-359 dotted
# form), so this title is load-bearing in commandExecutor.js. Rename it and BOTH stages
# silently run stage 1.
#
# It KEEPS the old `Input_Video_Latent` title on purpose: the app emits the dotted widget
# keys and the plain latent-name key under that one title, and whichever shape the graph
# actually has consumes its half while the other finds nothing to write to. That is what
# lets LTX and WAN migrate one at a time instead of on a flag day.
STAGE_TITLE = "Input_Video_Latent"
STAGE_CLASS = "MpiStageLatents"

# All three captures. The stage node is load-bearing, not a debug tap: it is how a
# preview run hands stage 2 its latent, so pruning to the video captures alone would
# delete the Continue path with no error anywhere.
CAPTURE_TITLES = ("Output_Video", "Output_Preview", STAGE_TITLE)

# title -> baked value. The authoring graph holds whatever the user was last testing;
# every one of these ships as the FALLBACK the graph runs when injection fails, which is
# exactly when a wrong value is hardest to spot. Same reasoning as
# generate_klein.py::_assert_and_bake_wf_type.
# (title, widget key, shipped value). A LIST, not a dict keyed by title, because
# MpiStageLatents carries FOUR baked widgets on one node — a title-keyed dict could
# only hold the last of them.
BAKED_WIDGETS = [
    # Media paths MUST be empty. Non-empty is not a cosmetic leftover: each feeds an
    # MpiAnyChecker whose boolean picks the branch, so a stray value makes the graph
    # believe a frame is present and run first+last-frame conditioning on a file that
    # does not exist. (The 2026-08-06 export came back with `Input_End_Frame = "d"`.)
    ("Input_Start_Frame", "string", ""),
    ("Input_End_Frame", "string", ""),
    # Stage flags: a shipped template always starts at stage 1, never mid-flow. Both
    # now live as WIDGETS on the single MpiStageLatents node (MPI-452) instead of two
    # separate MpiSimpleBoolean nodes, which is why they share a title here.
    (STAGE_TITLE, "is_preview", False),
    (STAGE_TITLE, "is_continue", False),
    # The stage-1 latent's name. save_path is the app's read-back handle: it collects
    # the file from `ui.latents` after a preview, so this baked name is what actually
    # ships. load_path is injected per run, but bakes to the same name so a hand-run
    # bench continue resolves without editing anything.
    (STAGE_TITLE, "save_path", "mpi_stage1"),
    (STAGE_TITLE, "load_path", "mpi_stage1"),
    # Canvas falls back to `low` (864x480) — the tier MINIMAX_H3_RATIOS documents as the
    # default and the size the community's published timings are measured at. The bench
    # exports at whatever was last rendered (352x608 on 2026-08-06).
    ("Input_Width", "int", 864),
    ("Input_Height", "int", 480),
]

# Every weight the graph loads, as a SET rather than per-title: two VAELoaders share the
# title "Load VAE", so a title-keyed check cannot tell them apart. Each name must equal
# the `filename` tail of the matching dep in modelDeps.js/assetDeps.js — a mismatch is
# invisible until a user installs, because the app downloads the dep it declares and
# ComfyUI then cannot find the name baked in the graph.
EXPECTED_WEIGHTS = {
    "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    "qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors",
    "minimax_h3_video_vae_fp16.safetensors",
    "minimax_h3_audio_vae_fp32.safetensors",
}
WEIGHT_INPUT_KEYS = ("unet_name", "clip_name", "vae_name")

# One MiniMaxH3ImageToVideo per reachable media combination. Fewer means a branch was
# pruned away or never authored, and the graph would silently fall through to another.
EXPECTED_H3_BRANCHES = 4


def _find_id_by_title(workflow: dict, title: str) -> str | None:
    for nid, node in workflow.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _prune_to_captures(workflow: dict) -> None:
    """Drop every node not upstream of one of CAPTURE_TITLES.

    Same job as the Klein handler's: the authoring bench leaves orphans that ComfyUI
    never validates (it only walks nodes reachable from an output) but that make
    `missing-required` checks noisy, which trains people to ignore them."""
    caps = [nid for t in CAPTURE_TITLES if (nid := _find_id_by_title(workflow, t))]
    if not caps:
        raise SystemExit(f"[FAIL] none of {CAPTURE_TITLES} present — nothing to capture, "
                         f"the app would receive no output from this graph")
    keep: set[str] = set()

    def walk(nid: str) -> None:
        if nid in keep or nid not in workflow:
            return
        keep.add(nid)
        for v in workflow[nid]["inputs"].values():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                walk(v[0])

    for nid in caps:
        walk(nid)
    dropped = [nid for nid in workflow if nid not in keep]
    for nid in dropped:
        del workflow[nid]
    if dropped:
        print(f"  [PRUNE] dropped {len(dropped)} bench node(s) not upstream of "
              f"{'/'.join(CAPTURE_TITLES)}")


def _bake_widgets(workflow: dict) -> None:
    """Force every BAKED_WIDGETS entry to its shipped fallback.

    A LINKED input is a hard failure, not something to bake over: the app injects into
    these by title, so an input driven by a wire makes the injection land on a value
    nothing reads and the graph runs whatever the upstream happens to produce."""
    for title, key, want in BAKED_WIDGETS:
        nid = _find_id_by_title(workflow, title)
        if nid is None:
            raise SystemExit(f"[FAIL] no node titled {title!r} — the app injects into it "
                             f"by title, and injection SILENTLY SKIPS a title that matches "
                             f"no node")
        got = workflow[nid]["inputs"].get(key)
        if isinstance(got, list):
            raise SystemExit(f"[FAIL] {title}.{key} is linked, not a widget — the app "
                             f"injects into it, so a link makes every run use the same "
                             f"upstream value regardless of what the user chose")
        workflow[nid]["inputs"][key] = want
        if got != want:
            print(f"  [BAKE] {title}.{key}: {got!r} -> {want!r}")


def _assert_weights(workflow: dict) -> None:
    """Every loader must name a weight the app actually declares as a dep."""
    found = {
        v
        for node in workflow.values()
        for k, v in node["inputs"].items()
        if k in WEIGHT_INPUT_KEYS and isinstance(v, str)
    }
    unexpected = found - EXPECTED_WEIGHTS
    missing = EXPECTED_WEIGHTS - found
    if unexpected or missing:
        raise SystemExit(
            f"[FAIL] loader weights do not match the declared deps.\n"
            f"        unexpected in graph: {sorted(unexpected) or 'none'}\n"
            f"        declared but unused: {sorted(missing) or 'none'}\n"
            f"        The graph and modelDeps.js/assetDeps.js must name the SAME files."
        )


def _assert_latent_titles(workflow: dict) -> None:
    """Exactly one stage node, correctly titled, and no leftovers of the old pair.

    H3 packs video AND audio into ONE NestedTensor latent, so the natural name for it is
    something like `Output_AV_Latent` — and that would break stage 2 silently. The app's
    `_latentRoleFromTitle` (js/services/commandExecutor.js) tags any title CONTAINING
    "audio" as the audio latent, which is a role H3 has no second slot for."""
    stage = [(nid, node) for nid, node in workflow.items()
             if node.get("class_type") == STAGE_CLASS]
    if len(stage) != 1:
        raise SystemExit(
            f"[FAIL] {len(stage)} {STAGE_CLASS} node(s), expected exactly 1 — this node "
            f"IS the two-stage handshake. Zero means the graph cannot continue from a "
            f"preview at all; two means the app's widget injection hits both and the "
            f"second one's gates are whatever the bench left behind")
    nid, node = stage[0]
    title = node.get("_meta", {}).get("title", "")
    if "audio" in title.lower():
        raise SystemExit(
            f"[FAIL] {STAGE_CLASS} node {nid} is titled {title!r} — the app reads "
            f"'audio' in a latent title as the AUDIO latent role. H3 has one packed "
            f"video+audio latent; it must be titled {STAGE_TITLE!r}.")
    if title != STAGE_TITLE:
        raise SystemExit(
            f"[FAIL] {STAGE_CLASS} node {nid} is titled {title!r}, expected "
            f"{STAGE_TITLE!r} — commandExecutor.js injects `{STAGE_TITLE}.is_continue` "
            f"and injection SILENTLY SKIPS a title that matches no node, so a rename "
            f"makes every continue re-run stage 1 and return a different sample")

    # The old pair must be GONE, not merely unused: a leftover MpiSaveLatent still saves
    # (it is an output node), so a stale one would race the stage node for the same
    # filename and stage 2 could resume from whichever wrote last.
    leftovers = [nid for nid, n in workflow.items()
                 if n.get("class_type") in ("MpiSaveLatent", "MpiLoadLatent")]
    if leftovers:
        raise SystemExit(
            f"[FAIL] {STAGE_CLASS} is present but node(s) {leftovers} still use the old "
            f"MpiSaveLatent/MpiLoadLatent pair — delete them; two savers on one filename "
            f"is a race, not a redundancy")


def _assert_branches(workflow: dict) -> int:
    """All four media combinations must still be reachable."""
    n = sum(1 for node in workflow.values()
            if node.get("class_type") == "MiniMaxH3ImageToVideo")
    if n != EXPECTED_H3_BRANCHES:
        raise SystemExit(f"[FAIL] {n} MiniMaxH3ImageToVideo node(s), expected "
                         f"{EXPECTED_H3_BRANCHES} — one per media combination (t2v, "
                         f"start only, end only, start+end). A missing branch does not "
                         f"error, it falls through to another and conditions on the "
                         f"wrong frames")
    return n


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Emit the ONE runtime file for the master template."""
    output_name = MODEL_VARIANTS.get(source_path.name)
    if output_name is None:
        print(f"  [WARN] {source_path.name} not in MODEL_VARIANTS — nothing to do")
        return []

    print(f"Template: {source_path.name}")
    workflow = json.loads(source_path.read_text(encoding="utf-8"))

    _prune_to_captures(workflow)
    _bake_widgets(workflow)
    _assert_weights(workflow)
    _assert_latent_titles(workflow)
    n_branches = _assert_branches(workflow)

    out_path = out_dir / output_name
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {output_name} ({len(workflow)} nodes, {n_branches} H3 branches)")
    return [out_path]


def main() -> None:
    """Standalone: rebuild the H3 runtime from the template alongside this script."""
    for template_name in MODEL_VARIANTS:
        template_path = SCRIPTS_DIR / template_name
        if not template_path.exists():
            template_path = WORKFLOWS_DIR / template_name
        if not template_path.exists():
            print(f"\n[SKIP] Template not found: {template_name}")
            continue
        print()
        build(template_path, WORKFLOWS_DIR)
    print("\nDone.")


if __name__ == "__main__":
    main()
