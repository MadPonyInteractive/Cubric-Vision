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
| `MpiIfElse` | Boolean gate — the app bakes/injects the boolean to pick a branch (t2v/i2v, i2i on/off, enhance on/off). |
| `MpiMath` | Evaluates `b if a == N else 0.0` etc. — drives the style-LoRA rack from one injected int. |
| `MpiAnySwitch` | N-to-1 any-type router; the app injects `select` (1-indexed). Runtime in-workflow selectors (PiD VAE/size) use it. Subclass it for new any-type switches. |
| `MpiLoraModel` / `MpiLoraModelClip` | LoRA apply with strength; the app injects the `{lora_name, strength_model, strength_clip}` object into the user LoRA slots. |
| `MpiPromptList` / `MpiPromptProcessor` | Trigger-phrase list driven by the same int that picks the LoRA — keeps LoRA choice and trigger text from drifting. |
| `MpiSaveVideo` | Fast single-pass mp4 encode on the engine; remote gens transfer only the final mp4. |

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
| `MpiIfElseInverted` | **no** | one input, always routed somewhere, so always needed |
| `MpiAnyBlocker`, `MpiBlockIfEmptyList` | **no** | decide *from* the value |

So on a preview tap, use `MpiBlocker` — **not** `MpiIfElseInverted`, which is what
WAN/LTX use today and is the forcing edge in both.

Verified live on the bench, not reasoned: run the same graph twice with an input
that has never run (so nothing starts cached), then read run 2's
`execution_cached` — a node listed there executed on run 1.
