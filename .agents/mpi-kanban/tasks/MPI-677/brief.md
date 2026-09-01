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

- **Cubric-Prompt MPI-35** — Prompt's half: measure recipe portability, then
  export recipes, playbook, harness and alias map. Its `plan.md` Plan Drift
  section carries the cloud-default reasoning in full.
- **Never archive Cubric-Prompt before the export is verified here.**
  `@cubric/ui` is public npm: deprecate and archive, never unpublish, and only
  on Fabio's explicit go.
