# HANDOFF — MPI-354 Klein 4B model wiring (2026-07-26)

Session end. Klein's operations are all proven and three workflows are built and
**run-verified on the bench**. Next session: merge them into one graph, then wire.

## State

- **MPI-353 → done.** Eval concluded: Klein wins, Qwen removal path closed (measured).
- **MPI-354 → doing.** This card. Settled research: `docs/models/klein/README.md`.
- **MPI-355 → todo.** Crop-stitch as the standard edit-graph shape (split from MPI-347,
  which owns the 4K/8K *app*).

## What exists on the bench right now

`G:\ComfyUi\ComfyUI\user\default\workflows\`

| file | who made it | verified |
|---|---|---|
| `klein_removal_cropstitch.json` | agent, user re-laid-out the nodes | yes — user's own runs |
| `klein_t2i.json` | this session | **ran, 18s** |
| `klein_edit_2ref.json` | this session | **ran, 36s — fox composited beside woman** |
| `klein_edit_3ref.json` | this session | **ran, 46s** |

The three new ones are LiteGraph (UI-loadable). They were converted with the repo's
`scripts/workflow-to-api.mjs` and each API result was **queued and executed**, so they
are working graphs, not just well-formed JSON.

Builder source: `.agents/mpi-kanban/tasks/MPI-354/research/build_klein_ops.py`
(re-run it to regenerate; it writes straight into the bench workflows folder).

## What the new graphs already carry

Copied from `krea2_t2i_template.json` conventions:

- baked **Klein Outpaint LoRA** (`flux2-klein\flux2-klein-4b-outpaint.safetensors`, 1.1)
- **6 user LoRA slots** — `MpiLoraModel` chain, titled `Input_Lora_1..6`, `lora_name: 'None'`
- `Input_Positive` (MpiText), `Input_Seed`, `Input_Width`, `Input_Height`
- `Input_Image_1..N` as `MpiLoadImageFromPath` (path→string, self-gating — the MPI-272 rule)
- capture titled **`Output_Image`**
- `ConditioningZeroOut` for the negative (negative is dead at cfg 1.0 — proven)

**NOT yet added: the style rack.** Krea2's pattern is 9 × `MpiLoraModel`
(`Input_style_lora_1..9`) + `MpiPromptList` (title `styles`) + `Input_Style` (MpiInt) +
9 × `MpiMath` (`b if a == N else 0.0`) gating each strength, concatenated into the prompt
via `MpiPromptProcessor` → `StringConcatenate`. Deliberately left out — **there are no
Klein style LoRAs identified yet** (see next session, below). Wiring an empty rack would
be speculative.

## Klein's proven settings — do not re-derive

cfg **1.0**, sampler **euler**, **8 steps**, `Flux2Scheduler` + `SamplerCustomAdvanced`,
distilled checkpoint. Full numbers and the rejected alternatives are in
`docs/models/klein/README.md`. Highlights:

- 8 steps is the knee. 20 steps adds film grain, not structure.
- Base checkpoint is **closed** (slower + less detail + more drift at cfg 4.0).
- Negative prompt is **bit-identical** at cfg 1.0 — zero it out, don't expose it.
- Multi-ref works by **chaining `ReferenceLatent`** (`append=True` in
  `comfy_extras/nodes_edit_model.py`). ~+14s per extra ref, so cap the slots deliberately.
- Denoise < 1.0 is **wrong for removal** (preserves the thing being removed) and
  `SplitSigmasDenoise` quantises as `round(steps × denoise)` — useless below ~20 steps.

## Next session — in order

1. **User merges the four graphs into one** with MpiNodes gating the operation
   (`MpiAnySwitch` / `MpiIfElse` on an `Input_Operation` int), OR decides on separate
   runtime files per op. Either is playbook-legal; one graph is the Krea2 pattern and is
   the recommendation. **Never hand-edit workflow JSON — the user authors, then saves to
   `comfy_workflows/raw/` with an all-lowercase name.**
2. **Research style LoRAs for Klein** (user's plan). Also **abliterated text encoders**
   and **NSFW finetunes** — user will check CivitAI Red first to see whether the community
   is actually building on FLUX.2 Klein at all. If nothing exists, the style rack stays out
   and that is a finding, not a gap.
3. **Then the playbook checklist** — `docs/playbooks/add-model/README.md`, in order:
   dep entries → hashes (`/mpic-compute-dep-hashes`, runs off the LOCAL `G:\CubricModels`
   copies, no upload wait) → `progressStages` (**count the bars live**, never guess) →
   ModelDef → R2 upload (**needs explicit user approval**) → verify per `06-verify.md`.

## Open questions for the user

- **VRAM: ~13 GB measured** on a 4B model. The playbook *computes* the VRAM table from dep
  sizes, so the badge may claim it fits an 8 GB card when it does not. Worth measuring
  before the tier badge is set.
- **Dep reuse:** `qwen_3_4b.safetensors` (8.04 GB) is Klein's text encoder — check
  `dependencies.js` / `assetDeps.js` before uploading, it may already be hosted for
  Qwen-Edit. That would cut the download from 16.2 GB to ~8.2 GB.
- **How many reference slots** should the edit op expose? 2 and 3 both work; each costs
  ~14s. 2 is the safe default.

## Explicitly out of scope (decided with the user)

- **Outpainting** ships as an **App**, not a model op — users already do it with the resize
  tool + "fill the black bars with …" prompting (proven on Boogu and Krea2).
- **`MpiInpaintHeal`** — built this session, live in the bench via symlink, **not released**.
  It helps on small evenly-lit patches and *hurts* on regions spanning a lighting gradient.
  Do not wire it into Klein. It stays a bench tool until something justifies it.
- Chasing removal artifacts (invented moles, ~50-80% grain). App-level second pass, not a
  model setting. Prompting is the best lever found: "no moles, no freckles, no blemishes"
  in the **positive** prompt cut invented spots 21% at zero cost.
