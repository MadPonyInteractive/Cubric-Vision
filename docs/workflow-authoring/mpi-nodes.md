# MpiNodes — our own ComfyUI node pack

> Part of [workflow-authoring](README.md). The pack you build Cubric workflows from.

## It's OURS — and we can add a node any time

**`ComfyUi-MpiNodes` is a Mad Pony node pack we author and control.** ~60 utility
nodes for logic, math, prompt generation, image ops, model management, switches,
and workflow automation. Published to the Comfy Registry as
`mad-pony-interactive/ComfyUi-MpiNodes`.

The important consequence: **if a workflow needs a control the app can inject and no
existing node fits, we add a new MpiNode.** We are not stuck with upstream nodes. A
lot of the logic that makes Cubric workflows injectable (the `Mpi*` pass-throughs,
`MpiIfElse`, `MpiMath`, `MpiAnySwitch`, `MpiLoraModel`, `MpiPromptList`) lives here
precisely so the app has a clean, titled seam to write into.

## Where it lives

- **Repo (separate git):** `C:\AI\Mpi\ComfyUi-MpiNodes` — its own `.git`, its own
  `CLAUDE.md`, its own `/new-node` and `/release` skills. **Edit/commit it with
  `git -C C:/AI/Mpi/ComfyUi-MpiNodes …`** — never from Cubric-Vision.
- **Installed at:** `<ComfyUI>/custom_nodes/ComfyUi-MpiNodes/`, loaded at startup via
  `__init__.py`.
- **Node catalog:** the pack's own [`README.md`](file:///C:/AI/Mpi/ComfyUi-MpiNodes/README.md)
  is the full table (grouped: Prompt Gen · Logic · If/Else · Switches · Combos · Image ·
  Math · LoRA/Checkpoint · Conditioning · Text · Wan timing · JSON · Utilities · Video).
  **Read that table before inventing a node — the utility you want probably exists.**

## The nodes the injection seam leans on most

(Full descriptions in the pack README — this is just the "why the app cares" subset.)

| Node | Why the app cares |
|---|---|
| `MpiFloat` / `MpiInt` / `MpiString` / `MpiText` / `MpiSimpleBoolean` | Titled pass-throughs. The app injects a scalar by titling one of these `Input_<Name>`. This is the primary injection target. |
| `MpiIfElse` | Boolean gate — the app bakes/injects the boolean to pick a branch (t2v/i2v, i2i on/off, enhance on/off). Lazy, but see § A preview node defeats a lazy gate. |
| `MpiBlocker` | Hard stop at the SOURCE of a branch. Use when laziness is not enough — it blocks the value itself, so nothing downstream can be pulled by anything. |
| `MpiMath` | Evaluates `b if a == N else 0.0` etc. — drives the style-LoRA rack from one injected int. |
| `MpiAnySwitch` | N-to-1 any-type router; the app injects `select` (1-indexed). Runtime in-workflow selectors (PiD VAE/size) use it. Subclass it for new any-type switches. |
| `MpiLoraModel` / `MpiLoraModelClip` | LoRA apply with strength; the app injects the `{lora_name, strength_model, strength_clip}` object into the user LoRA slots. |
| `MpiPromptList` / `MpiPromptProcessor` | Trigger-phrase list driven by the same int that picks the LoRA — keeps LoRA choice and trigger text from drifting. |
| `MpiSaveVideo` | Fast single-pass mp4 encode on the engine; remote gens transfer only the final mp4. |
| `MpiBox` + `MpiBoxCrop` | **The only socket-driven image crop left.** Core `ImageCrop` is deprecated (`/object_info` `deprecated: true`, `[DEPR]` in the editor) and its successor `ImageCropV2` takes `crop_region` as a *socketless UI bounding-box widget* — so nothing upstream can drive it. Feed `MpiBox` four INTs, hand the `MPI_BOX` to `MpiBoxCrop`. `pad` off = the crop is the intersection with the image; on = edge pixels replicate out to the requested size. |

## A preview node defeats a lazy gate (2026-08-20)

`MpiIfElse` inputs are lazy, so the unselected branch is not pulled — that is true, and it is
why the points/text mask branches never run each other's models. **It is not enough on its
own.** An output node — `PreviewImage`, `MaskPreview`, `PreviewAny`, `SaveImage` — is an
**execution ROOT**, not a leaf. ComfyUI walks back from every unmuted output and executes
everything it finds. So one debug preview left unmuted anywhere downstream of a gated branch
drags that whole branch into every run, gate or no gate.

