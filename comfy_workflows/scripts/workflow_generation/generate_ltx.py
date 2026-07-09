"""
generate_ltx.py
LTX-2.3 handler: from ONE i2v+t2v API export, produce FOUR app workflow files —
the four mode/stage variants, all bf16 (both engines run the same transformer):
  LTX_i2v.json         — Input_Text_to_video=false, Input_Is_Continue=false
  LTX_i2v_stage2.json  — derived: Input_Is_Continue flipped true
  LTX_t2v.json         — Input_Text_to_video=true,  Input_Is_Continue=false
  LTX_t2v_stage2.json  — derived: Input_Is_Continue flipped true

MPI-190: the bf16/GGUF engine split was REVERTED. cu130 (MPI-187/189) collapsed
the aimdo cold-fault tax that was the GGUF transformer's only justification, so
both engines now run the same bf16 UNETLoader + the same files — no `_gguf`
siblings, no loader-swap. The template carries a single wired bf16 `UNETLoader`
(the parked `UnetLoaderGGUF` was removed from the graph), so nothing to keep or
delete. The CLIP is a single shared Gemma fp4_mixed loader across every engine/tier.

ALL node lookup is by `_meta.title` — never by node id (ids change on re-export).

Two LTX-specific differences from the WAN handler:

  1. FAN-OUT. The single source drives both modes via the `Input_Text_to_video`
     MpiSimpleBoolean gate. We stamp it per output file (i2v=false, t2v=true);
     the app injects nothing mode-related — the op->file map encodes the mode.
     FF/LF rides the i2v file's `Input_Use_End_Image` gate (not a separate file).

  2. NO bypass-splice. Unlike WAN (which deletes its stage-1 sampler and rewires
     consumers), the LTX graph bakes the stage-2 switch in: `Input_Is_Continue`
     (#71) drives MpiIfElse gates that select the loaded video/audio latents over
     the live stage-1 latents. The stage-1 sampler stays in the graph; ComfyUI
     skips it because nothing consumes its output once the switch flips. So the
     stage-2 derivation is just: flip `Input_Is_Continue` -> true. No deletion,
     no slot-map, no rewiring.

Authoring contract (you, once per workflow, in the ComfyUI graph):
  - Title the i2v/t2v mode gate MpiSimpleBoolean -> "Input_Text_to_video"
  - Title the stage-2 gate MpiBoolean            -> "Input_Is_Continue" (baked false)
  - Save (API), drop LTX_*_template.json in this folder.
"""

import json
import copy
from pathlib import Path

T2V_GATE_TITLE = "Input_Text_to_video"   # MpiSimpleBoolean: false=i2v, true=t2v
IS_CONTINUE_TITLE = "Input_Is_Continue"  # MpiBoolean: false=stage-1, true=stage-2

# MPI-200: quality tiers. ONE template, three transformer variants — only the
# UNETLoader ("Load Diffusion Model") node changes (unet_name + weight_dtype);
# CLIP (shared gemma fp4), VAEs, samplers and gates are identical across all
# three. bf16 = the high-tier quality ceiling (unsuffixed filenames = the
# existing files, zero churn). fp8_scaled + mxfp8_block32 = the balanced tier;
# the app arch-selects between them (Blackwell → mxfp8, Ada/older → fp8_scaled).
# Kijai comfy-format weights ONLY — the official Lightricks fp8 repo is broken.
UNET_LOADER_TITLE = "Load Diffusion Model"  # the single UNETLoader in the graph
VARIANTS = {
    # suffix: (unet_name, weight_dtype)
    "":       ("ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors",         "default"),
    "_fp8":   ("ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors",   "default"),
    # weight_dtype stays "default": UNETLoader has NO 'mxfp8' option (only
    # default/fp8_e4m3fn/fp8_e4m3fn_fast/fp8_e5m2). The mxfp8 quantization is
    # baked in the safetensors metadata — the loader reads it under "default".
    # Selecting a dtype that isn't in the node's list = value_not_in_list reject.
    "_mxfp8": ("ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors", "default"),
}

# Media-input placeholders. The graph won't run without these LoadImage/LoadAudio
# nodes holding SOME file, and ComfyUI validates them at prompt time even when the
# output is gated off (t2v never uses the frames; an audio-less gen never uses the
# wav). The app stages these exact filenames into the engine input/ on every submit
# (routes/comfy.js WORKFLOW_INPUT_DEFAULTS) and injects real media over them at gen
# time. But the EXPORTED template carries whatever test files were loaded in the
# ComfyUI browser when you saved (e.g. a real mp3) — those don't exist on the engine
# and reject. So stamp each media node back to its staged placeholder. Each entry:
# title -> (filename_input_key, placeholder_filename).
MEDIA_PLACEHOLDERS = {
    "Input_Start_Frame": ("image", "placeholder.png"),
    "Input_End_Frame":   ("image", "placeholder.png"),
    "Input_Audio_File":  ("audio", "ltx_silence.wav"),
}

# Titles that MUST survive into every output (sanity gate). Each entry is a set
# of acceptable alternatives (any one present passes).
REQUIRED_TITLES = [
    {"Output_Video"},          # final capture (SaveVideo)
    {"Output_Preview"},        # tier-2 preview capture (SaveVideo)
    {"Input_Video_Latent"},    # stage-2 loaded video latent
    {"Input_Audio_Latent"},    # stage-2 loaded audio latent (LTX saves TWO latents)
    {IS_CONTINUE_TITLE},
    {T2V_GATE_TITLE},
]


