"""
generate_ltx.py
LTX-2.3 handler: from ONE i2v+t2v API export, produce TWO app workflow files —
one per quality tier, each serving every op and both stages:

  ltx_i2v_t2v.json       — bf16 transformer  (the `ltx-23` HIGH card)
  ltx_i2v_t2v_int8.json  — int8 transformer  (the `ltx-23-balanced` card)

MPI-466 collapsed this from TWELVE files (i2v/t2v x bf16/fp8/mxfp8 x
stage-1/stage-2). Three things went away at once:

  1. THE MODE SPLIT. The graph no longer carries `Input_Text_to_video` or
     `Input_Use_End_Image`. Routing derives from which media strings are filled
     (`Input_Start_Frame` / `Input_End_Frame` feed lazy branches), so t2v,
     start-only, end-only and start+end are all reachable in one file and
     illegal states are unreachable. Same shape H3 uses.

  2. THE STAGE SPLIT. `MpiStageLatents` (titled `Input_Video_Latent`) replaced
     the eight-node cluster — two SaveLatent, two LoadLatent and the boolean
     gates. Its `is_continue` / `is_preview` are WIDGETS, so the app addresses
     them as `Input_Video_Latent.is_continue` instead of needing a titled node
     per flag. No `_stage2` twin file exists, or may be created; the ModelDefs
     declare `capabilities.singleFileStages: true` so `resolveWorkflowFile`
     stops appending the suffix.

  3. THE ARCH AXIS. int8 replaced the fp8_scaled / mxfp8_block32 pair, so the
     `variants.arch` block and its `_fp8` / `_mxfp8` workflow suffixes are gone.
     What remains is a genuine QUALITY tier, not a GPU-family selector, which is
     why the two files are named by dtype rather than resolved from an axis.

ALL node lookup is by `_meta.title` — never by node id (ids change on re-export).

Authoring contract (you, once per workflow, in the ComfyUI graph):
  - Title the MpiStageLatents node -> "Input_Video_Latent"
  - Keep "Output_Video" and "Output_Preview" on the two SaveVideo nodes
  - Save as API, drop ltx_i2v_t2v_template.json in this folder
"""

import json
import copy
from pathlib import Path

UNET_LOADER_TITLE = "Load Diffusion Model"   # the single UNETLoader in the graph
STAGE_LATENTS_TITLE = "Input_Video_Latent"   # MpiStageLatents: the whole two-stage handshake

# suffix: (unet_name, weight_dtype). weight_dtype stays "default" for both — the
# quantization is baked in the safetensors metadata and UNETLoader reads it there;
# naming a dtype the node does not list is a value_not_in_list reject.
VARIANTS = {
    "":      ("ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors",         "default"),
    "_int8": ("ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot.safetensors", "default"),
}

# Titles that MUST survive into every output (sanity gate).
REQUIRED_TITLES = [
    {"Output_Video"},          # final capture (SaveVideo)
    {"Output_Preview"},        # preview capture (SaveVideo)
    {STAGE_LATENTS_TITLE},     # MpiStageLatents — no stage handshake without it
]


def _find_by_title(wf: dict, title: str) -> str:
    hits = [nid for nid, n in wf.items()
            if isinstance(n, dict) and n.get("_meta", {}).get("title") == title]
    if len(hits) != 1:
        raise SystemExit(
            f"[FAIL] Expected exactly ONE node titled {title!r}, found {len(hits)}."
        )
    return hits[0]


def _stamp_transformer(wf: dict, unet_name: str, weight_dtype: str) -> None:
    nid = _find_by_title(wf, UNET_LOADER_TITLE)
    inputs = wf[nid].setdefault("inputs", {})
    for key in ("unet_name", "weight_dtype"):
        if key not in inputs:
            raise SystemExit(
                f"[FAIL] Node titled {UNET_LOADER_TITLE!r} has no {key!r} input "
                f"(got {sorted(inputs)}); cannot stamp the transformer variant."
            )
    inputs["unet_name"] = unet_name
    inputs["weight_dtype"] = weight_dtype


def _bake_stage_one(wf: dict) -> None:
    """Force the stage flags to a stage-1 full run.

    The app drives both flags at dispatch (`Input_Video_Latent.is_continue` /
    `.is_preview`), so whatever the bench happened to be set to when the graph
    was exported is leftover state, not intent. Baking it means a graph queued
    straight on an engine — a smoke run, a bug repro — behaves like the app's
    default rather than silently continuing from a stale mpi_stage1 latent.
    """
    nid = _find_by_title(wf, STAGE_LATENTS_TITLE)
    inputs = wf[nid].setdefault("inputs", {})
    for key in ("is_continue", "is_preview"):
        if key not in inputs:
            raise SystemExit(
                f"[FAIL] Node titled {STAGE_LATENTS_TITLE!r} has no {key!r} input "
                f"(got {sorted(inputs)}); is it really MpiStageLatents?"
            )
        inputs[key] = False


def _check_required(wf: dict, label: str) -> None:
    present = {n.get("_meta", {}).get("title") for n in wf.values() if isinstance(n, dict)}
    for alts in REQUIRED_TITLES:
        if not (alts & present):
            raise SystemExit(f"[FAIL] {label} missing a required node titled one of {sorted(alts)}.")
    # A _stage2 twin must never come back: the app resolves stage 2 in-file now, and
    # a stray twin would be loaded by nothing while quietly drifting from this source.
    for banned in ("Input_Is_Continue", "Input_Preview_Only", "Input_Text_to_video"):
        if banned in present:
            raise SystemExit(
                f"[FAIL] {label} still carries {banned!r}. That gate was replaced by "
                f"{STAGE_LATENTS_TITLE!r} widgets / media-derived routing (MPI-466); "
                f"re-export from the current graph."
            )


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. source = the i2v+t2v API export. Writes ONE file per
    tier variant: no mode split, no stage twin, no arch axis."""
    template = json.loads(source_path.read_text(encoding="utf-8"))
    _check_required(template, "Source template")

    written: list[Path] = []
    for vsuffix, (unet_name, weight_dtype) in VARIANTS.items():
        wf = copy.deepcopy(template)
        _stamp_transformer(wf, unet_name, weight_dtype)
        _bake_stage_one(wf)
        out = out_dir / f"ltx_i2v_t2v{vsuffix}.json"
        out.write_text(json.dumps(wf, indent=2), encoding="utf-8")
        print(f"  [OK]   {out.name} (unet={unet_name})")
        written.append(out)

    return written
