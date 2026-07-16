# Generator patterns — template → runtime files

> Part of [workflow-authoring](README.md). One authored `*_template.json` becomes the
> per-op / per-tier runtime files the app fetches. Model- and app-agnostic.

## Why generators exist

**The app cannot flip a baked selector at runtime.** A boolean gate (`MpiIfElse`), a
tier int (`MpiInt` → downstream branches), an op switch — these are BAKED into
separate runtime files at build time. You author ONE template with the selector; a
**generator** stamps it into N runtime files, one per selector value. The app then
fetches the already-baked file for the op/tier it wants.

Runtime files live in `comfy_workflows/<Name>_<variant>.json`; templates live in
`comfy_workflows/scripts/workflow_generation/<Name>_template.json`.

## The orchestrated system (do NOT write a standalone script)

Generation runs through `comfy_workflows/scripts/workflow_generation/orchestrate.py`,
which globs every `*_template.json`, hashes it (rebuilds only changed ones), and routes
by **filename prefix** (`registry.py` `HANDLERS`) to a handler module
`generate_<handler>.py` exposing `build(source_path, out_dir) -> list[Path]`.

To add a family:
1. Drop `<Name>_template.json` into `scripts/workflow_generation/`.
2. Add a `HANDLERS` rule in `registry.py` → your handler name. **Specific before
   general** (first match wins): `Wan22_5B_` MUST precede `Wan22_`.
3. Write `generate_<handler>.py` with `build(source_path, out_dir)`. Model it on
   `generate_wan5b.py` (simplest boolean split) or `generate_sdxl.py`. **Look up nodes
   by `_meta.title`, NEVER by node id.**
4. Run `python orchestrate.py --all` (drop `--all` to rebuild only changed).

## Pattern A — boolean split (2 files)

One template, one `MpiSimpleBoolean` gate feeding an `MpiIfElse`. The handler
deep-copies the template per output value, stamps the boolean, writes the file.
Reference: `generate_wan5b.py` (`Input_Text_to_video` → `Wan5B_t2v.json` +
`Wan5B_i2v.json`). Media inputs need no placeholder stamp — path→string loaders
self-gate on empty ([media-inputs.md](media-inputs.md)); only `LoadLatent` nodes
still need a staged default.

## Pattern B — tier selector: `MpiInt` → `MpiAnySwitch` (low / balanced / high)

**This is the Boogu Image Edit pattern, and the general model-tier pattern.** The
quality tiers (low / balanced / high) are selected by an **`MpiInt` → `MpiAnySwitch`**:
the int (1/2/3) drives the switch, and the switch picks which pre-wired branch is live —
e.g. **which sampler config** runs for that tier. Everything downstream of the switch is
already in ONE graph.

This is a **runtime control**, not an N-file bake. Keep ONE runtime file. The tier int
is injected at submit time exactly like any other scalar:

