# UMBRELLA: consolidate the Cubric family into Cubric Vision

Phases A–D are in `task.json`'s description. This brief is the **product shape
and the decisions behind it**, captured from Fabio's design session on
2026-09-01 (Cubric-Prompt side, handoff `c929ff85`). Read it before planning any
phase — several of the phases change shape once the agent workflow below is the
target.

## The product shape (Fabio, 2026-09-01)

The agent is a **conversational partner**, not an autonomous pipeline. The
canonical flow, from his own description:

1. User: *"I want to make a video, here's my idea — help me make it better."*
   The agent works the script **in dialogue**.
2. Agent offers moodboards or character options. User picks a few.
3. Agent **saves them into the project** as named assets — `hero A`,
   `villain X`, `scenario Y`, `prop Y`.
4. Agent and user agree the first scene. Agent generates images for its beats
   (angles, framing). **The user approves or rejects.**
5. User may hand the agent a reference image from anywhere: *"make this lady
   sitting on that bench."* Agent looks at both, picks the right operation
   (i2i / edit / control) and the right model.
6. User asks for a backing track. Agent generates clips + music in the
   background, comes back, shows the user, user approves.
7. At ~50% context the agent **hands off to a fresh session itself** — either
   announcing it, or doing it in the background so the conversation never
   stalls.

Smaller cases that must work just as well:

- *"Give me this character sitting on that bench"* → two images in, one out.
- *"The best model for this isn't installed. You have these instead — want me
  to try one, or install the right one?"* → user chooses, agent installs.
- *"I don't like it, make the dress red"* → regenerate → *"good, send it to the
  gallery."*
- *"Can my GPU do this video?"* → agent reads the footprint curve against real
  hardware, answers honestly, and if not, walks the user through RunPod.
- Local images and remote video generations running **at the same time**, while
  the agent keeps talking.

## What this shape resolves

Three problems the earlier design was carrying disappear, and it is worth
recording *why* so they are not reintroduced:

- **The LLM-judge blind spot dies.** The earlier design had the agent evaluate
  its own renders, which is the instrument grading itself. Cubric-Prompt
  measured this to destruction: the `pony` recipe read `ALL PASS` at judge 2/2/2
  on **every sweep it ever ran** while carrying bracketed placeholders, a leaked
  quality word, welded count tags, an emoji, and one run that dropped the user's
  own content — with the judge running as a **separate call in a clean context**.
  A fresh session of the same model family is not a second opinion. In this
  design the **user is the gate**, synchronously, at every step, so there is no
  verdict to distrust.
- **The inner retry loop becomes conversation.** Not generate → look → adjust →
  retry, just generate → **show** → *"red dress"* → generate. The agent never
  grades its own output.
- **Enhancement stops being a button-shaped feature.** *"Help me make my idea
  better"* **is** the enhance job, done in dialogue. This confirms the earlier
  decision that the agent **reads** recipes rather than calling an
  `enhance(text, model)` black box.

The agent still needs **visual capability** — but for **input**, not verdict:
"look at this reference and make something like it." Different risk entirely,
because the user is looking at the same image.

## Decisions locked this session

- **DeepInfra is the default for the agent; Ollama stays for the free path.**
  Fabio will use DeepInfra; some users will trade time for cost. The physical
  reason cloud is the *default* rather than merely an option: a **local agent
  LLM does not visit VRAM, it lives there** — it must stay resident while
  ComfyUI generates, so on a constrained card it permanently occupies memory the
  generation needs. Capacity picks the default; the user still picks the path.
- **Project is durable state, not the transcript.** The self-handoff in step 7
  only works if assets, approved beats and decisions live in the project. If
  they live in the conversation, the handoff loses exactly what it exists to
  save.
- **The agent reads corpora; it does not call black boxes.** Two corpora, **one
  retrieval mechanism** — design the format once:
  - *model knowledge* — the 12 recipes (as readable briefs), vendor prompting
    rules, footprint curves;
  - *app knowledge* — how to set up RunPod, what each operation does, where the
    gallery is. Markdown playbooks in-app, with the documentation website as the
    fallback the agent can point at.
- **Any spend-incurring action is confirm-then-VERIFY.** Fabio's bar for RunPod
  is that the agent must not get it wrong, because mistakes cost money. That is
  a design constraint, not an aspiration: the agent must **query pod state**
  rather than assume the last call worked, and must be able to say "the pod is
  running and costing you money" at any moment. This is the one place in the
  design where acting on a stale assumption has a bill attached.
- **Music suggestion is a prompt, not a capability.** By the time the scene
  exists the agent has the context — a horror scene does not get a happy track.
  Its only dependency is knowing which music models are installed and their
  footprint.

## What already exists (measured 2026-09-01 — do not rebuild)

