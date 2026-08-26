# Editing a workflow on the bench without destroying it

> Part of [workflow-authoring](README.md). How to run experiments against, and make
> permanent changes to, a `raw/*.json` template that **the user hand-organises**. Model- and
> Flow-agnostic.

The constraint behind every rule here: **node positions are the user's work.** Regenerating
a workflow file — or exporting it from a re-laid-out graph — destroys a layout that took
real time to build, and it is not recoverable from git if it was never committed.
[README.md § "Changing an EXISTING workflow"](README.md) covers *which* copy to edit; this
covers *how*.

## Experiments never touch the saved file

Convert and dispatch, do not edit:

```bash
node scripts/workflow-to-api.mjs comfy_workflows/raw/<file>.json   # single-file → stdout, writes nothing
# mutate the API JSON in memory, then POST it to /prompt
```

Ten runs of an experiment cost zero writes to `raw/`. Mutate the **converted API graph** —
seeds, prompts, a relinked socket, a swapped loader — and POST that. The saved workflow is
never opened, so there is nothing to restore if the experiment is abandoned.

**A brand-new node is easier in API format than in LiteGraph**: API format needs no link
table and no `pos`/`size`, so porting an upstream reference graph onto our weights is a
pure-JSON job. An 11-link two-stage port was done this way with no LiteGraph surgery at all
(MPI-537).

## Making the change permanent

Only when an experiment is *settled* does it go into the file. In place, never regenerated:

1. **Assert the bench copy and the repo copy still match** (sha256) before writing. The user
   may have saved the tab since you last read it.
2. **Clone donor node objects** out of an existing `raw/*.json` that already uses the node —
   deep-copy, then re-stamp `id` / `title` / `pos` / `size` / `widgets_values` and null the
   links. **Never hand-write a LiteGraph node**: the widget-to-input ordering is implicit and
   a hand-built node shifts widgets silently, producing a file that loads and misbehaves.
3. **Assert `pos` and `size` are byte-identical on every surviving node** after the edit.
   This is the check that catches an accidental re-layout.
4. **Read the file back FROM the bench**, then sync that bytes-for-bytes to `raw/`. Never
   sync what you *think* you wrote.
5. **Re-convert and re-run.** A rename or a rewire that converts clean can still fail to
   queue — see the loader trap below.

### 🔴 The editor QUANTISES float widgets — a programmatic graph loses precision in it

Found 2026-08-22 (MPI-567). A graph built in Python and POSTed to `/prompt` can carry any float;
the ComfyUI **editor** stores what its widget shows, at the widget's declared `step`. Round-trip
such a graph through the frontend and every sub-step value is silently rounded.

Measured: `ThresholdMask` declares `step: 0.01`, so the flow's signed-off region thresholds —
`12/255 = 0.047058…` and `40/255 = 0.156862…` — came back as **`0.05`** and **`0.16`**. Nothing
errored. The graph converts clean, validates clean, and runs; it just runs on a threshold 6% off
the one the measurements were made against.

- **Diff the round trip against the graph that actually RAN**, input by input, before shipping
  it. Class counts and node counts match on a quantised graph, so only a value-level diff finds it.
- **Repair it in the raw file**, one scalar at a time, located by matching `round(target, step)`
  rather than by a hardcoded `widgets_values` index — the index is precisely what a hand-edit gets
  silently wrong.
- **It comes back if the file is reopened and saved in ComfyUI.** Any raw file carrying
  deliberate sub-step precision needs that noted next to the value, or the next Save undoes it.
  `comfy_workflows/raw/flow_draw_it_in.json` is one such file (nodes 150 / 151).

## Prove a graph correct without spending a generation — three checks, in this order

**There is NO validate-only endpoint.** `/prompt` validates and then QUEUES, so it is not a dry
run: a 22B model loads before the graph's own `ExecutionBlocker` stops anything. Never point it at
the user's bench to "check" a graph. Instead:

**Checks 1 and 2 are a script — do not re-implement them by hand.** `node
scripts/verify-workflow.mjs <api.json> …` runs both against `/object_info`, defaulting to
**48188** (not the bench — see the convert trap below). `--self-check` exercises its own logic
with no engine. `--strict` also fails on weights that are merely not installed here; by default
those are notes, because a graph for an uninstalled model is uninstallable, not misauthored —
that distinction was worth 21 false failures on the first sweep. It **pairs with**
`validate-injection-rules.mjs` rather than replacing it: that one owns the `Input_*`/`Output_*`
contract, this one owns what the engine rejects. Both were hand-written twice before being
committed (MPI-603/MPI-610), which is why they are scripts now.

1. **Structural** — the class exists on the engine, every *required* link-typed input is connected,
   every COMBO widget value is in the engine's list (`value_not_in_list` is the most common
   reject), and `widgets_values` covers every widget slot.
2. **Type** — re-implement `validate_node_input` (`comfy_execution/validation.py`): equal passes,
   `*` on either side passes, otherwise the comma-split sets must OVERLAP. **INT → FLOAT is a
   REJECT.** Exception: a node whose `VALIDATE_INPUTS` takes an `input_types` argument (e.g.
   `MpiClamp`) makes ComfyUI skip the check for that node entirely — `execution.py` guards on
   `'input_types' not in validate_function_inputs`.

   **The V3 schema needs three special cases, and a checker without them cries wolf on graphs
   that already ship.** `COMFY_MATCHTYPE_V3` is a templated type — match against its
   `template.allowed_types`, not against the literal string, and treat it as `*` on the OUTPUT
   side. `COMFY_DYNAMICCOMBO_V3` and `COMFY_AUTOGROW_V3` both contribute **dotted** children
   (`sampling_mode.temperature`, `images.image_1`) that are absent from the flat signature;
   resolve them through the parent's options / `template.names`. `klein_t2i` and
   `boogu_edit_*` alone produced 11 false positives before these were modelled.
