"""
generate_ltx.py
LTX-2.3 handler: from ONE i2v+t2v API export, produce EIGHT app workflow files —
the FOUR mode/stage variants, each in a bf16 (local) and a GGUF (Pod) flavour:
  LTX_i2v.json              — bf16, Input_Text_to_video=false, Input_Is_Continue=false
  LTX_i2v_stage2.json       — bf16, derived: Input_Is_Continue flipped true
  LTX_t2v.json              — bf16, Input_Text_to_video=true,  Input_Is_Continue=false
  LTX_t2v_stage2.json       — bf16, derived: Input_Is_Continue flipped true
  LTX_i2v_gguf.json         — GGUF (Input_Use_GGUF=true) sibling of LTX_i2v.json
  LTX_i2v_stage2_gguf.json  — GGUF sibling of LTX_i2v_stage2.json
  LTX_t2v_gguf.json         — GGUF sibling of LTX_t2v.json
  LTX_t2v_stage2_gguf.json  — GGUF sibling of LTX_t2v_stage2.json

The bf16/GGUF split exists because GGUF wins ONLY on a Pod (it sidesteps the
~5-min aimdo cold tax), but is slower per-step at high res locally (per-layer
dequant). So local = bf16, Pod = GGUF. Only the UNET is split; the CLIP is a
single shared Gemma fp4_mixed loader (see LOADER_PAIRS note). The template carries
BOTH unet loaders, but only the bf16 `UNETLoader` is WIRED into the graph (via the
`Model_Connect` MpiReroute); the GGUF `UnetLoaderGGUF` sits parked (no consumers).
We can't keep both wired and pick at runtime: a MpiIfElse selects lazily at
EXECUTION, but ComfyUI VALIDATES every node's file inputs at PROMPT time regardless
of wiring — so the unselected loader's absent weight rejects (`unet_name ...not in
[]`). The fix: per flavour, KEEP exactly one unet loader and DELETE the other,
repointing the kept loader's MODEL output (slot 0) to the local loader's single
`Model_Connect` consumer. Each output file then carries ONE unet loader → ComfyUI
validates only the weight actually present. The app picks the file by isRemote()
(commandExecutor `_toGgufFilename`); we append `_gguf` to the GGUF-flavour
filenames so the two stay in lockstep.

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

# Loader-swap titles (MPI-165). The template wires the bf16 loader and parks the
# GGUF one; per flavour we keep one, delete the other, and repoint the kept
# loader's slot-0 output to whatever the local loader fed (via its single
# MpiReroute "Connect" consumer). ONLY the UNET is split — the CLIP is a single
# shared Gemma fp4_mixed loader across every engine/tier (the Q4 GGUF clip was
# dropped: it OOM'd a 32GB/90GB Pod and threw key errors — the GGUF Gemma isn't
# ComfyUI-compatible; fp4_mixed is the recommended path). MPI-168.
#
# Each entry: (local_title, gguf_title, label). local kept for the bf16 flavour,
# gguf kept for the Pod flavour. Both members output on slot 0 (MODEL).
LOADER_PAIRS = [
    ("Load Diffusion Model", "Unet Loader (GGUF)", "unet"),   # UNETLoader / UnetLoaderGGUF
]

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


def _iter_input_refs(node: dict):
    """Yield (input_name, [src_id, slot]) for every link-style input on a node."""
    for name, val in node.get("inputs", {}).items():
        if isinstance(val, list) and len(val) == 2 and isinstance(val[1], int):
            yield name, val


def _select_loader(wf: dict, local_title: str, gguf_title: str, label: str, *, use_gguf: bool) -> None:
    """Keep one loader of a pair, delete the other, repoint the dropped loader's
    consumers to the kept loader's slot-0 output. Mutates `wf` in place.

    ComfyUI validates EVERY node's file inputs at prompt time, so a parked loader
    whose weight is absent on the engine rejects the whole prompt even if nothing
    consumes it. Carrying exactly one loader per file is the only thing that
    sidesteps that. Both members of a pair emit their type (MODEL / CLIP) on slot 0.
    """
    keep_title = gguf_title if use_gguf else local_title
    drop_title = local_title if use_gguf else gguf_title
    keep_id = _find_node_id_by_title(wf, keep_title)
    drop_id = _find_node_id_by_title(wf, drop_title)
    if keep_id is None:
        raise SystemExit(f"[FAIL] No {label} loader titled {keep_title!r}; cannot build the "
                         f"{'GGUF' if use_gguf else 'bf16'} flavour.")
    if drop_id is None:
        raise SystemExit(f"[FAIL] No {label} loader titled {drop_title!r} to remove.")

    # Repoint every consumer of the dropped loader (slot 0) to the kept one.
    rewired = 0
    for node in wf.values():
        if not isinstance(node, dict):
            continue
        for name, ref in _iter_input_refs(node):
            if str(ref[0]) == drop_id:
                if ref[1] != 0:
                    raise SystemExit(f"[FAIL] {label} loader {drop_title!r} output slot {ref[1]} "
                                     f"consumed — only slot 0 is expected.")
                node["inputs"][name] = [keep_id, 0]
                rewired += 1

    del wf[drop_id]

    # Sanity: no dangling ref to the deleted node.
    for nid, node in wf.items():
        if not isinstance(node, dict):
            continue
        for _, ref in _iter_input_refs(node):
            if str(ref[0]) == drop_id:
                raise SystemExit(f"[FAIL] Dangling ref to deleted {label} loader {drop_id} in {nid}.")
    print(f"  [{label}] kept {keep_title!r}, deleted {drop_title!r}, repointed {rewired} consumer(s)")


def _select_loaders(wf: dict, *, use_gguf: bool) -> None:
    """Run the keep-one/delete-other swap for every loader pair (unet + clip)."""
    for local_title, gguf_title, label in LOADER_PAIRS:
        _select_loader(wf, local_title, gguf_title, label, use_gguf=use_gguf)


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
    """Orchestrator entry. source = i2v+t2v API export. Writes 8 files:
    the 4 mode/stage variants × {bf16 (unsuffixed), GGUF (`_gguf` suffix)}."""
    template = json.loads(source_path.read_text(encoding="utf-8"))
    _check_required(template, "Source template")

    written: list[Path] = []
    # bf16 = local (suffix ''), GGUF = Pod (suffix '_gguf'). The app appends the
    # same '_gguf' before '.json' when isRemote(), so names MUST stay in lockstep.
    for use_gguf, suffix in ((False, ""), (True, "_gguf")):
        flavour = "GGUF" if use_gguf else "bf16"
        for name, t2v in (("LTX_i2v", False), ("LTX_t2v", True)):
            stage1 = _variant(template, t2v)
            _select_loaders(stage1, use_gguf=use_gguf)
            _stamp_placeholders(stage1)
            s1_out = out_dir / f"{name}{suffix}.json"
            s1_out.write_text(json.dumps(stage1, indent=2), encoding="utf-8")
            print(f"  [OK]   {s1_out.name} (stage-1, {T2V_GATE_TITLE}={t2v}, {flavour})")
            written.append(s1_out)

            stage2 = _derive_stage2(stage1)
            _check_required(stage2, f"{name}_stage2{suffix}")
            s2_out = out_dir / f"{name}_stage2{suffix}.json"
            s2_out.write_text(json.dumps(stage2, indent=2), encoding="utf-8")
            print(f"  [OK]   {s2_out.name} (derived, {IS_CONTINUE_TITLE}=true, {flavour})")
            written.append(s2_out)

    return written
