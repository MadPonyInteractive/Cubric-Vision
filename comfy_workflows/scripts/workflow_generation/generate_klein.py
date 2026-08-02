"""
generate_klein.py — FLUX.2 Klein 4B handler: ONE master template → ONE runtime file.

Klein is the first model where EVERY op lives in a single graph. There is no op split,
no tier axis and no content axis:

  * ops      — t2i / i2i / depth / edit / inpaint / detail / upscale all sit in the one
               graph and are selected by the injected `Input_wf_type` int (1..7), which
               drives an MpiAnySwitch10 at the output plus internal gates
               (`is_i2i = wf_type == 2`, `is_remove` via MpiBooleanCompare). Lazy
               evaluation prunes the unselected branches at RUN time — measured on the
               bench at 4.03s for a t2i vs 7.46s for a depth run on the same graph
               carrying four samplers — so shipping one file costs nothing.
  * tier     — dropped. Klein ships ONE distilled int8 checkpoint that already runs at
               cfg 1.0 / 4 steps; the base+turbo two-tier pair it replaced is gone.
  * content  — the NSFW LoRA is PROMPT-GATED inside the graph (an MpiTextContains scan of
               Input_Positive feeds an MpiMath `1.0 if a else 0.0` into node 38's
               strength), so content is a runtime property, not a file axis. No sfw/nsfw
               split like Krea2's.

So this handler bakes NOTHING. Its whole job is to strip the authoring bench and then
refuse to emit a graph that would fail SILENTLY at run time. Every assert below exists
because its failure mode produces a plausible WRONG IMAGE rather than an error.

Orchestrated: build(source_path, out_dir) — called by orchestrate.py after the `klein_`
prefix routes here (registry.py).
Standalone:  python generate_klein.py

Node lookup is by `_meta.title` (MPI-116 naming law) — never by node id.
"""

import json
from pathlib import Path

# The style rack is the NODE PACK's contract (MpiStyleSelector + MpiStyleLoras banks of
# five), not Krea2's — so Klein reuses Krea2's assert rather than forking an 80-line copy
# that would rot the moment the rack changes shape. MPI-359 authored both models on it.
from generate_krea2 import _assert_style_rack

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

MODEL_VARIANTS = {
    "klein_t2i_template.json": "klein_t2i.json",
}

# BOTH captures, not just the image. `Output_prompt` is the MPI-242 contract: a PreviewAny
# whose string the app reads back as "what the encoder actually saw" (the enhancer output).
# Pruning to Output_Image alone — the Qwen handler's rule — would drop it and kill that
# feature with no error anywhere. Any new Output_* title must be added here.
CAPTURE_TITLES = ("Output_Image", "Output_prompt")

WF_TYPE_TITLE = "Input_wf_type"
UNET_LOADER_TITLE = "Load Diffusion Model"
# Must match the `klein-4b-transformer` dep filename tail in modelDeps.js. Swapped
# base -> distilled 2026-07-27; the dep pointed at the base weight for a day while the
# graph loaded the distilled one, which nothing caught until an R2 upload was attempted.
EXPECTED_UNET = "flux-2-klein-4b-int8-convrot.safetensors"


def _find_id_by_title(workflow: dict, title: str) -> str | None:
    for nid, node in workflow.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _prune_to_captures(workflow: dict) -> None:
    """Drop every node not upstream of one of CAPTURE_TITLES.

    The authoring bench leaves orphans behind — on the first export, a spare
    DepthAnythingV2Preprocessor and an AIO_Preprocessor, both with an UNCONNECTED required
    `image` input. They are harmless on the bench because ComfyUI only validates nodes
    reachable from an output node, but they are dead weight in a shipped graph and they
    make `missing-required` checks noisy, which trains people to ignore them."""
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


def _assert_and_bake_wf_type(workflow: dict, wf_type: int = 1) -> None:
    """`Input_wf_type` must exist and be a PLAIN WIDGET, never a link — then bake it to 1.

    This is the one-file template's central footgun. The app injects the op number into
    this node; if it is driven by a link instead, the injection lands on a value nothing
    reads and the graph runs whatever branch the upstream happens to produce. The result
    is a plausible image from the WRONG op, which reads as a model quality problem rather
    than a wiring bug.

    The bake is the same guard `generate_qwen.py::_bake_wf_type` carries, and Klein needs
    it for the same reason: the AUTHORING graph holds whatever branch the user was last
    testing (the 2026-08-02 depth-strength export came back baked to 3), so an un-baked
    template ships that as the fallback. It only shows through when injection fails — and
    injection failing is exactly when a wrong branch is hardest to spot."""
    nid = _find_id_by_title(workflow, WF_TYPE_TITLE)
    if nid is None:
        raise SystemExit(f"[FAIL] no node titled {WF_TYPE_TITLE!r} — every op selects its "
                         f"branch through it; without it the graph runs ONE fixed branch")
    if isinstance(workflow[nid]["inputs"].get("int"), list):
        raise SystemExit(f"[FAIL] {WF_TYPE_TITLE}.int is linked, not a widget — the app "
                         f"injects into it, so a link makes every op silently run the "
                         f"same branch")
    before = workflow[nid]["inputs"].get("int")
    workflow[nid]["inputs"]["int"] = wf_type
    if before != wf_type:
        print(f"  [WFTYPE] {WF_TYPE_TITLE}.int: {before!r} -> {wf_type}")


def _assert_unet(workflow: dict) -> None:
    """The loader weight must be the one dependencies.js actually hosts. A mismatch is
    invisible until a user installs: the app downloads the dep it declares and ComfyUI
    then fails to find the name baked in the graph."""
    nid = _find_id_by_title(workflow, UNET_LOADER_TITLE)
    if nid is None:
        raise SystemExit(f"[FAIL] no node titled {UNET_LOADER_TITLE!r} — cannot verify the "
                         f"Klein transformer weight")
    got = workflow[nid]["inputs"].get("unet_name")
    if got != EXPECTED_UNET:
        raise SystemExit(f"[FAIL] {UNET_LOADER_TITLE}.unet_name is {got!r}, expected "
                         f"{EXPECTED_UNET!r} — the graph and the klein-4b-transformer dep "
                         f"in modelDeps.js must name the SAME file")


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Emit the ONE runtime file for the master template."""
    output_name = MODEL_VARIANTS.get(source_path.name)
    if output_name is None:
        print(f"  [WARN] {source_path.name} not in MODEL_VARIANTS — nothing to do")
        return []

    print(f"Template: {source_path.name}")
    workflow = json.loads(source_path.read_text(encoding="utf-8"))

    _prune_to_captures(workflow)
    _assert_and_bake_wf_type(workflow)
    _assert_unet(workflow)
    n_styles = _assert_style_rack(workflow)

    out_path = out_dir / output_name
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {output_name} ({len(workflow)} nodes, {n_styles} style LoRAs)")
    return [out_path]


def main() -> None:
    """Standalone: rebuild the Klein template from files alongside this script."""
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