3. **Live** — playwright-cli against the bench: `app.loadGraphData(json)`, then read back `_nodes`
   length, `LiteGraph.registered_node_types` misses, `has_errors`, and dangling `inputs[].link`.
   Then `app.graphToPrompt()` and diff its output against your own API conversion. **0 diffs proves
   the server would receive exactly the graph you designed** — as close to "it will run" as you get
   without paying for a run. The browser cannot write files, so to get `graphToPrompt` out: POST it
   to `/api/userdata/tmp_*.json`, curl it from the shell, `DELETE` it after.

**The bench is a file store**, which is what makes all of this scriptable:
`GET|POST|DELETE /api/userdata/workflows%2F<name>.json` on 8188, `?overwrite=true` on POST. The
app's `*_template.json` live there in BROWSER format while the repo's copies are the API exports of
the same graphs — so the bench is the donor shelf. `json.load` on a downloaded one dies
`charmap codec can't decode`; open with `encoding='utf-8'`.

**A widget converted to an input keeps its entry in `widgets_values` AND gains an `inputs` entry
carrying `widget: {name}`** — both, not either. Mimic a sibling node in the SAME file that already
has a linked widget rather than guessing the shape. Synthesize from `/object_info` only for a class
no donor graph contains (inputs = required then optional; a widget is any INT/FLOAT/STRING/BOOLEAN/
COMBO without `forceInput`).

Before every POST, validate that each link agrees with its target's back-pointer, that no
`inputs[].link` or `outputs[].links` dangles, and that a node whose branch inputs are `forceInput`
(`MpiIfElse`) has every input fed. Re-fetch immediately before writing and assert the graph is
still the shape you read, so the script ABORTS rather than corrupting a graph that moved under you.

## Match ComfyUI's serialisation, or every line lands in the diff

ComfyUI writes `JSON.stringify(obj, null, 2)`. In Python that is:

```python
json.dump(w, f, indent=2, ensure_ascii=True)   # non-ASCII escaped
# opened with newline="\r\n", and NO trailing newline
```

**That recipe is for a graph the BENCH wrote. The repo's `comfy_workflows/raw/*.json` are
not those files, and measured they want the OPPOSITE of all three** (MPI-620): **LF**,
**WITH** a trailing newline, and `ensure_ascii=False`. Applying the bench recipe to one of
them is exactly the 2400-line diff this section exists to prevent. `ensure_ascii` is the
half that hides: a graph whose strings are pure ASCII round-trips clean under EITHER
setting, so the first file you test can pass while the next one explodes. Measured on
`flow_scribble.json` — 35,491 bytes, zero CRLF, ends `0x0a`, and **six non-ASCII bytes**
(em-dashes in the baked prompt), every one of which `ensure_ascii=True` would rewrite as a six-character
`—` escape.

**Prove it before writing anything, per file**: load the untouched file, re-serialise it, and
assert the bytes are identical. If the round-trip is not exact, fix the serialiser — do not
write. Getting this wrong turns a six-node change into a 2400-line diff that no one can review.

> Line endings are **per file**, not a repo-wide constant, and the same is true of the kanban
> JSON for its own reasons (`.claude/rules/kanban.md`). Measure, do not assume.

## The traps

- **The modified dot is the tell.** If the user has the tab open with unsaved changes, your
  write will be overwritten the moment they save. Re-fetch after they touch it, and ask them
  to save or discard before a permanent edit.
- **Convert against `48188`, not the bench.** `8188` is the authoring bench and has run ahead
  of the shipped engine before, shifting a widget silently. Anything the app will ship gets
  converted against the engine.
- **A PART-DOWNLOADED weight is indistinguishable from a finished one in `/object_info`.** The
  app's downloader writes the partial **in place under the final name** (with a `.cubricdl`
  resume sidecar beside it), so the file appears in the loader's COMBO list the moment the
  download starts. Loading it dies inside `CheckpointLoaderSimple` with
  `RuntimeError: shape '[10240, 1280]' is invalid for input of size 38303` — which reads as a
  corrupt or architecture-mismatched checkpoint, not as an incomplete file. Measured 2026-08-21
  (MPI-567) at 84% of `ILL_Anime.safetensors`. **Never gate a bench run on the name appearing in
  `/object_info`**; gate on the exact byte count from `modelDeps.js` AND the absence of the
  `.cubricdl` sidecar.
- **A template authored elsewhere names weights we do not have.** Community and upstream
  graphs reference the checkpoints *they* ran. Converting succeeds — the converter only reads
  `/object_info` for widget *names* — and then `/api/prompt` returns `400
  prompt_outputs_failed_validation` naming `value_not_in_list`. **Bake our own weight names
  into the template** rather than substituting them on every run; a template that cannot
  queue on our own install is broken, and every downstream card inherits it.
- **Node ids in a ported graph are meaningless to the app.** Injection matches on
  `_meta.title` ([injection.md](injection.md)); apply the `Input_*` / `Output_*` law as part
  of the same pass, because a title that matches no node is skipped in silence.