Measured on `flow_character_sheet.json` (MPI-504): with `Input_Remove_Head` off, the head
branch ran anyway — YOLO, the SAM3 checkpoint, the Klein inpaint. Cause: one unmuted
`PreviewImage` (`688`) whose upstream closure was **84 nodes**, including all 14 of the
`Masking` group and the whole inpaint chain. The `MpiIfElse` was never wrong; it was simply not
the only root.

Two fixes, and the branch wants both:

- **Mute the debug previews** (mode 2). A muted output is not a root. Keep them in the graph —
  they are how the branch gets inspected — just never shipped unmuted.
- **`MpiBlocker` at the SOURCE of the branch**, driven by the same boolean as the gate. It
  blocks the value the branch starts from, so no root anywhere can pull it. This is the durable
  half: it survives someone adding a preview later.

Symptom to recognise: a gated branch's models load on every run and the gate looks correctly
wired. Do not re-check the gate — grep the graph for unmuted output nodes and walk their
upstream.

## `MpiMath` — what the expression may contain (2026-08-10)

`MpiMath` runs its string through `safe_math` (`help_funcs.py`), an AST walker, not
`eval`. Three inputs `a` / `b` / `c`, one `result` typed `*`, so it feeds an `INT` or
`FLOAT` socket without friction.

**Allowed:** arithmetic (`+ - * / // % **`), comparisons (`> >= < <= == !=`, which
return a bool usable as 0/1), ternaries (`x if cond else y`), and **`math.*`
functions called bare** — `floor(...)`, `ceil(...)`, `sqrt(...)`.

**Not allowed — and this is the one that bites:** `min()`, `max()` and **`int()`** are
*builtins*, not `math.*`, so they raise `disallowed call`. For clamping use a ternary
(`a if a>b else b`) or **`MpiClamp`**, which takes `value` / `min_value` / `max_value`
and mirrors `INT in → INT out`.

**`*` out is not a cast.** Nothing coerces the result, so `a * 0.8` into an `INT`
widget socket delivers a **float** and fails inside the consuming node, not at
validation. Keep it integral at the source: floordiv (`a * 4 // 5`) or `floor(...)` /
`ceil(...)`. (`flow_character_sheet.json` node `750` sizes a crop this way.)

Worked examples from `ltx_v2v_template.json`, all snapping a frame count onto LTX's
8n+1 latent lattice:

| expression | does |
|---|---|
| `floor((a-1)/8)*8+1` | snap a frame count DOWN to the lattice |
| `floor((a*b+0.5)/8)*8/b` | seconds → the largest whole-8 frame run that fits, `+0.5` so an NTSC rate (23.976) rounds to 72 frames instead of 64 |
| `a if a>0.001 else 0.001` | floor a duration, since a 0-length `EmptyAudio` cannot be resampled |

A failed expression is **not loud**: `doit` catches, prints `[MpiMath] Error
evaluating expression '<expr>': <e>` to the console, and **returns `0.0`**. The graph
runs on. So a typo — or reaching for `min()` — reads as a silent 0 downstream, never
an error: a derived frame count becomes 0, a duration becomes 0, and the failure
surfaces as something further along refusing a zero-length input. When a derived
value looks wrong, read the ComfyUI console before re-checking the wiring.

## Adding a new node (when you need one)

The pack's `CLAUDE.md` § "Adding a new node — checklist" is the procedure; the
`/new-node` skill walks it. In short: put the class in the matching **domain file**
(`logic.py`, `math.py`, `switches.py`, …), reuse `help_funcs.py`, register it in
`__init__.py` (3 places), add a README row + a changelog line. `/release` bumps the
version + publishes.

**When a new node is app-injectable**, come back and record its title/target in
[injection.md](injection.md) — a node the app writes to is only useful once the
injector knows how to reach it.

## Custom node → dep (shipping it to users)

A workflow that uses MpiNodes needs the pack installed on the engine. That's the
`type: 'custom_nodes'` dep + `node_lock.json` pin flow — documented in
[../playbooks/add-model/02-dependencies-r2.md](../playbooks/add-model/02-dependencies-r2.md)
§ custom-node dep. (MpiNodes itself is already a pinned dep; a *new* third-party node
your graph needs follows that flow.)

## Blocking a branch does NOT stop the work feeding it (MPI-449, 2026-08-06)