def _find_node_id_by_title(wf: dict, title: str) -> str | None:
    for nid, node in wf.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _set_boolean(wf: dict, title: str, value: bool) -> None:
    nid = _find_node_id_by_title(wf, title)
    if nid is None:
        raise SystemExit(
            f"[FAIL] No node titled {title!r}. Title the gate {title!r} in the "
            f"ComfyUI graph and re-export the API JSON."
        )
    inputs = wf[nid].setdefault("inputs", {})
    if "boolean" not in inputs:
        raise SystemExit(
            f"[FAIL] Node titled {title!r} has no 'boolean' input (got "
            f"{sorted(inputs)}); cannot stamp it."
        )
    inputs["boolean"] = value


def _stamp_transformer(wf: dict, unet_name: str, weight_dtype: str) -> None:
    """MPI-200: stamp the single UNETLoader with a tier variant's transformer file
    and weight_dtype. Fails loud on a missing node or input (a rename must not
    silently ship the wrong/unchanged loader)."""
    nid = _find_node_id_by_title(wf, UNET_LOADER_TITLE)
    if nid is None:
        raise SystemExit(
            f"[FAIL] No node titled {UNET_LOADER_TITLE!r}. Title the UNETLoader "
            f"{UNET_LOADER_TITLE!r} in the ComfyUI graph and re-export."
        )
    inputs = wf[nid].setdefault("inputs", {})
    for key in ("unet_name", "weight_dtype"):
        if key not in inputs:
            raise SystemExit(
                f"[FAIL] Node titled {UNET_LOADER_TITLE!r} has no {key!r} input "
                f"(got {sorted(inputs)}); cannot stamp the transformer variant."
            )
    inputs["unet_name"] = unet_name
    inputs["weight_dtype"] = weight_dtype


def _stamp_placeholders(wf: dict) -> None:
    """Reset each media-input node's filename to its staged placeholder, so the
    generated workflow validates on any engine regardless of what test media was
    loaded in the ComfyUI browser at export. Fails loud on a missing node (a
    rename must not silently skip a stamp). Also drops a stale `audioUI` preview
    ref, which otherwise points the ComfyUI UI at the absent test file."""
    for title, (key, filename) in MEDIA_PLACEHOLDERS.items():
        nid = _find_node_id_by_title(wf, title)
        if nid is None:
            raise SystemExit(
                f"[FAIL] No media node titled {title!r}. Title it in the ComfyUI "
                f"graph and re-export, or update MEDIA_PLACEHOLDERS."
            )
        inputs = wf[nid].setdefault("inputs", {})
        if key not in inputs:
            raise SystemExit(
                f"[FAIL] Node titled {title!r} has no {key!r} input (got "
                f"{sorted(inputs)}); cannot stamp the placeholder."
            )
        inputs[key] = filename
        inputs.pop("audioUI", None)  # stale browser-preview ref to the test file
    print(f"  [media] stamped {len(MEDIA_PLACEHOLDERS)} placeholder input(s)")


def _check_required(wf: dict, label: str) -> None:
    present = {n.get("_meta", {}).get("title") for n in wf.values() if isinstance(n, dict)}
    for alts in REQUIRED_TITLES:
        if not (alts & present):
            raise SystemExit(f"[FAIL] {label} missing a required node titled one of {sorted(alts)}.")


def _variant(template: dict, t2v: bool) -> dict:
    """Stage-1 file for one mode: stamp the mode gate, ensure Is_Continue=false."""
    wf = copy.deepcopy(template)
    _set_boolean(wf, T2V_GATE_TITLE, t2v)
    _set_boolean(wf, IS_CONTINUE_TITLE, False)
    return wf


def _derive_stage2(stage1: dict) -> dict:
    """Stage-2 = stage-1 with Input_Is_Continue flipped true. Nothing else."""
    wf = copy.deepcopy(stage1)
    _set_boolean(wf, IS_CONTINUE_TITLE, True)
    return wf


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. source = i2v+t2v API export. Writes 12 files:
    4 mode/stage variants (i2v/t2v × stage-1/stage-2) × 3 tier variants
    (bf16/fp8/mxfp8). MPI-200: only the UNETLoader changes per tier variant;
    bf16 keeps the unsuffixed filenames (the high-tier card's existing files)."""
    template = json.loads(source_path.read_text(encoding="utf-8"))
    _check_required(template, "Source template")

    written: list[Path] = []
    for vsuffix, (unet_name, weight_dtype) in VARIANTS.items():
        for name, t2v in (("LTX_i2v", False), ("LTX_t2v", True)):
            stage1 = _variant(template, t2v)
            _stamp_placeholders(stage1)
            _stamp_transformer(stage1, unet_name, weight_dtype)
            s1_out = out_dir / f"{name}{vsuffix}.json"
            s1_out.write_text(json.dumps(stage1, indent=2), encoding="utf-8")
            print(f"  [OK]   {s1_out.name} (stage-1, {T2V_GATE_TITLE}={t2v}, unet={unet_name})")
            written.append(s1_out)

            stage2 = _derive_stage2(stage1)
            _check_required(stage2, f"{name}{vsuffix}_stage2")
            s2_out = out_dir / f"{name}{vsuffix}_stage2.json"
            s2_out.write_text(json.dumps(stage2, indent=2), encoding="utf-8")
            print(f"  [OK]   {s2_out.name} (derived, {IS_CONTINUE_TITLE}=true)")
            written.append(s2_out)

    return written