- **`js/data/modelConstants/footprint.js` (MPI-168)** — a computed **VRAM↔RAM
  requirement curve** per model, not a static minimum: weights that do not fit
  in VRAM spill to RAM, so the requirement is a trade. Its own worked example: a
  16 GB 4060 Ti runs LTX-2.3 bf16 (~58.7 GB of weights) on ~44 GB of RAM. This
  lets the agent answer *"not at your VRAM, but yes with 44 GB of RAM"* instead
  of yes/no. Alongside it: `gpuArch.js`, `MpiMemoryMonitor`.
- **`MpiRunpodSettings`** — RunPod settings already exist. The gap is the agent
  **driving** it, not building it.
- **The agent's hands** — `routes/connector.js`: `POST /connector/generate`
  (models and flows with staged media, MPI-658), `/connector/open-project`
  (MPI-592), the job SSE stream and results (MPI-546). Built for Cubric Studio;
  an in-process agent uses the identical contract.
- **`main/secretsStore.js`** — safeStorage, main-only, never-read-back, with an
  AES-256-GCM fallback. A DeepInfra or RunPod key is one more key in a proven
  store.
- **The agent's eyes** — `comfy_workflows/image_descriptor.json` (same 4B
  abliterated encoder at temp 0.2) and `MpiLoadImageFromPath`, which takes a
  **path**, so the agent can point it at what it just generated.
  `TextGenerate` also accepts a `video` input (frames as an image batch,
  subsampled to 1 FPS internally), so video understanding is a workflow to
  author, not a capability to acquire.
- **Model install** — `/engine/download` and `MpiModelManager`. "Want me to
  fetch the better model?" is a wrapper over these.
- **Music generation** — `ace` is already a loadable `CLIPLoader` type.

## Real gaps

1. **Project-as-durable-state** — named assets (`hero A`, `villain X`,
   `prop Y`), approved beats, and decisions, surviving a session handoff. The
   prerequisite for step 7.
2. **Vision has NO LLM client of any kind** — no Ollama, no DeepInfra, no
   OpenAI. It **deliberately removed** its local LLM runtime on 2026-05-21
   (`docs/archive/mpi-kanban/plans/2026-05-21-remove-local-llm-llama-runtime.md`
   — `routes/llm.js`, `js/services/llmService.js`, the `OLLAMA_URL` storage key,
   the MpiSettings Llama field, and 7.7 GB of `llama_engine/` + `llama_models/`),
   because *"this feature has moved to another app."* That app was Cubric
   Prompt. **This consolidation reverses that decision**, so the LLM client is
   new work, and the removal plan is the map of everywhere it used to touch.
3. **The two corpora and their retrieval path.** Format is shared with
   Cubric-Prompt MPI-35's recipe export — settle it once, in both cards.
4. **The agent driving RunPod**, to the money bar above.
5. **Audio *understanding*** — distinct from music *generation*. `TextGenerate`
   has an `audio` input but Qwen3-VL is not an audio model; a Qwen3-Omni-class
   encoder would be needed. Unverified, and the only item here with no obvious
   path.
6. **Nothing validates the agent's prompt path.** Cubric-Prompt's Stage 1
   harness measures a one-shot, system-prompt-driven rewrite — that is the
   **PromptBox button** path. Nothing measures *"the agent reads a recipe and
   writes a good prompt in conversation"*, which is what this design actually
   uses.

## The enhance surfaces — PROPOSED, not decided (Fabio, 2026-09-01)

**Nothing here is agreed yet. It is Fabio's design conversation written down so
it survives a session boundary; treat every "should" below as a proposal.**

### Three surfaces exist today, and two of them can both fire on the same prompt

| | Where it runs | Cost | What the user sees |
|---|---|---|---|
| **A** prompt-bar wand | Cubric Prompt over the connector | off-GPU | **overwrites** the prompt box |
| **B** settings-panel toggle | the model's OWN graph — `Input_enhance_prompt` (`MpiIfElse`) → `TextGenerate` | **free**, see below | nothing until Reuse on the card |
| **C** Flow enhance button | the standalone `qwen3vl_4b_prompt_enhancer.json` | separate queue job + a duplicate encoder | an editable second field |

**A and B can both be active right now.** Krea 2 declares
`capabilities.promptEnhance: true` and the wand is gated only on Cubric Prompt
being reachable, so a user can enhance with the wand *and* still have the graph
toggle on — the graph then enhances the already-enhanced text. Nothing prevents
it. Worse than double-running: **they are two different recipes.** B's system
prompt is baked into the workflow (`krea2_t2i_sfw.json` node 420, title
`Text String (System Prompt)`); A uses Cubric-Prompt's `krea-2` recipe. Same
model, same user, two behaviours depending on which control was touched.