`ExecutionBlocker` only travels **downstream**. ComfyUI resolves a node's inputs
before calling its function, so a gate placed *after* a sampler has already paid
for that sampler. The only mechanism that prevents upstream execution is a **lazy
input** (`{"lazy": True}` + `check_lazy_status`).

Worse, an **`OUTPUT_NODE` is always executed** — ComfyUI seeds the run from every
output node and walks backwards. So a `SaveLatent` / `MpiSaveVideo` hanging off
stage 1 forces stage 1 on every submit no matter what gates exist anywhere.

**That is why the `_stage2` twins existed**: with no lazy gate available, the only way
to stop the stage-1 sampler was to delete the node and export a second workflow with
`Stage1_Bypass` gone. LTX copied the pattern.

**Superseded 2026-08-06 (MPI-452) — use `MpiStageLatents`.** One node now owns the whole
two-stage handshake: it saves stage 1, gates the preview, and loads the latent back on a
continue, with `is_continue` / `is_preview` / `save_path` / `load_path` as **widgets**
rather than wired boolean nodes. Its latent inputs are lazy, so a continue requests
neither and the stage-1 sampler is genuinely skipped — which removes the only reason a
twin ever existed. It replaces the eight-node cluster (`MpiSaveLatent` + `MpiLoadLatent` +
two `MpiBooleanInvert` + `MpiIfElse` + `MpiBlocker` + `MpiBooleanCompare` + both
`MpiSimpleBoolean` gates).

- **H3 and both WAN graphs are migrated**; `wan22_t2v_stage2.json` and
  `wan22_i2v_stage2.json` are **deleted**. (`wan22_t2v.json` itself is gone too — MPI-470
  deprecated Wan text-to-video; `wan22_i2v.json` is the surviving WAN graph.)
  **LTX's six twins are still live** until its
  re-author lands (MPI-456), and LTX is dual-latent, which the single node does not yet
  model — that decision is open.
- The app stops appending `_stage2` only when the ModelDef declares
  `capabilities.singleFileStages` (`resolveWorkflowFile`, `resolveModelDeps.js`). **Set
  the flag and delete the twin in the same change**: a stale twin left on disk is found
  and RUN, silently producing the old graph's output, which is worse than a missing file
  because nothing errors. `tests/resolve-model-deps.test.cjs::testSingleFileStages`
  fails both ways.
- Title the node **`Input_Video_Latent`** — `commandExecutor.js` injects
  `Input_Video_Latent.is_continue` / `.is_preview` / `.load_path` (the MPI-359 dotted
  form), and injection silently skips a title matching no node, so a rename does not
  error: every continue just re-runs stage 1 and returns a different sample.

Which nodes can skip their upstream, and which cannot:

| node | lazy? | why |
|---|---|---|
| `MpiBlocker` | **yes** (since 2026-08-06) | decides from `boolean` alone |
| `MpiStageLatents` | **yes**, via `is_continue` | output node; a continue requests neither `latent` nor `denoised` |
| `MpiSaveLatent` | **yes**, via `enabled` | output node; `enabled` off requests no `samples` |
| `MpiIfElse` | yes (always was) | picks between two upstreams |
| `MpiSwitch` family — `MpiAnySwitch`, `MpiAnySwitch10`, `MpiLoraSwitch` | **yes** | every one of the N inputs is lazy; `check_lazy_status` requests only `select`'s |
| `MpiIfElseInverted` | **no** | one input, always routed somewhere, so always needed |
| `MpiAnyInvSwitch`, `MpiStringInvSwitch` | **no** | same shape as `MpiIfElseInverted` — one input fanned to N outputs, unselected ones returning `ExecutionBlocker` |
| `MpiAnyBlocker`, `MpiBlockIfEmptyList` | **no** | decide *from* the value |

**The switches split the same way the if/elses do**, and for the same reason: a node
that picks among N *upstreams* can skip the ones it does not want, while a node that
routes one *input* to N *outputs* has already been handed its input. Reach for a
`MpiSwitch` when the branches are expensive; an inverted switch buys nothing upstream.

So on a preview tap, use `MpiBlocker` — **not** `MpiIfElseInverted`, which is what
WAN/LTX use today and is the forcing edge in both.

Verified live on the bench, not reasoned: run the same graph twice with an input
that has never run (so nothing starts cached), then read run 2's
`execution_cached` — a node listed there executed on run 1.
