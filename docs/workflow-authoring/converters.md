# The conversion scripts — browser (LiteGraph) → API workflow JSON

A graph is authored in the ComfyUI browser and lands in `comfy_workflows/raw/` as LiteGraph;
these scripts convert it. Three of them. Read this before running any — two have a default mode
that writes files you did not ask for.

**Agents may author `raw/` files themselves** (Fabio, 2026-08-22 — the old read-only rule is
lifted). What did NOT change: `raw/` is LiteGraph, never API JSON, and **these scripts still
hard-refuse to write inside it**. That refusal is not the lifted rule; it stops a converter
scattering generated output into the authoring source, which is what cost 17 files on 2026-08-07.
The rule and the authoring loop live in [README.md](README.md); this file is only the tooling
contract.

## `scripts/sync-raw-workflows.mjs` — the one you almost always want

Batch: converts changed `raw/*.json` (by mtime), routes `_template.json` →
`scripts/workflow_generation/` (then runs `orchestrate.py`), plain files → `comfy_workflows/`,
and commits by pathspec. Hard-refuses any write **inside** `raw/`.

```sh
COMFY_URL=http://127.0.0.1:48188 node scripts/sync-raw-workflows.mjs
```

**Convert against 48188 (the app engine), NOT the 8188 default (the bench).** Both scripts read
widget NAMES from a LIVE `/object_info`, and the bench runs ahead of what ships — measured
2026-08-07: bench 0.30.2, engine 0.30.0. The engine's schema is the one the graph must satisfy at
run time. Converting LTX against the bench shipped `LTXVEmptyLatentAudio.batch_size: 24` where 24
was the frame rate, and dropped `LTX2SamplingPreviewOverride.preview_rate` entirely. Authoring
still happens on the bench; only the CONVERSION needs the engine. (Which install is on which port:
[DEVELOPMENT.md](../DEVELOPMENT.md) § the app engine is on 48188.)

**Gate the sync on the SCHEMA, not on "ComfyUI is up".** Convert against a stale node schema and
the new widget values are silently mis-mapped or dropped — the run still reports `OK`. Replacing a
custom node's files does **not** change a RUNNING ComfyUI (Python does not reload a module in
place), so restart the server after touching `custom_nodes/`, then probe:

```bash
curl -s http://127.0.0.1:48188/object_info/<NodeClass> \
  | python -c "import sys,json;print(sorted(json.load(sys.stdin)['<NodeClass>']['input'].get('optional',{})))"
```

That trap cost ~6 turns on 2026-07-25: the bench had started at 07:47:18 and the new
`comfyui-krea2edit` landed at 07:49, so every probe reported the v1.1 schema while the disk was
already v1.2.2. Proof was `Win32_Process.CreationDate` against the file mtime.

## `scripts/workflow-to-api.mjs` — single file, and NEVER run it bare

**With no argument it converts EVERY file in `raw/` against the DEFAULT port 8188 and WRITES.**
It reads like a harmless dry run because every line says `OK`. On 2026-08-07 it clobbered 7 runtime
workflows and dropped 10 stray `*_template.json` into `comfy_workflows/` (templates belong in
`scripts/workflow_generation/`) — a 17-file cleanup. Only DIRECTORY mode writes files; it refuses
to write into `raw/`.

**Single-file mode writes to STDOUT, not to the file.** An instruction that says only "convert with
the explicit path" silently converts nothing. Redirect it, to a temp file first so a failed convert
cannot truncate the shipped twin:

```sh
node scripts/workflow-to-api.mjs comfy_workflows/raw/x.json > tmp && cp tmp comfy_workflows/x.json
```

Recovering from a bare run needs both halves, and `git checkout --` / `git restore` is
classifier-blocked as a compound command: `rm` the untracked strays first, then `git restore <paths>`
on its own, then `git status` to prove the tree is back.

What it handles: combos (inline-array / `"COMBO"` / `COMFY_DYNAMICCOMBO_V3`), SetNode/GetNode/Reroute
virtual teleport, bypass (mode 4) / mute (mode 2) link rewiring, `control_after_generate`,
widget→link conversion, `forceInput` (never a positional value), and OBJECT-form `widgets_values`
(VHS nodes key by name, not array). Verified byte-identical against 4 shipped workflows including
the 168-node LTX template.

### The `control_after_generate` phantom-widget law

The ComfyUI frontend appends a hidden `control_after_generate` combo
(`fixed`/`randomize`/`increment`/`decrement`) to a widget. The authoritative rule, from
`ComfyUI_frontend`'s `useIntWidget.ts` + `docs/WIDGET_SERIALIZATION.md`, is:

```
control = inputSpec.control_after_generate ?? ['seed','noise_seed'].includes(inputSpec.name)
```

i.e. the explicit `/object_info` flag **OR** the widget being an INT literally named `seed` /
`noise_seed`. The phantom sits in `widgets_values` but is ABSENT from `/object_info` for packs that
do not set the flag (RES4LYF `ClownsharKSampler_Beta`, Impact `MaskDetailerPipe`, our
`MpiPromptList`), so the converter must skip it anyway or **every later widget shifts by one** —
`steps:"fixed"`, `sampler_mode:"fixed"`, `batch_size:0.2`, `scheduler` ← `sampler_name`. 158 engine
nodes DO set the flag (KSampler etc.), which is why only the flag-less seed nodes ever bit us.
`emitWidgets` implements flag-OR-seed-name. In the app the symptom is
`Failed to validate prompt … could not convert 'fixed' to int / value not in list`.

**Sweep after ANY converter change:** convert every `raw/*.json` and assert no input value is in
`{fixed, randomize, increment, decrement}` outside a real `control_after_generate` field.
Investigated and CLEARED as non-bugs: dynamic-combo nested inputs (`ResizeImageMaskNode`,
`TextGenerate` — the converter recurses fine) and `serialize:false` / UI-only widgets (none in our
tree).

## `scripts/resolve-comfy-node.mjs` — which pack ships this class?

When the converter throws `Unknown node type "X"` (X absent from `/object_info`):

```sh
node scripts/resolve-comfy-node.mjs X          # → repo(s) + pack name
```

Source is ComfyUI-Manager's `extension-node-map.json` (`repo_url → [[class_types], {title_aux}]`),
cached 24h in tmp. Flags: `--registry` (enrich hits with Comfy Registry `/nodes/{id}/install` pip
deps + downloadUrl), `--refresh` (bypass cache), `--missing <workflow.json>` (sweep every node type
in a raw export). Private `Mpi*` nodes correctly report "not in map / likely private", and the
converter's throw message points here.

**Why the Manager map and not the Registry:** the Comfy Registry `/nodes` API does NOT expose
exported class_types, only pack metadata. Registry is useful only for pip-dep enrichment once you
already know the pack id.

## Verify harness — reusable on any new workflow

Convert → assert **0 missing-required inputs** and **0 dangling links** against `/object_info` →
diff against the shipped API twin. That harness caught every fidelity bug during the build. For
authoring a graph from scratch and proving it correct without spending a generation, see
[bench-editing.md](bench-editing.md).