### Measured — the in-graph enhancer (B) is genuinely free

All four `promptEnhance` models load **one** `CLIPLoader`, and `TextGenerate`
hangs off the same node as the conditioning encoders:

| Workflow | `TextGenerate` | CLIP node | encoders sharing it |
|---|---|---|---|
| `krea2_t2i_sfw` / `_nsfw` | 58 | 69 `qwen3vl_4b_abliterated_fp8_scaled` | 7 |
| `klein_t2i` | 6 | 14 `qwen_3_4b` | 5 |
| `klein_9b_t2i` | 6 | 14 `qwen_3_8b_int8_convrot` | 5 |

So B spends weights the generation must load anyway: no second model, no second
queue job, nothing evicted. **C is the opposite** — for Krea 2 the standalone
graph loads `qwen3vl_4b_abliterated_fp8_scaled.safetensors`, the exact file
node 69 already holds, as a separate job.

Also measured: `Text String (System Prompt)` is a **unique title in all four
graphs**, so a recipe's `systemPrompt` is injectable into B with zero graph
edits, by the same title-addressing the injector already uses. Re-titling it
`Input_Enhance_System_Prompt` would be tidier and is purely additive.

### Fabio's proposal — one control, a Flow-shaped overlay

The reason today's overwrite behaviour is wrong is the iteration loop: *"a man
is walking a dog"* → Enhance → the man should have had a red shirt → edit the
**short** prompt → Enhance again. Once the prompt box holds the enhanced
paragraph that loop is gone; the user is editing a paragraph, and the next
Enhance enhances an enhancement.