- The selector node is an `MpiInt` (or the `MpiAnySwitch`'s own `select` input) titled
  `Input_Tier` (or similar). The app injects the tier index into it — `MpiAnySwitch` is
  **1-indexed** (`select` starts at 1), so tier 1/2/3 map straight to switch inputs 1/2/3.
- Wire it as a prompt-box control (or derive it from the model's selected quality tier)
  → a `PROMPT_BOX_CONTROLS` entry whose `getInjectionParams()` returns
  `{ Input_Tier: <1|2|3> }`. See
  [../playbooks/add-model/04-ops-and-controls.md](../playbooks/add-model/04-ops-and-controls.md)
  (the PiD `MpiAnySwitch` walkthrough) + [injection.md](injection.md) (`select` is in the
  injector target list; the switch is 1-indexed).
- **No generator split is needed** for the tiers when it's one switch in one graph. The
  generator (if any) only handles op splits / placeholder stamping, not the tier.

> **For the Boogu agent:** your `MpiInt → MpiAnySwitch` sampler selector is a **runtime
> switch**, so it lives in ONE runtime file — you do NOT bake three tier files. Inject the
> tier index (1/2/3) into the switch; confirm `select` reaches the switch and it's
> 1-indexed. Only fall to the baked-N-files variant below if two tiers ever need
> *structurally different graphs* (different node sets, not just a different sampler).

### Variant — baked N files (only if tiers are structurally different graphs)

If two tiers genuinely need different node sets (not just a different sampler branch),
bake one file per tier — Pattern A with an int and N outputs:

```python
# generate_<model>.py  (routed by a "<Model>_" rule in registry.py)
import json, copy
from pathlib import Path

TIER_TITLE = "Input_Tier"            # the MpiInt selector node's _meta.title
OUTPUTS = (                          # (runtime filename, Input_Tier value)
    ("<Model>_edit_low.json",      1),
    ("<Model>_edit_balanced.json", 2),
    ("<Model>_edit_high.json",     3),
)

def _find_by_title(wf, title):
    return next((n for n in wf.values()
                 if isinstance(n, dict) and n.get("_meta", {}).get("title") == title), None)

def build(source_path: Path, out_dir: Path) -> list[Path]:
    template = json.loads(source_path.read_text(encoding="utf-8"))
    if _find_by_title(template, TIER_TITLE) is None:
        print(f"  [WARN] no '{TIER_TITLE}' in {source_path.name}"); return []
    written = []
    for name, tier in OUTPUTS:
        wf = copy.deepcopy(template)
        _find_by_title(wf, TIER_TITLE)["inputs"]["int"] = tier   # MpiInt widget key = 'int'
        out = out_dir / name
        out.write_text(json.dumps(wf, indent=2), encoding="utf-8")
        print(f"  [OK]   {name} ({TIER_TITLE}={tier})"); written.append(out)
    return written
```

Then key the `workflows` map in `models.js` by quality tier. **Prefer the runtime
switch above** — ship N files only when the graphs truly diverge.

## Keep the widget-key right

The value goes into the selector node's **widget input key**, not a made-up name:
`MpiInt` → `int`, `MpiFloat` → `float`, `MpiSimpleBoolean` → `boolean`,
`MpiString`/`MpiText` → `string`/`text`. (Same set the runtime injector targets —
[injection.md](injection.md).) Stamp the wrong key and the value is silently ignored.

## Media inputs — path→string (latents excepted)

Image/mask/video/audio inputs are path-reading loaders (`MpiLoadImageFromPath` /
`MpiLoadAudio` / `MpiLoadVideo`) that self-gate on an empty `string` — no
placeholder to stamp. The one survivor: any `LoadLatent` node still needs its
baked latent staged into the engine `input/`. Full contract: [media-inputs.md](media-inputs.md).

## Scrub runtime-injected inputs to safe defaults (MPI-282)

The raw template the user exports carries **whatever they last tested with** — a baked seed,
a `C:\...\Downloads\...png` image path, `Input_Style: 10`, `Input_Is_Edit: true`. Every input
the app injects at runtime MUST be scrubbed back to its safe default at build, or the leaked
test value ships in the runtime file and corrupts a fresh gen (a baked image path made a plain
t2i take the edit branch; a baked seed defeats the no-seed-UI law).

Pattern: a `_sanitize_injected_inputs(workflow)` helper with a `(title, widget_key, safe)`
list — `Input_Positive`/`Input_Negative` → `string` `''`, `Input_Seed` → `int` `0`,
`Input_Image`/`Input_Mask` → `string` `''` (self-gate), `Input_Style` → `int` `0`, mode flags
(`Input_Is_Edit`/`Input_Is_i2i`/…) → `boolean` `false`. Call it in the per-variant build loop,
alongside the weight/tier/bypass bakes. `_find_by_title` no-ops on absent nodes, so one list
covers every template. (`generate_krea2.py` is the reference.) Injected WEIGHTS
(tier/weight/bypass/LoRAs) are baked by their own forced helpers, not scrubbed here.
