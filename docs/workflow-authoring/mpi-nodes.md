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

**This is why `wan22_*_stage2.json` exists**: with no lazy gate available, the only
way to stop the stage-1 sampler was to delete the node and export a second
workflow (`wan22_t2v.json` 55 nodes → `wan22_t2v_stage2.json` 54, `Stage1_Bypass`
gone). LTX copied the pattern, though its twin differs only by a baked
`Input_Is_Continue` boolean, so LTX's six `_stage2` files are already redundant —
the app could inject the flag instead of swapping the file
(`commandExecutor.js` resolves the twin by filename via `payload.isStage2`).

Which nodes can skip their upstream, and which cannot:

| node | lazy? | why |
|---|---|---|
| `MpiBlocker` | **yes** (since 2026-08-06) | decides from `boolean` alone |
| `MpiSaveLatent` | **yes**, via `enabled` | output node; `enabled` off requests no `samples` |
| `MpiIfElse` | yes (always was) | picks between two upstreams |
| `MpiIfElseInverted` | **no** | one input, always routed somewhere, so always needed |
| `MpiAnyBlocker`, `MpiBlockIfEmptyList` | **no** | decide *from* the value |

So on a preview tap, use `MpiBlocker` — **not** `MpiIfElseInverted`, which is what
WAN/LTX use today and is the forcing edge in both.

Verified live on the bench, not reasoned: run the same graph twice with an input
that has never run (so nothing starts cached), then read run 2's
`execution_cached` — a node listed there executed on run 1.