So: **one button**, promoted to where the wand sits now and removed from the
settings panel. It opens an overlay — short prompt at the top, Enhance in the
middle, the enhanced text in a large editable box below, OK / Cancel at the
bottom. On OK the control changes colour to show the current prompt is
enhanced, **and the prompt box still shows only the short prompt**. Pressing the
button again reopens it to edit or regenerate. Same shape as the Flows, which
already do exactly this (Character Sheet's *"whatever is in the lower box is
what runs"*).

### Four things that proposal needs to survive contact

1. **Staleness, and it is invisible by construction.** OK, then edit the short
   prompt directly in the prompt box: the stored enhancement now contradicts
   what is on screen, and the design deliberately shows only the short prompt,
   so nothing says so. Store the short prompt that *produced* the enhancement,
   compare, and drop the control back to un-enhanced on any difference. Losing
   an enhancement that costs one press to regenerate beats silently generating
   the wrong scene.
2. **Two texts now exist, so history must carry both**, or Reuse is lossy — it
   either drops the enhancement or pastes the paragraph into the box, which is
   the overwrite problem one step removed. Store both on the item; Reuse
   restores both plus the enhanced state.
3. **The overlay's lower box mirrors the model's fields.** `sdxl`, `kling-3.0`,
   `pony` and `illustrious` are `separate-field` recipes that also emit a
   negative block. One flat box has nowhere to put it, and MPI-35 Phase 2
   measured what happens when a negative loses its channel: it silently becomes
   positive tags.
4. **Removing the settings toggle means pinning the graph node to `false`.**
   `Input_enhance_prompt` still exists in all four workflows; without the pin an
   approved enhanced prompt gets enhanced again inside the graph.

Smaller: an empty lower box on OK should mean *"not enhanced, run my words
raw"* — the rule Character Sheet already states in its own help text.

### What this costs and what it makes a prerequisite

- Dropping B gives up the free in-graph enhance on four models. Not recoverable
  by any design: in-graph cannot hand text back before generating, so it can
  never fill the overlay. It is fire-and-forget by construction, and
  fire-and-forget is what the overlay replaces.
- **Cubric-Prompt MPI-27 becomes a prerequisite, not a loose end.** The overlay
  needs no mode picker because the operation implies the mode — but only once
  `operation` is wired through instead of discarded. The same field carries the
  edit/inpaint exemption, which here means the control is *absent* on those ops
  rather than present and unhelpful.
- Endgame: the standalone enhancer graph (C) has no long-term job — both its
  callers move to the LLM client of gap 2. Consistent with MPI-35 Phase 2's
  recommendation, and stronger than it.

## Corrections recorded (so they do not recur)

- **`MpiClearVram` is free and is a safety device.** Cleared or not, the repeat
  run of the same workflow is still warm (~30 s); VRAM returns to baseline and
  the card cools. Without it, changing settings between runs sometimes OOMs;
  with it, never. **It is not the cause of any reload cost.** The three-minute
  tax is a *different* event: an LLM workflow interleaving between generation
  workflows, where ComfyUI evicts the resident generation models to fit the
  encoder, so the next generation runs cold. Reading `unload_all_models()` in
  `vram.py` as behaviour produces exactly the wrong conclusion — it offloads
  VRAM→RAM, which is why the repeat stays warm.
- **Two "this does not exist" claims made in this session were wrong**, both
  from grepping one file and generalising: the VRAM requirement data (it is
  `footprint.js`, and better than a static table) and RunPod (`MpiRunpodSettings`
  already exists). Grep the repo and its consumers before asserting absence.

## Cross-references

- **Cubric-Prompt MPI-35** — Prompt's half: export recipes, playbook, harness
  and alias map, with two button-path measurements taken on the way. Its
  `plan.md` Plan Drift section carries the cloud-default reasoning in full.
  **Re-scoped 2026-09-01 against this brief**, and three of those decisions land
  here:
  - Its Phases 2 and 3 (the enhancer graph, then the encoder ladder) are now
    **PromptBox-button validation, not the consolidation gate** — enhancement
    rides the agent's LLM, so neither blocks this card.
  - **Its Phase 2 is DONE (2026-09-01) and the answer is: do not build
    per-recipe plumbing into `qwen3vl_4b_prompt_enhancer.json`. Repoint the
    recipe-driven enhance at the LLM client gap 2 needs anyway, and change
    nothing in the graph now.** Full measurement, with every number:
    `Cubric-Prompt/.agents/mpi-kanban/tasks/MPI-35/validation.md`. Four things
    from it this card should not re-derive:
    - **That graph is not on the PromptBox Enhance path.** PromptBox goes
      `connectorOps.enhancePrompt()` → `/connector/enhance` → the broker →
      Cubric Prompt. `promptEnhance` has exactly two callers, both buttons
      *inside Flows* (Character Sheet, MiniMax Music) — `commandRegistry.js:1332`
      says so outright. None of the 12 recipes has ever traversed those nodes,
      so the defects below describe a future local enhance path, not a live
      regression.
    - **The graph is already caller-parameterised, so "fixing" it is far cheaper
      than the question assumed** — four `injectionParams` keys, zero graph
      edits, three of them with shipped precedent in
      `MINIMAX_MUSIC_ENHANCE_PARAMS`. The fourth (the `StringReplace` newline
      flatten) is addressable today as `'Replace Text.replace': '\n'`, because
      that title is unique in the graph.
    - **The decider is runtime cost, not correctness.** Any enhance on this
      graph queues behind generation and evicts the resident generation models
      on a 16 GB card; the LLM client is new work regardless, defaults to
      DeepInfra, and already has to carry `systemPrompt` for the agent.
    - **Measured damage if it is ever wired without those overrides:** 37 of 45
      recipe example prompts come out altered. The newline strip welds
      `sdxl` / `kling-3.0`'s NEGATIVE block into the positive one — and
      `Output_prompt` is one text string, so there is no second channel to
      recover it through. One `no …` clause deletes `minimax-h3`'s entire
      `overall_soundscape` field. `max_length: 512` ≈ 345 words and truncates
      `minimax-h3` t2v/i2v/r2v only (est. 615 / 589 / 830 tokens at their
      budgets); 1024 covers every mode. The one case that flips the
      recommendation is uncensored/offline local enhance — DeepInfra carries no
      abliterated model ([[MPI-13]]).
  - **Gap 3, the corpus format — WRITTEN DOWN, awaiting Fabio's agreement.**
    The format now lives in ONE place, `docs/agent-corpus.md` (2026-09-02), and
    both cards reference that path rather than restating it. Five decisions:
    render the brief from the recipe data (never author a second document),
    `js/data/recipes/` in the dual-loadable idiom `resolveModelDeps.js` already
    uses, `validateRecipe()` + one `.test.cjs` in place of Zod (validation moves
    from module load to test time — stated, not hidden), one `listCorpus()`
    retrieval path with lazy `text()` over both corpora, and `draft` stays
    human-only. Nothing ports until it is agreed. The paragraph below is the
    proposal it was built from. A recipe already carries both faces in one
    object: `systemPrompt` is the *instruction* face the button injects, and
    `structureOrder` / `vocabulary` / `wordBudget` / `dos` / `donts` /
    `examplePrompts` / `notes` are the *readable-brief* face the agent reads. So
    **one artefact serves both — render the brief from the data**, never author a
    second document that can drift from the first. Same shape for app knowledge.
  - **Gap 6 stays here.** MPI-35 deliberately created neither a phase nor a card
    for "nothing validates the agent's prompt path": the subject does not exist
    until gap 2 does, and a second owner across two repos is worse than an
    unstarted phase. Prompt's only obligation to it is exporting the
    readable-brief face, so the test has something to read.
- **Never archive Cubric-Prompt before the export is verified here.**
  `@cubric/ui` is public npm: deprecate and archive, never unpublish, and only
  on Fabio's explicit go.
