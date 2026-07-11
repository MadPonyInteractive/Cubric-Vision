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

**In the workflow:**
- N `MpiLoraModel` nodes titled `Input_style_lora_1..N`, each with its **`lora_name` hardcoded**
  and its `strength_model` **linked** (not a widget).
- Each strength comes from an `MpiMath` evaluating `b if a == N else 0.0`, where
  `a ← Input_Style` (`MpiInt`) and `b ← Input_Stylization` (`MpiFloat`).
  ⇒ Selecting style N sets slot N to the slider value and **zeroes the other N-1**.
  `Input_Style = 0` zeroes all of them.
- The **same int** feeds `MpiPromptList.specific_item` (1-indexed; `options` holds the trigger
  phrases newline-joined, `prefix: ", "`, `suffix: "."`), whose output flows through
  `MpiPromptProcessor` → `StringConcatenate.string_b`, with `Input_Positive` as `string_a`.

**Why this shape:** one integer drives BOTH the LoRA choice and the trigger phrase, so the two
lists cannot drift. Do not port the upstream `CustomCombo` + `RegexExtract` two-list design —
it ships already drifted.

**Traps:**
- **`options` line count MUST equal the LoRA count.** A missing line means that style loads its
  LoRA but appends no trigger — a *silent half-application* that reads as "the LoRA is weak."
  (Krea2 shipped 8 lines for 9 LoRAs; caught by diffing the two.) **Assert `len(options) == N`.**
  Krea2 now asserts this **at build time** in `generate_krea2.py::_assert_style_rack`, which also
  checks that slot `N`'s `strength_model` is gated by the `MpiMath` reading `b if a == N` — a
  swapped gate silently loads the wrong LoRA. Copy that function for the next style rack.
- **`MpiLoraModel.apply_lora` short-circuits at `strength_model == 0`** (`loras.py:100` — returns
  before `load_lora_cached`). So only ONE style LoRA is ever resident. See the `isWeightDep()`
  over-count note in [02-dependencies-r2.md](02-dependencies-r2.md).
- The style LoRAs are **deps** (they travel with the model), not user slots. The user rack stays
  `Input_Lora_1..6`.

**In the app:**
- Two `PROMPT_BOX_CONTROLS` entries: a style dropdown (`nodeTitle: 'Input_Style'`, injects the
  **index**) and a Stylization slider (`nodeTitle: 'Input_Stylization'`, float). Disable the
  slider at index `0`.
- **Labels** = the filename stem after the model prefix, title-cased
  (`krea2_softwatercolor` → `Soft Water Color`). Index `0` = `No Style`.
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

Guard: `tests/output-prompt-capture.test.cjs`.
