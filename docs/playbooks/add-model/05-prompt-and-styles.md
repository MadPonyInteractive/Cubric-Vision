# 05 — Style LoRAs + `Output_prompt` (workflow owns the saved prompt)

> Part of the [add-model playbook](README.md). Two Krea2-first systems that scale to
> any model: a set of mutually-exclusive style LoRAs, and a workflow that owns the
> prompt of record (`Output_prompt`).
>
> **Code comments cite these as "§9" and "§10"** (`generationService.js`,
> `commandExecutor.js`, `PromptBoxControls.js`) — that's this file. Style LoRAs = §9,
> `Output_prompt` = §10.

## §9 — Style-LoRA system (Krea2 pattern, MPI-242) — scalable to any model

A model that ships a **set of mutually-exclusive style LoRAs** with trigger phrases. Krea2 is
the first; LTX is next. The whole system is driven by **two injected scalars** — never a
filename, never a trigger string.

**In the workflow** (the rack is ONE node pair — see
[../../workflow-authoring/style-rack.md](../../workflow-authoring/style-rack.md)):
- ONE `MpiStyleSelector` **titled `Input_Style_Selector`**: `selector` (the index),
  `triggers` (one trigger phrase per line, style N = line N), `strength_model`,
  `strength_clip`, `model` in, optional `clip`.
- `ceil(N/5)` `MpiStyleLoras` banks **chained** off it (`style` → `style`), each holding
  `lora_1..lora_5`. Slot order along the chain IS the style order. Untitled — the app never
  addresses them.
- The last bank's `model` / `prompt` outputs carry the patched model and the trigger phrase;
  wire `prompt` into the same concat the prompt takes.
  ⇒ `selector = 0` = no style: model and clip pass through, prompt empty.

**Why this shape:** one integer drives BOTH the LoRA choice and the trigger phrase, so the two
lists cannot drift. Do not port the upstream `CustomCombo` + `RegexExtract` two-list design —
it ships already drifted. (Before MPI-359 the same contract was hand-built from
`Input_Style` + N `MpiMath` gates + `Input_style_lora_N` slots + an `MpiPromptList`; the node
pair collapses all of it. No shipped graph carries the gate rack any more.)

**Traps:**
- **Trigger-line count MUST match the populated lora slots.** A missing line means that style
  loads its LoRA but appends no trigger — a *silent half-application* that reads as "the LoRA
  is weak." (Krea2 shipped 8 lines for 9 LoRAs; caught by diffing the two.) Krea2 asserts this
  **at build time** in `generate_krea2.py::_assert_style_rack`, which also pins the selector
  title, the unbroken bank chain, and the unlinked injected widgets. Copy that function for the
  next style rack.
- **A `None` slot INSIDE the line range is legal** — that's a prompt-only style. A LoRA *past*
  the last line is not.
- **`MpiStyleLoras` skips a slot whose strength is 0**, so only ONE style LoRA is ever resident.
  See the `isWeightDep()` over-count note in [02-dependencies-r2.md](02-dependencies-r2.md).
- The style LoRAs are **deps** (they travel with the model), not user slots. The user rack stays
  `Input_Lora_1..6`.

**In the app:**
- Two `PROMPT_BOX_CONTROLS` entries, both addressing the SAME node per-widget:
  `styleSelect` → `Input_Style_Selector.selector` (the **index**) and the Stylization slider
  → `Input_Style_Selector.strength_model` (float). Disable the slider at index `0`.
  The dotted `Title.widget` key is what makes two knobs on one node injectable
  (`comfyController` §3) — a plain title key would spray the index into both strengths.
- **`styleSelect` renders an `MpiStylePicker`** (MPI-301) — a trigger button showing the
  selected style's name, opening a horizontally-scrolling grid of image cards (title on top,
  4:5 image below). It replaced an inline dropdown; the **value contract is unchanged** (it
  emits the selected index, which is injected as `Input_Style_Selector.selector`). You add
  DATA, not code.
- **Labels** = `styleLoraLabels` on the ModelDef: the filename stem after the model prefix,
  title-cased (`krea2_softwatercolor` → `Soft Water Color`). Index `0` = the no-style entry.
- **Card images** = `styleLoraImages` on the ModelDef — an **index-aligned** filename array
  resolved against `comfy_workflows/display/`. Ship one image per style, all from the SAME
  prompt so the grid reads as a comparison. **Index 0 is the no-style baseline** (a gen with
  the style rack off) — it makes "None" show what the model looks like unstyled. The field is
  optional: a missing entry (or the whole array) renders a placeholder card, so a model can
  ship styles before its art exists.
  Convention: name each file after its LoRA dep (`krea2-style-softwatercolor.webp`), WebP,
  cropped 4:5 (512×640 is plenty — the card is ~132px wide).
  ⚠ **Index alignment is the whole contract.** `styleLoraLabels[i]`, `styleLoraImages[i]`, the
  `i`-th lora slot along the bank chain, and the `i`-th `triggers` line all describe style `i`.
  An off-by-one here shows the user the wrong picture for the style they get.
- **Gate the controls on BOTH the op and the model**, exactly like `previewStage`:
  add the control ids to the relevant ops' `components` arrays in `commandRegistry.js`, and
  capability-gate per model inside `MpiPromptBox._refreshOpSlot()` so models without styles
  never mount them. Krea2's detailer/upscaler have no style rack ⇒ styles appear on `t2i`/`i2i`
  only.

