# Workflow generation

Turns **source workflow templates** into the **API JSON files the app loads** from
`comfy_workflows/`. One orchestrator, one handler per model family.

## How it works

1. You author/edit a workflow in ComfyUI, export it as **API format**, and save it
   into THIS folder with a `_template.json` suffix (e.g. `Wan22_i2v_template.json`).
   The `_template` suffix is how you (and the orchestrator) tell sources apart from
   outputs.
2. You run **`generate.bat`** (or `python orchestrate.py`).
3. The orchestrator globs every `*_template.json` here, sha256-hashes each against
   `.state.json`, and **rebuilds only the changed ones**. It routes each source to a
   handler by **filename prefix** (see `registry.py`), and the handler writes the
   final API file(s) into `comfy_workflows/`.

`generate.bat --all` forces a full rebuild (ignores the hash cache).

## Files

| File | Role |
|---|---|
| `generate.bat` | Entry point. Runs the orchestrator. |
| `orchestrate.py` | Globs `*_template.json`, change-detects via `.state.json`, routes by prefix. |
| `registry.py` | `HANDLERS` = list of `(filename_prefix, handler_name)`. First match wins. |
| `generate_sdxl.py` | SDXL handler: one template → N per-model files (swaps the `Checkpoint` node). |
| `generate_wan.py` | WAN handler: one stage-1 API export → `<name>.json` + `<name>_stage2.json` (derives stage-2). |
| `.state.json` | Machine-local sha256 cache (gitignored). |
| `sdxl_*_template.json` | SDXL source templates (committed — the historical exception). |
| `Wan22_*_template.json`, `LTX_*_template.json` | Video-model sources you drag in (gitignored; originals live in your working folder). |

## The two handler shapes

**Fan-out (SDXL).** Source is a template; handler stamps one value (the checkpoint)
across a fixed list of model variants → many output files. See `MODEL_VARIANTS` in
`generate_sdxl.py`.

**Stage derivation (WAN, and LTX next).** Source is the **stage-1 multi-stage video
workflow** exported as API. Handler copies it verbatim as `<name>.json`, then derives
the `<name>_stage2.json` sibling **mechanically** — replicating the ComfyUI graph
edits you would otherwise do by hand (bypass the stage-1 sampler, flip a boolean,
re-export). This exists because those manual steps are easy to forget and produce a
silently-wrong workflow.

### WAN stage-2 derivation contract

The WAN handler is **fully title-keyed — it never reads node IDs** (IDs change on
every re-export; titles are the app's MPI-116 naming law). To use it, the stage-1
API source MUST contain:

- A node titled **`Stage1_Bypass`** — the motion-preview sampler to bypass for
  stage-2. (In WAN this is the `SamplerCustom` with `add_noise=true`.)
- A node titled **`Is_Continue`** — the stage-2 gate `MpiBoolean`, baked `false`.

The handler then: bypass-splices `Stage1_Bypass` (rewires each consumer of an output
slot to the bypassed node's matching-type input feeder, per `SLOT_TO_INPUT`), deletes
it, and flips `Is_Continue` to `true`. It **hard-fails loudly** if a required title is
missing or a consumer reads an output slot the splice map doesn't model — never a
silent miswire. Notes, reroutes, and already-bypassed nodes you delete are irrelevant
to the derive.

## Adding a new model family (e.g. LTX)

This is what MPI-127 needs for LTX. The single tested source is
`LTX_i2v_t2v_template.json` (API export already in this folder). It drives i2v + t2v
via the `Input_Text_to_video` MpiBoolean gate, and FF/LF via the `Input_Use_End_Image`
gate (the two-`LTXVAddGuide` chain — see `MPI-4/research/flf-addguide-splice.md`). The
handler fans this ONE source into **four app files** (i2v + t2v, each × stage-1/stage-2).
**Do NOT rename the source** — the user keeps `LTX_i2v_t2v_template` across G/D/repo;
future LTX siblings are separate files (`LTX_v2v_lipsync`, `LTX_v2v_extend`, …), so the
family prefix is `LTX_`. Steps:

1. **Add a handler module** `generate_ltx.py` exposing
   `build(source_path: Path, out_dir: Path) -> list[Path]`. Model it on
   `generate_wan.py`. LTX must produce `LTX_i2v.json` + `LTX_i2v_stage2.json` and
   `LTX_t2v.json` + `LTX_t2v_stage2.json` (multi-stage `_ms`, Finish-only —
   `allowsBranchingContinue=false`, no per-stage LoRA variance). The i2v/t2v split is a
   fan-out: stamp the `Input_Text_to_video` gate (off → i2v, on → t2v) on the source,
   then run the WAN-style stage-2 derivation on each. FF/LF needs no extra file — it
   rides the i2v file's `Input_Use_End_Image` gate.
2. **Register the prefix** in `registry.py`: add `("LTX_", "ltx")` to `HANDLERS`.
3. **Keep it title-keyed.** Reuse the `Stage1_Bypass` / `Is_Continue` convention if
   LTX's stage-2 is the same bypass-one-sampler shape; if LTX's graph differs, encode
   the new splice in the handler's own `SLOT_TO_INPUT`-style table and assert on
   surprise. NEVER hardcode node IDs.
4. **Verify against ground truth.** Before trusting the handler, hand-author one
   stage-2 in ComfyUI, then assert the handler's output is semantically equal
   (node-set + per-node `inputs`/`_meta`). That byte-equivalence check is how the WAN
   handler was proven; do the same for LTX.
5. Drag the LTX `*_template.json` source(s) into this folder, run `generate.bat`.

## Rules that still apply

- New app-read/write nodes obey the two-tier naming law (`Input_*` / `Output_*` for
  anything not in the Tier-1 reserved vocabulary) — see `.claude/rules/comfy_injection.md`.
- The app loads the files in `comfy_workflows/` (NOT the `_template` sources). Those
  are owned by the user per the injection rules; the generator is the only sanctioned
  writer of the derived siblings.
