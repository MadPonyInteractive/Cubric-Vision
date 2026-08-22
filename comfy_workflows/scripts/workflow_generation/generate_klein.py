"""
generate_klein.py — FLUX.2 Klein handler: ONE master template → ONE runtime file PER SIZE.

Klein is the first model where EVERY op lives in a single graph. There is no op split
and no content axis, but there IS a size axis (4B / 9B) and it is handled HERE, in the
script, deliberately:

  * size     — 4B and 9B are the SAME graph. They differ only in VALUES: the four weight
               files the loaders name, plus the style rack — the ten lora slots and the
               trigger lines. The rack is a DIFFERENT SET per size, not a renamed twin:
               no muppets or jojo weight exists for 9B at all, so 9B ships 7 styles
               against 4B's 8, with its own labels and its own trigger text. The template
               stays single and this script bakes each variant; maintaining two
               near-identical templates by hand was rejected for that reason (MPI-598).
               The `Input_is_9b` gate that used to bypass the styles system on 9B is GONE
               — it only ever existed because 9B had no styles to apply.

  * ops      — t2i / i2i / depth / edit / inpaint / detail / upscale all sit in the one
               graph and are selected by the injected `Input_wf_type` int (1..7), which
               drives an MpiAnySwitch10 at the output plus internal gates
               (`is_i2i = wf_type == 2`, `is_remove` via MpiBooleanCompare). Lazy
               evaluation prunes the unselected branches at RUN time — measured on the
               bench at 4.03s for a t2i vs 7.46s for a depth run on the same graph
               carrying four samplers — so shipping one file costs nothing.
  * accel    — dropped on BOTH sizes. Each ships ONE distilled int8 checkpoint that
               already runs at cfg 1.0 / 4 steps. 4B's base+turbo pair went on 2026-07-27;
               9B's turbo LoRA and its KV variant were both benched and rejected on
               2026-08-22 (MPI-600). There is no tier axis to expose on either.
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

import copy
import json
from pathlib import Path
from typing import NamedTuple

# The style rack is the NODE PACK's contract (MpiStyleSelector + MpiStyleLoras banks of
# five), not Krea2's — so Klein reuses Krea2's assert rather than forking an 80-line copy
# that would rot the moment the rack changes shape. MPI-359 authored both models on it.
from generate_krea2 import _assert_style_rack

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

class KleinVariant(NamedTuple):
    """One size of Klein. Every field is a VALUE the template carries — nothing structural.

    `filename` values must match the corresponding dep `filename` tail in
    modelDeps.js / assetDeps.js / loraDeps.js EXACTLY. A mismatch is invisible until a
    user installs: the app downloads the dep it declares, and ComfyUI then cannot find
    the name baked into the graph. `_assert_weights` re-reads them after the swap.
    Subfoldered LoRAs are BACKSLASHED — that is how ComfyUI lists them (MPI-229 heal).

    `styles` is a list of (lora_name, trigger_line) PAIRS, one per style, in picker order.
    Pairs rather than two parallel lists on purpose: style N = trigger line N = the Nth
    lora slot walking the bank chain = the Nth entry of the ModelDef's `styleLoraLabels`,
    and that alignment is the whole contract. Two lists can drift by one and still build;
    a pair cannot. Index 0 ("No Style") is not in here — it is the selector's own
    pass-through, not a slot.
    """
    out_name: str
    unet: str
    clip: str
    nsfw_lora: str
    depth_lora: str
    styles: tuple[tuple[str, str], ...]


_S = "flux2-klein\\styles\\"   # every style LoRA lives here, backslashed (MPI-229 heal)

MODEL_VARIANTS = {
    "klein_t2i_template.json": [
        KleinVariant(
            out_name="klein_t2i.json",
            unet="flux-2-klein-4b-int8-convrot.safetensors",
            clip="qwen_3_4b.safetensors",
            nsfw_lora="flux2-klein\\NSFW_party_time_v2.0_klein4b.safetensors",
            depth_lora="flux2-klein\\flux2_klein_4b_refcontrol_depth.safetensors",
            # 8 styles (MPI-354). These are the values the authoring template already
            # carries — they live here now so BOTH sizes are baked the same way and
            # neither is the "default" one an edit can silently change.
            styles=(
                (_S + "flux2-klein-4b-lora-muppetshow-style.safetensors",
                 "display the characters as Muppets, muppetshow style"),
                (_S + "flux2-klein-4b-lora-Fluxtoon-Style.safetensors",
                 "cartoon illustration, Fluxtoon Style"),
                (_S + "flux2-klein-4b-lora-Jojoso-Style_000002000.safetensors",
                 "JojosoStyle"),
                (_S + "Anime_new_mecha_klein4b.safetensors",
                 "An anime-style digital illustration"),
                (_S + "robloxchibidoll_lora_klein4b_000002200.safetensors",
                 "chibi style"),
                (_S + "klein4b-doodle_v1.safetensors",
                 "Redraw this image in the most clumsy, scribbly, and utterly pathetic way possible."),
                (_S + "vintage_photo.safetensors",
                 "vintage photo 1920's style"),
                (_S + "Flux-Klein-4B-Art_10.safetensors",
                 "Artistic and aesthetic composition"),
            ),
        ),
        # 9B (MPI-598). Distilled INT8 at 4 steps / cfg 1.0. NOTE the transformer and the
        # text encoder are both named `int8_convrot` and NEITHER is ConvRot — both are
        # plain `int8_tensorwise` with a scalar weight_scale (headers read 2026-08-22),
        # where 4B's is genuinely rowwise. The filenames are wrong upstream; we ship them
        # as published, so do not "correct" these strings.
        KleinVariant(
            out_name="klein_9b_t2i.json",
            unet="flux-2-klein-9b-int8-convrot.safetensors",
            clip="qwen_3_8b_int8_convrot.safetensors",
            nsfw_lora="flux2-klein\\NSFW_party_time_v2.0_klein9b.safetensors",
            depth_lora="flux2-klein\\flux2_klein_9b_refcontrol_depth.safetensors",
            # 7 styles, NOT 8, and NOT a renamed 4B set. Only three are the same creator's
            # 9B build of the weight 4B ships (anime / chibi / doodle — hash-verified
            # twins). Muppets and JoJo have NO 9B weight in existence: searched across
            # CivArchive's full 1,179-record Klein-9B catalogue, Hugging Face, and
            # CivitAI's own API. The other three slots are substitutes by a different
            # creator, so their LABEL and trigger describe what the weight actually does —
            # calling PULPKHOR "Jojo" or Disney-mid-century "Fluxtoon" would be a lie the
            # picker tells the user. Research + licences:
            # .agents/mpi-kanban/tasks/MPI-598/research/klein9b-style-loras.md
            styles=(
                (_S + "DisneyMidCenturyKlein9b.safetensors",
                 "Disney Mid-Century Animation"),
                (_S + "PULPKHOR.safetensors",
                 "vintage comic illustration, PULPKHOR style, distressed paper textures, "
                 "scratches, and faint halftone printing dots"),
                (_S + "New_Mecha_Klein9B.safetensors",
                 "An anime-style digital illustration"),
                (_S + "robloxchibidoll_lora_klein9b.safetensors",
                 "chibi style"),
                (_S + "klein9b-doodle_v1.safetensors",
                 "Redraw this image in the most clumsy, scribbly, and utterly pathetic way possible."),
                # Renamed from the upstream `Vintage.safetensors` — far too generic a name
                # to bake into a graph and a dep filename forever. Same bytes, sha256
                # 7ec32ba728ee4b42fb68074e8da5f8d965813c2ff3f17186141257a265d32d92.
                # NOTE the era differs from 4B's: this one is 1960s-80s, 4B's is 1920s.
                (_S + "Real_Vintage_Photo_klein9b.safetensors",
                 "vintage photo, 1960's style"),
                (_S + "amano_flux_02.safetensors",
                 "amano watercolor and ink sketch with loose, gestural brushwork"),
            ),
        ),
    ],
}

NSFW_LORA_TITLE = "NSFW LoRA"
STYLE_SELECTOR_TITLE = "Input_Style_Selector"
STYLE_BANK_SLOTS = 5   # MpiStyleLoras exposes lora_1..lora_5

# BOTH captures, not just the image. `Output_prompt` is the MPI-242 contract: a PreviewAny
# whose string the app reads back as "what the encoder actually saw" (the enhancer output).
# Pruning to Output_Image alone — the Qwen handler's rule — would drop it and kill that
# feature with no error anywhere. Any new Output_* title must be added here.
CAPTURE_TITLES = ("Output_Image", "Output_prompt")

WF_TYPE_TITLE = "Input_wf_type"
# The weight names moved into MODEL_VARIANTS above (one set per size) and are verified by
# _assert_weights. The hazard that check exists for is unchanged and worth restating: on
# 2026-07-27 the 4B dep pointed at the BASE weight while the graph loaded the DISTILLED
# one, and nothing caught it until an R2 upload was attempted.


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


def _only_id_of_class(workflow: dict, class_type: str) -> str:
    """The id of the ONE node of this class. Raises if there is not exactly one.

    Selecting by class (not title) because the template leaves these loaders untitled,
    so their API `_meta.title` is just the node's default display name — a string that
    changes whenever ComfyUI renames a node. The count assert is the real guard: the
    moment the graph grows a second UNETLoader/CLIPLoader, a swap that silently hit only
    one of them would ship a graph loading a 4B transformer with a 9B encoder.
    """
    ids = [nid for nid, n in workflow.items()
           if isinstance(n, dict) and n.get("class_type") == class_type]
    if len(ids) != 1:
        raise SystemExit(f"[FAIL] expected exactly ONE {class_type} node, found "
                         f"{len(ids)} ({ids}) — the size swap targets it by class, so a "
                         f"second one means the swap can no longer be applied safely")
    return ids[0]


def _lora_ids(workflow: dict) -> tuple[str, str]:
    """(nsfw_id, depth_id). Exactly two LoraLoaderModelOnly, one of them titled 'NSFW LoRA'.

    The depth loader is the REMAINDER rather than a title match: it is untitled in the
    template, and 'Load LoRA' (its API default) is far too generic to bind to. Asserting
    the total is 2 makes "the other one" unambiguous — and makes a third baked LoRA a
    loud failure instead of a coin flip. The outpaint LoRA that used to be the third was
    removed with the fake-inpaint path (LanPaint replaced it); if one comes back, this is
    the line that will stop the build and ask which is which.
    """
    ids = [nid for nid, n in workflow.items()
           if isinstance(n, dict) and n.get("class_type") == "LoraLoaderModelOnly"]
    if len(ids) != 2:
        raise SystemExit(f"[FAIL] expected exactly TWO LoraLoaderModelOnly (NSFW + depth "
                         f"refcontrol), found {len(ids)} ({ids}) — both are size-specific, "
                         f"so an unrecognised third would silently keep its 4B weight on "
                         f"the 9B graph")
    nsfw = _find_id_by_title(workflow, NSFW_LORA_TITLE)
    if nsfw is None or nsfw not in ids:
        raise SystemExit(f"[FAIL] no LoraLoaderModelOnly titled {NSFW_LORA_TITLE!r} — the "
                         f"two baked LoRAs cannot be told apart without it")
    depth = next(nid for nid in ids if nid != nsfw)
    return nsfw, depth


def _style_bank_chain(workflow: dict) -> tuple[str, list[str]]:
    """(selector_id, bank_ids in chain order). Same walk `_assert_style_rack` validates.

    Local rather than imported from generate_krea2: that module exposes the ASSERT, not
    the walk, and widening its API would put Krea2's build in the blast radius of a Klein
    change. The duplication is ten lines and the assert still runs over the result, so a
    divergence between the two walks fails the build rather than shipping."""
    sel = _find_id_by_title(workflow, STYLE_SELECTOR_TITLE)
    if sel is None:
        raise SystemExit(f"[FAIL] no node titled {STYLE_SELECTOR_TITLE!r} — the style rack "
                         f"is baked per size, so without it neither size gets its styles")
    by_upstream: dict[str, str] = {}
    for nid, nd in workflow.items():
        if isinstance(nd, dict) and nd.get("class_type") == "MpiStyleLoras":
            src = nd["inputs"].get("style")
            if isinstance(src, list):
                by_upstream[src[0]] = nid
    chain: list[str] = []
    cur = sel
    while cur in by_upstream:
        cur = by_upstream.pop(cur)
        chain.append(cur)
    return sel, chain


def _apply_styles(workflow: dict, v: KleinVariant) -> None:
    """Write ONE size's style set: the lora slots walking the bank chain + the triggers.

    The picker sends an INDEX (`Input_Style_Selector.selector`), never a filename, so the
    slot order here IS the user-facing style order and must match the ModelDef's
    `styleLoraLabels`. Unused tail slots are cleared to "None" — leaving the other size's
    weight in slot 8 would give the 9B graph a 4B LoRA that no trigger line reaches, which
    `_assert_style_rack` catches, but clearing is the fix, not the assert."""
    sel_id, banks = _style_bank_chain(workflow)
    slots = len(banks) * STYLE_BANK_SLOTS
    if len(v.styles) > slots:
        raise SystemExit(f"[FAIL] {v.out_name}: {len(v.styles)} styles but only {slots} lora "
                         f"slots ({len(banks)} bank(s) x {STYLE_BANK_SLOTS}) — add a bank to "
                         f"the template, the extra styles cannot be reached")
    names = [lora for lora, _ in v.styles] + ["None"] * (slots - len(v.styles))
    for b, bank_id in enumerate(banks):
        for i in range(1, STYLE_BANK_SLOTS + 1):
            workflow[bank_id]["inputs"][f"lora_{i}"] = names[b * STYLE_BANK_SLOTS + i - 1]

    if isinstance(workflow[sel_id]["inputs"].get("triggers"), list):
        raise SystemExit(f"[FAIL] {STYLE_SELECTOR_TITLE}.triggers is linked, not a widget — "
                         f"this script bakes it per size, so a link makes both sizes append "
                         f"whatever the upstream produces")
    workflow[sel_id]["inputs"]["triggers"] = "\n".join(t for _, t in v.styles)
    print(f"  [STYLES] {len(v.styles)} styles baked into {len(banks)} bank(s)")


def _apply_variant(workflow: dict, v: KleinVariant) -> None:
    """Bake the four weight names + the style rack for ONE size.

    This is the whole 4B/9B difference. Everything else in the graph is shared, which is
    the point: one authored template, two runtime files, no hand-maintained twin.
    """
    unet_id = _only_id_of_class(workflow, "UNETLoader")
    clip_id = _only_id_of_class(workflow, "CLIPLoader")
    nsfw_id, depth_id = _lora_ids(workflow)

    workflow[unet_id]["inputs"]["unet_name"] = v.unet
    workflow[clip_id]["inputs"]["clip_name"] = v.clip
    workflow[nsfw_id]["inputs"]["lora_name"] = v.nsfw_lora
    workflow[depth_id]["inputs"]["lora_name"] = v.depth_lora

    # The CLIPLoader `type` is NOT size-specific — both sizes load their Qwen3 encoder at
    # type `flux2`. Asserted rather than set, so a template edit that changes it surfaces.
    clip_type = workflow[clip_id]["inputs"].get("type")
    if clip_type != "flux2":
        raise SystemExit(f"[FAIL] CLIPLoader.type is {clip_type!r}, expected 'flux2' — "
                         f"both Klein sizes load their text encoder at that type")

    _apply_styles(workflow, v)


def _assert_weights(workflow: dict, v: KleinVariant) -> None:
    """Re-read the four names AFTER the swap. Cheap, and it is the only thing standing
    between a typo in the table above and a graph that 404s on the user's disk."""
    got = {
        "UNETLoader.unet_name": workflow[_only_id_of_class(workflow, "UNETLoader")]["inputs"]["unet_name"],
        "CLIPLoader.clip_name": workflow[_only_id_of_class(workflow, "CLIPLoader")]["inputs"]["clip_name"],
    }
    nsfw_id, depth_id = _lora_ids(workflow)
    got["NSFW LoRA.lora_name"] = workflow[nsfw_id]["inputs"]["lora_name"]
    got["depth LoRA.lora_name"] = workflow[depth_id]["inputs"]["lora_name"]
    want = {
        "UNETLoader.unet_name": v.unet,
        "CLIPLoader.clip_name": v.clip,
        "NSFW LoRA.lora_name": v.nsfw_lora,
        "depth LoRA.lora_name": v.depth_lora,
    }
    for k, expected in want.items():
        if got[k] != expected:
            raise SystemExit(f"[FAIL] {v.out_name}: {k} is {got[k]!r}, expected {expected!r}")


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Emit ONE runtime file per size from the master template."""
    variants = MODEL_VARIANTS.get(source_path.name)
    if variants is None:
        print(f"  [WARN] {source_path.name} not in MODEL_VARIANTS — nothing to do")
        return []

    print(f"Template: {source_path.name}")
    template = json.loads(source_path.read_text(encoding="utf-8"))

    written: list[Path] = []
    for v in variants:
        # deepcopy per variant — the swaps and the prune both mutate, so sharing one dict
        # would leak the first size's weights into the second.
        workflow = copy.deepcopy(template)

        _prune_to_captures(workflow)
        _assert_and_bake_wf_type(workflow)
        _apply_variant(workflow, v)
        _assert_weights(workflow, v)
        # Re-read the rack AFTER _apply_styles wrote it. This is the check that catches a
        # size whose style count and trigger-line count disagree, or a leftover weight in
        # a slot past the last trigger line — both of which produce a plausible wrong
        # image rather than an error.
        n_styles = _assert_style_rack(workflow)
        if n_styles != len(v.styles):
            raise SystemExit(f"[FAIL] {v.out_name}: baked {len(v.styles)} styles but the rack "
                             f"reads {n_styles} — the slots and the trigger lines disagree")

        out_path = out_dir / v.out_name
        out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
        print(f"  [OK]   {v.out_name} ({len(workflow)} nodes, {n_styles} style LoRAs)")
        written.append(out_path)
    return written


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