## §10 — `Output_prompt`: the workflow owns the saved prompt (MPI-242)

Applies to **any** workflow whose graph rewrites the prompt between the box and the
text encoder. Krea2 is the first; every later model with the same feature follows this
shape, and the app-side plumbing already handles it — you add nodes, not code.

**The contract.** A workflow that carries a `PreviewAny` node titled **`Output_prompt`**
declares: *the string I encoded is the prompt of record.* The app then reads the saved
prompt from that node instead of the prompt box — always, whether or not any toggle is on.

Without it, the app saves whatever text sat in the prompt box, which is wrong the moment
the graph expands, rewrites, or decorates the prompt.

**In the workflow:**
- A `PreviewAny` node (display name *"Preview as Text"*) titled `Output_prompt`.
- **Tap it upstream of the style concat**, at the point where the prompt is final but
  before any style trigger is appended. Krea2 taps the enhancer's `MpiIfElse` output
  (node 241), which is the last node carrying only the prompt.
  ⇒ The saved prompt has **no trigger phrase**, so *Reuse Prompt* restores the text and
  leaves the style free to change. Tapping the `StringConcatenate` instead bakes the
  trigger in and double-appends on the next run.
- `PreviewAny` is `OUTPUT_NODE = True` and returns `{"ui": {"text": (value,)}}`
  (`comfy_extras/nodes_preview_any.py`), so the string arrives on the `executed` message
  as `text: [str]`. It carries **no file dict** — it is not a `/view` URL.

**The prompt enhancer (the reason the node exists).**
- `Input_Enhance_Prompt` (`MpiIfElse`, `inputs.boolean`) switches between the raw prompt
  and a `TextGenerate` expansion. Bake it `false`.
- `TextGenerate` runs the **LM head of the text encoder the workflow already loaded** —
  no second model, no extra VRAM, no new dep, no image rebuild.
- ⚠ **Eligibility is a hard capability limit, not a policy choice.** It works iff the
  loaded CLIP implements `.generate()`. Qwen3-VL (Krea2) ✅, Gemma3/Gemma-4 (LTX-2) ✅,
  **T5 / umT5 (Chroma, Wan) ✗ — the node raises `AttributeError`, it does not degrade.**
  Never wire it on a T5 model.
- ⚠ **The system prompt IS the feature.** Qwen3-VL's default chat template has no system
  role, so a naked `use_default_template` expansion free-associates and drifts from intent
  (this is why enhancement was cut once). Escape hatch: a prompt string starting with
  `<|im_start|>` sets `skip_template=True` and passes through raw, so a real system turn
  can be built — feed it in via a `Text String` → `StringConcatenate` ahead of
  `TextGenerate`. Put the faithfulness rules there. Expect to tune the wording.
- The `image` socket is honoured by Qwen3-VL; `video`/`audio` are **silently swallowed**
  (they fall into `**kwargs` and die in `SDTokenizer`). Do not wire them.

**In the app — already implemented, nothing to add per model:**
- `commandExecutor` builds an `outputPromptNodeIds` set (title-scoped, case-insensitive),
  reads the string with `readComfyOutputText()`, and rides it out on the existing
  side-outputs bag: `exec.onComplete(urls, { latents, audioUrl, promptText })`.
- `generationService.exec.onComplete` shadows `positive` with
  `outputInfo.promptText || _positiveFromBox` — one read path, no branch. All six
  sidecar/history writes inherit it. A workflow with no such node yields `null` and the
  prompt-box text is used, exactly as before.
- **Progress bars.** The enhancer emits its own tqdm bar, but only when the toggle is on,
  so the static `progressStages` table cannot express it. `stagesFor(file, mode, extraBars)`
  takes a per-run delta; `commandExecutor` passes `1` when `Input_Enhance_Prompt` is true.
  Omit this and an enhanced run shows `3/2` — the counter climbs past its own total, which
  reads as a hang precisely when the run is genuinely slower. An *unrecorded* workflow
  stays `0`; a delta on top of "unknown" is still unknown.
- **Prompt-box controls** (`enhancePrompt` toggle) are gated on the op's `components[]`
  **and** on `capabilities.promptEnhance` (defaults **false** — a model opts in). Add the
  toggle only to ops whose graph actually has the nodes.

**Traps:**
- The saved prompt is now the graph's, even with the enhancer **off** (the `MpiIfElse`
  passes the raw text through). That is intentional — one read path — but it means the node
  must always be reachable, never bypassed (`mode:4`) or muted (`mode:2`).
- `readComfyOutputText` returns `null` (never `''`) for an empty capture, because
  `generationService` falls back on falsy. An empty string would silently blank the prompt.
- The text must never join the image/gif/video `target` array. It has no file dict; every
  downstream media consumer would choke on a bare string.
- Latency is real and user-visible (up to `max_length` autoregressive steps through a 4B
  model). The toggle's `info` string must name the cost; keep it opt-in.

Guard: `tests/output-prompt-capture.test.cjs`. Style rack guards:
`tests/inject-params-titles.test.cjs` (selector title + widget names vs the dotted keys)
and `generate_krea2.py::_assert_style_rack` at build time.
