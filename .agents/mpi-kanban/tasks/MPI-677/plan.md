# MPI-677 — Consolidate the Cubric family into Cubric Vision

Umbrella plan. Ordered by **Fabio's stated priority**, not by the A–D letters in
the card description. Read `brief.md` for the product shape and the locked
decisions; read this for what happens in what order.

Project mode: **`scalable-foundation`**. Full guardrails, no prototype shortcuts,
and no step starts carrying an unresolved decision.

Shape: **work umbrella** (the MPI-706 pattern) — steps are sections here, not
separate cards, except where an existing card already owns the scope.

## The goal

**Cubric Vision does its own prompt enhancement, so nobody opens the
Cubric-Prompt repo again.** Everything else on this card is downstream of that.

## The order (Fabio, 2026-09-08)

1. **The enhance button becomes in-app.** One control, one path, every model,
   every workflow. Today it calls out over the broker to Cubric Prompt; that
   becomes a local call. **This is what actually retires the sibling app.**
2. **Cut the cord** — delete the broker surface and the dependency on the
   Studio repo.
3. **Release the repos** — archive Cubric-Prompt on Fabio's explicit go.
4. **Later** — the corpus retrieval path, the `cubric-vision` skill split, the
   recipe build/heal loop.
5. **Last** — the agent that talks to the user. Qwen 3.8 27B is evaluated
   *there*, not before.

Mapping to the card description's letters, so the description still resolves:
its **A** is delivered; its **C** is step 5 (last, not first); its **B** and
**D** are step 4; steps 1–3 are the "Studio-retirement cleanup" the description
names but never lettered. **Order is by priority, not by letter.**

## Current State

**2026-09-12 — step 1c round 2: four fixes from Fabio's live pass, one new card,
one piece of field evidence. Step 1c is STILL OPEN and still his.**

Fixed and verified (`npm test` 927/927, lint clean, `tests/enhance-overlay.test.cjs`
18/18, every new assertion proven to FAIL on HEAD's pre-fix source):

1. **The Enhance button died after a generation, permanently.**
   `if (_enhanceDialog) return` + `MpiModal.hide()` not emitting `cancel` = a
   handle that outlives its dialog on every dismissal but the Cancel button. A
   generation pulses `ui:close-all-popups`, which is why it read as "after a
   generation". Guard deleted; teardown runs before the mount.
2. **An enhanced negative leaked across models.** SDXL's counter-tag ladder
   survived a switch to Illustrious, whose recipe writes no negative, because
   `if (negative)` could not tell a negative the USER typed from one the previous
   ENHANCEMENT wrote. Authorship is now recorded on `_enhanced`.
3. **The provenance line named the engine but not the target model** — and under
   it, nothing compared the model at all, so an approved enhancement survived a
   model switch and would have been submitted in the wrong shape. Kept and
   announced rather than dropped (an edit invalidates the words, a switch does
   not).
4. **The Ollama error told the user to open a terminal.** Now "Start Ollama, or
   install it from ollama.com".

Filed: **MPI-728** (todo/planned) — prompt-enhancement settings: the DeepInfra key
field `routes/llm.js` already advertises, Ollama model install/pull, the backend
preference that exists only in `localStorage`, and the enhancer-model choice.

**The finding that matters most is not a fix.** The shipped SFW path enhances on
`gemma4:e4b`, and every v1 recipe was measured on `gemma-4-abliterated-12b`, which
our own registry describes as above an 8B-12B word-budget threshold. Fabio then
produced the first field evidence: `a man walking his dog` on ILL Anime came back
with no `dog` tag at all, while keeping three of the model's own inventions -
a verbatim violation of the recipe's rule 1 ("never their pets"). One run, one
recipe, one input. `validation.md` carries the two candidate causes and the single
experiment that separates them; run that before touching the recipe.


**Delivered 2026-09-08 — the recipe layer is in this repo.** Gate:
Cubric-Prompt MPI-35, closed `done`/`complete`. Verified on disk here rather
than accepted from its report:

- `js/data/recipes/` — 12 `*.recipe.js` plus `registry.js` (`resolveRecipe`,
  `selectSystemPrompt`, `RECIPE_ALIASES`, `FALLBACK_RECIPE_ID`,
  `validateRecipe`), `styles.js`, `brief.js`. Plain ESM, no build step, no Zod.
- `tests/recipe-registry.test.cjs` — the 10 contract tests replacing Zod,
  including the resolution audit read from `models.js` itself.
- `docs/recipes/playbook/` (10 files) — the spec for step 4's build/heal loop.
- `docs/recipes/research/` — per-model research and the `sources.md` manifests.
- `docs/agent-corpus.md` — the corpus format.
- Stage 1 harness: `scripts/recipe-test.mjs` + `scripts/recipe-engines.mjs`
  behind `npm run recipe:test` (`package.json:21`), run live under the GPU
  lease. Claim audit: 13 proven / 0 false.

**Delivered 2026-09-08/09 — steps 1a and 1b are done.** Vision has its own LLM
client (`routes/llm.js` + `js/services/llmService.js`, both backends proven
live) AND the button now calls it: `2558895c` replaced the broker path, deleted
the in-workflow enhance toggle, gated the control on the OPERATION, and folded
the two Flow enhance buttons into one dispatch. `7a9d40df` repointed a stale
cross-repo note. `js/shell/connectorOps.js` has **zero importers left** — step 2
can delete the file outright rather than untangling it.

**Delivered 2026-09-10 — step 1c is BUILT and driven live, and steps 1a + 1b are
now fully closed.** `8059690a` shipped `MpiEnhanceDialog`, the labelled-blob
splitter, staleness detection and `sourcePrompt` through to the sidecar;
`6a79d72b` recorded the live runs. 916/916, lint clean, pushed.

- **Both owed GPU runs ran** (lease taken, released). The ComfyUI-encoder
  backend end to end: Krea 2, `comfy` pinned, 34 s, `qwen3vl_4b_abliterated`,
  zero `/llm/enhance` with `fetch` wrapped. Character Sheet 13 s to a real
  character phrase; Music Maker's `auto` enhance completed on the engine with
  its three-marker output and was cancelled before the music graph — no song,
  no card.
- **Step 1c's every bullet was driven in the running app**, including the
  iteration loop proven AT THE WIRE: with a full enhancement in the lower box, a
  third Enhance press sent the SHORT prompt.
- **The only thing left on 1c is Fabio's user-ux pass** — its verify mode is
  `user-ux`, so no test can close it.
- One leg is recorded as NOT driven: Reuse's sidecar write/read needs a real
  generation plus a reload. Unit-tested and source-asserted only.

**Step 2 was done by ANOTHER SESSION on 2026-09-10, in parallel with this one —
do not start it.** It landed in the shared working tree while step 1c was being
handed off: `js/shell/connectorOps.js`, `services/brokerBoot.js`,
`services/connectorResponder.js` and `tests/connector-responder.test.cjs`
deleted, `@cubric/connector` out of `package.json`, and the four KEEP routes
live-verified with `/connector/enhance` returning 404. That session's checklist
block is the record; it owns the commit.

**Step 1c is untouched by it** — the prompt box still mounts `MpiEnhanceDialog`,
and the only edit to a file this card owns was a three-line comment correction in
`llmService.js`'s header, moving "connectorOps is the thing this replaces" to past
tense. That is right.

**Worth carrying, because it cost this session a wrong handoff.** A whole plan
step can be complete on disk and invisible in `git log` — the deletions were
staged in a shared index, not committed. This card's handoff was written saying
"step 2 is the next buildable thing" and had to be corrected twice within the
hour. **Read the WORKING TREE, not just the history, before claiming any step's
state.** And a user-ux pass on 1c now exercises the post-step-2 tree, not the
`8059690a` state it was measured on.

**STEP 2 IS COMMITTED AND PUSHED — `3b8052d6` (code) + `6e01befb` (card).** The
four KEEP routes were verified live on a booted server, `/connector/enhance`
returns 404, and `POST /llm/enhance` still answers `ok:true`. Full account in
`validation.md`'s step-2 section.

**FABIO'S STEP-1C USER-UX PASS IS UNDERWAY and has already found two things,
both fixed and pushed** (`4f493f4f`, `238d3081`):

1. **Reopening an approved enhancement showed a BLANK provenance line.** `_note()`
   was only ever called inside `_run()`. That line is the only surface the
   FALLBACK WARNING has, so reopening kept the enhancement and silently dropped
   the warning that it came from a recipe the model never matched. Provenance now
   travels with the text: recorded on a successful run, emitted with `apply`,
   stored on `_enhanced`, seeded back on reopen. Reuse deliberately gets none —
   the sidecar stores `sourcePrompt` and nothing else, so a blank line is honest.
2. **The toast on OK is gone, and the feedback moved into the wait.** A
   confirmation for an action the user just took is noise; the part of the flow
   carrying no signal was the RUN. `MpiSpinner` now covers the enhanced box while
   a run is in flight, cleared in `finally` so a failed run cannot leave the box
   reading busy forever.

**What is left in step 1 is THE REST OF FABIO'S 1C PASS and one GPU measurement
(1d).** The steps he has not reached: OK → reopen → Cancel → reopen (the
Cancel-is-non-destructive property, which holds only for an ALREADY-APPROVED
enhancement — an unapproved one is *supposed* to be discarded, and a test script
that says otherwise will report a false defect), the separate-field negative
channel (needs an SDXL / Pony / Illustrious / Kling card — a Krea/Chroma card
cannot show it), the operation gate, and Reuse **after an app reload**, which is
the one leg nothing has ever driven.

**Renames in flight (Fabio, 2026-09-08) — another agent is carding these; do not
create those cards and do not rename anything from this card.**

- **Cubric-Vision → "Cubric Studio"** — the next release carries the name.
- **The Cubric-Studio repo → "Cubric-Connector"** — *renamed, not deleted*.
  Step 2 removes Vision's **broker-SDK dependency**; whether that repo lives on
  as a product for external callers is not this card's question.
- **[[MPI-708]] is the child card that owns all of this**, and its ordering
  touches step 2: the repo renames run **hub → Cubric-Connector first** to free
  the name, then Cubric-Vision → Cubric-Studio. So `package.json:31`'s
  `file:../Cubric-Studio` path **changes if that rename lands before step 2
  runs**. Whoever gets there second fixes the path; do not assume it still
  reads `../Cubric-Studio`.
- **`@cubric/ui` on npm is already deprecated** — closed. It had zero coupling
  to Vision anyway (no import in `js/`, `routes/`, `services/`, `main.js`,
  `server.js`; absent from `package.json`).

**Measured facts a step must not re-derive:**

- **Vision has no LLM client of any kind.** Grepped `js/`, `routes/`, `tests/`,
  `main/` for `ollama|deepinfra|openai|anthropic|/v1/chat/completions|llmService|OLLAMA_URL`
  — **zero hits in runtime code**. The 2026-05-21 removal plan
  (`docs/archive/mpi-kanban/plans/2026-05-21-remove-local-llm-llama-runtime.md`)
  is the map of every place one used to touch.
- **Only 4 of 12 models can enhance in-graph at all.** `models.js:14` states the
  constraint: `promptEnhance` requires a text encoder whose CLIP implements
  `.generate()` (Qwen3-VL, Gemma), and **T5/umT5 models CRASH the `TextGenerate`
  node**. The four are `krea2`, `krea2-nsfw`, `klein-4b`, `klein-9b` — the four
  workflows carrying `Input_enhance_prompt` (`krea2_t2i_sfw`, `krea2_t2i_nsfw`,
  `klein_t2i`, `klein_9b_t2i`). Chroma, Wan, SDXL, LTX, Flux-2, Pony,
  Illustrious and MiniMax-H3 have no in-graph enhancer to reuse.
- **In those four, the enhancer shares the generation's own encoder.**
  `TextGenerate` hangs off the same `CLIPLoader` the conditioning encoders use
  (`krea2_t2i_sfw` node 58 → node 69, 7 encoders sharing it). That is why the
  in-graph enhance is free, and why an enhance job needing *only* that file is a
  subset of what a generation already loads.
- **`Reuse` already restores the enhanced prompt.** MPI-242's `Output_prompt`
  contract at `js/services/generationService.js:945` —
  `const positive = outputInfo.promptText || _positiveFromBox;` — shadows the
  binding so all five sidecar/history writes take what the encoder actually saw,
  while the prompt box keeps the user's own words. **Only the enhanced text is
  persisted; the short prompt is not**, which is the gap step 1c closes.
- **The standalone enhancer graph is already caller-parameterised.**
  `qwen3vl_4b_prompt_enhancer.json` takes four `injectionParams` keys with zero
  graph edits, three of them with shipped precedent in
  `MINIMAX_MUSIC_ENHANCE_PARAMS`. `Replace Text.replace` and
  `Text String (System Prompt)` are unique titles, so both are addressable.
- **Nothing crashes when Cubric Prompt disappears.** `MpiPromptBox.js:1822`
  probes, polls every 3 s for 30 s, gives up; the wand never mounts. Step 2 is a
  deletion, not a rescue.
- **The in-graph encoder is `qwen3vl_4b_abliterated`.** DeepInfra carries no
  abliterated model, so for uncensored work the local path is not a preference.

## Decisions (settled — do not re-litigate)

- **One control, one path, every model** (Fabio, 2026-09-08). A single
  toggle-shaped button in the position the wand occupies now. Clicking it
  **always opens the overlay** — short prompt above, Enhance, the enhanced text
  in a large editable box below, OK / Cancel. On OK the control reads "on" and
  **the prompt box still shows only the short prompt**. No per-model branching
  in the UI at all.
- **The in-graph enhancer is turned OFF, not kept as a second mode.**
  `Input_enhance_prompt` is forced `false` on all four graphs, or an approved
  enhanced prompt gets enhanced again inside the graph. **Enhancement stops
  being a property of the workflow and becomes its own thing** — which is what
  makes one path possible.
- **Why this is not a loss** (Fabio's reasoning, 2026-09-08): with a DeepInfra
  key connected the user pays **no GPU tax on any model**, including the four
  that could have done it in-graph. The free-in-graph advantage only ever
  existed for a third of the model list, and only for users on the local path.
- **Backend is a SETTING, not per-model behaviour.** The user sees one system
  either way:
  - **DeepInfra (default)** — off-GPU, no queue wait, no VRAM at all.
  - **ComfyUI encoder** — the local/uncensored path *on the four eligible
    models*, reusing weights a generation already loads. It beats Ollama on the
    axis that matters here: Ollama is a **second runtime holding a duplicate
    copy of a model on the same card**, which is the cross-app VRAM problem
    Cubric-Prompt spent MPI-14 solving.
  - **Ollama** — local fallback for the other eight models.
- **`capabilities.promptEnhance` changes meaning, not value.** It stops gating a
  settings toggle and becomes "this model's graph carries a `.generate()`-capable
  CLIP", i.e. eligibility for the ComfyUI backend. Keep the key; rewrite its
  JSDoc.
- **The status-bar info text carries the explanation** — that is the `data-info`
  channel's job, not a second control.
- **The settings-panel toggle is removed**, and the enhance buttons living
  **inside Flows** (Character Sheet, MiniMax Music — `commandRegistry.js:1332`
  names them as the only two callers) fold into the same control.
- **Edit and inpaint get no enhancement at all** (locked, Cubric-Prompt MPI-21):
  the control is **absent** on those operations, not present and unhelpful.
- **Cubric-Prompt MPI-27 is not a prerequisite.** It existed to carry
  `operation` across the broker. In-app, Vision knows the operation locally, so
  the exemption above is a local check.

## Step 1 — one enhance control, one path

The whole point of the card. Each rung is shippable and verifiable on its own.

### 1a — the enhance service

- [ ] New `routes/llm.js` + `js/services/llmService.js`. **DeepInfra is the
      default; Ollama is the local fallback.** Model behind config. The
      2026-05-21 removal plan lists every former touch point — use it as a map,
      not a spec. **Verify:** `npm test` green, plus one live one-shot call
      returning text with the backend and model that actually answered echoed
      back (honest state — never imply local when cloud ran).
- [ ] A DeepInfra key slot in `main/secretsStore.js` — its own
      `set/has/get/clear` and a fork-bridge message type. It must **not** share
      the RunPod `apiKey` slot. The key never reaches the renderer; the store
      already enforces that. **Verify:** a test asserts `has…()` true after set,
      and that no route returns the plaintext.
- [ ] The **ComfyUI-encoder backend**, for the four eligible models only: run
      `qwen3vl_4b_prompt_enhancer.json` as its own job and return the text to
      the overlay. Inject the recipe's `systemPrompt` by title rather than
      editing the graph. **Verify:** an enhance on `krea2` with no DeepInfra key
      and no Ollama returns text that matches the `krea-2` recipe's shape.
- [ ] Carry MPI-35 phase 2's overrides on that graph. **The three worst measured
      defects do not reach these four models** — the newline strip welds a
      NEGATIVE block into the positive one, but `krea-2` and `flux-2` (Klein's
      key, `models.js:972`) are not `separate-field` recipes; the `no …` clause
      scrub deletes `minimax-h3`'s `overall_soundscape`, and the 512-token cap
      (~345 words) truncates only `minimax-h3`; neither model is eligible. Set
      the overrides anyway so the backend does not become wrong the moment a
      fifth model qualifies. **Verify:** a test asserts the four
      `injectionParams` are sent, `Replace Text.replace` among them.
- [ ] Uncensored routing: an NSFW prompt must not silently go to DeepInfra,
      which has no abliterated model. **Verify:** the backend choice is asserted
      for that case, not left to a default.

### 1b — the control

- [ ] Replace the broker call. `connectorOps.enhancePrompt()` becomes a local
      call through `resolveRecipe(model.enhanceRecipe ?? model.type)` →
      `selectSystemPrompt()` → the service from 1a. The registry and the alias
      map are already here and already tested. **Verify:** enhance works with no
      broker running and no sibling app installed.
- [ ] One button, in the wand's position, on every model and every workflow.
      Clicking always opens the overlay; its state shows enhanced / not.
      **Verify:** the same interaction on `krea2` and on a `chroma` card — no
      per-model branch in the control's code path.
- [ ] Force `Input_enhance_prompt` to `false` on `krea2_t2i_sfw`,
      `krea2_t2i_nsfw`, `klein_t2i`, `klein_9b_t2i`. **Verify:** a generation on
      `krea2` with an approved enhancement submits that text and the graph does
      not rewrite it — compare the submitted positive against `Output_prompt`.
- [ ] Remove the settings-panel toggle and fold in the two Flow-internal enhance
      buttons. **Verify:** `grep -rn "op: 'promptEnhance'"` finds no button
      outside the one control; Character Sheet and MiniMax Music still enhance.
- [ ] Hide the control on `edit` and `inpaint`. **Verify:** it does not render
      on those operations.
- [ ] Rewrite the `capabilities.promptEnhance` JSDoc (`models.js:14`) to its new
      meaning — ComfyUI-backend eligibility, not a UI toggle. **Verify:** no
      code reads it as a UI gate any more.

### 1c — the overlay

- [x] Short prompt above, Enhance, editable enhanced text below, OK / Cancel;
      the box keeps the short prompt. **Verify:** the iteration loop works —
      short prompt → Enhance → edit the *short* prompt → Enhance again, without
      ever re-enhancing an enhancement.
- [x] **Store the short prompt as well as the enhanced one.** Today only the
      enhanced text is persisted (`generationService.js:945` prefers
      `outputInfo.promptText` over `_positiveFromBox`). The submit path now
      carries the *enhanced* text, so the short prompt needs its own field or
      staleness is undetectable. Store it, compare on every edit, and drop the
      control back to un-enhanced on any difference. **Verify:** OK an
      enhancement, edit the short prompt, and the control reads un-enhanced
      without being told.
- [x] **The lower box mirrors the model's fields.** `sdxl`, `kling-3.0`, `pony`
      and `illustrious` are `separate-field` recipes that also emit a negative
      block; one flat box has nowhere to put it, and MPI-35 phase 2 measured
      what happens — the negative silently becomes positive tags. **Verify:** a
      round trip through the overlay on `sdxl` preserves the negative block in
      its own channel.
- [x] `Reuse` restores both texts and the enhanced state. **Verify:** reuse a
      card enhanced through the overlay and get the short prompt in the box, the
      enhancement stored, and the control reading "on".
- [x] An empty lower box on OK means **"not enhanced, run my words raw"** — the
      rule Character Sheet already states in its own help text. **Verify:** OK
      with the box cleared submits the short prompt unmodified and the control
      reads un-enhanced.

**Built 2026-09-10; the step is NOT closed — its verify mode is `user-ux` and
Fabio's pass is the gate.** Everything under the UI is proven (916/916, lint
clean, and the negative split measured live on three recipe shapes against
DeepInfra); see `validation.md` § Step 1c. Two findings worth carrying forward:
**the four `separate-field` recipes do not agree on a format** — `kling-3.0`
writes an unlabelled positive and a trailing `Negative Prompt:` block, and `pony`
and `illustrious` emit no negative block at all — and **`project.json` stores only
uuid strings**, so `sourcePrompt` had to reach the sidecar or Reuse would lose the
short prompt on the next reload and nowhere earlier.

### 1d — measure the ComfyUI backend *(Fabio's, on the GPU)*

- [ ] **Not an assumption in this plan.** The claim that an enhance on that
      graph evicts the resident generation models came from MPI-35 phase 2,
      which was explicitly **static analysis, no GPU**. The counter-argument is
      that the encoder is a subset of what the generation already loads, so
      nothing needs freeing. Settle it: enhance → generate → enhance → generate
      on the 16 GB card, watching VRAM and whether the second generation runs
      cold. **Verify:** the result is recorded in `validation.md` either way.
      **Certain regardless of the outcome:** a ComfyUI enhance is a **queued
      job**, so it waits behind a running generation. DeepInfra does not.
Nothing above blocks on this. DeepInfra is the default and pays no tax on any
model; the measurement only decides how good the local path is.

## Step 2 — cut the cord

Runs only after step 1: the button cannot lose its backend before it has a new
one.

- [ ] Delete `services/brokerBoot.js`, `services/connectorResponder.js`,
      `POST /connector/enhance` (`routes/connector.js:264`) and the
      `promptEnhance` field it feeds (`:156-157`), `js/shell/connectorOps.js`,
      and the wand block `MpiPromptBox.js:1749-1840` plus its import at `:23`.
      **Verify:** `grep -rn 'connectorOps|/connector/enhance|checkPromptEnhanceAvailable|@cubric/connector' js/ routes/ services/ main.js server.js`
      returns nothing; `npm start` boots and enhance still works.
- [ ] Remove the `@cubric/connector` **broker-SDK** dependency
      (`package.json:31`, a `file:` dep on the Studio repo), its handling in
      `scripts/build-portable.mjs:348,626`, and the import at `server.js:151`.
      This is about Vision's dependency, **not** the fate of the repo being
      renamed to Cubric-Connector. **Verify:** `npm ci` succeeds from a clean
      tree with no `../Cubric-Studio` on disk, and
      `npm run build:portable:dry-run` completes.
- [ ] **Keep** `/connector/generate`, `/connector/open-project`,
      `/connector/jobs/stream` and `/connector/jobs/:id/result` — they are the
      agent's hands in step 5, and an external-caller surface. **Verify:** they
      still answer after the deletions above.
- [ ] Reword only the JSDoc in `js/data/modelConstants/models.js` (`:7-8` and
      the `enhanceRecipe` overrides). **The `type` and `enhanceRecipe` keys
      stay** — they are now the local recipe index `resolveRecipe()` reads, not
      a pointer at a sibling app. **Verify:**
      `node --test tests/recipe-registry.test.cjs` still passes its resolution
      audit.

## Step 3 — release the repos

- [ ] Archive Cubric-Prompt. **Only on Fabio's explicit go**, and only once
      steps 1–2 are live: the export is already verified here, but the repo is
      the fallback until Vision enhances on its own. **Verify:** Fabio says so;
      nothing else counts.
- [ ] `@cubric/ui` — **already deprecated on npm, closed.** Never unpublish.
      **Verify:** nothing to do; recorded so it is not re-opened.

## Step 4 — the corpus, the skill split, the build/heal loop

Not blocking anything above. Each is independently useful.

- [x] **The corpus retrieval path.** `listCorpus() → [{ id, kind:
      'model'|'app', title, tags, text() }]`, `text()` lazy. Model entries render
      through the existing `renderRecipeBrief()` (`js/data/recipes/brief.js:26`,
      tested at `tests/recipe-registry.test.cjs:217-229`). **Verify:** an entry for
      every declared mode of all 12 recipes, `text()` uncalled during
      `listCorpus()`, at least one `kind: 'app'` entry resolving.
      **Built 2026-09-12** as `services/agentCorpus.mjs` — server-side, because
      `js/` is browser code with no `fs`. All three verifies are asserted in
      `tests/agent-corpus.test.cjs`, and the laziness one is a RUNTIME count:
      `fs.readFileSync` is patched on the core module object before the ESM module
      loads, so an eager read is caught rather than reasoned about. The counter is
      proven live in the same test — 0 during `listCorpus()`, 1 when an app
      entry's `text()` is called.
      **Two decisions worth not re-litigating:** an app doc's title and tags come
      from its FILENAME (reading every file to build a listing is the one thing
      this function exists to avoid, and nothing writes front matter yet), and a
      missing `docs/agent/` returns the model half rather than throwing.
- [ ] **Write the first app-knowledge playbooks** into `docs/agent/` — RunPod
      setup, what each operation does, where the gallery is. The documentation
      website stays the fallback the agent points at. **Verify:** `listCorpus()`
      returns them, each non-empty.
      **Seeded 2026-09-12** with `prompt-enhancement.md`: the overlay's two-box
      contract, what a recipe is and the four jobs, the per-OPERATION enhance
      exemption, and the three backends. The rest of the list is still open.
- [ ] **Split `.claude/skills/cubric-vision/SKILL.md`** — 670 lines into a
      ~85-line router plus `projects.md` (~109), `on-disk-format.md` (~181,
      taking §Reference slots because its recovery script is the same shape),
      `generating.md` (~196, the tightest), `engine-and-remote.md` (~74). Router
      keeps the three load-always sections (§Before anything else, §Hand over
      whole prompts, §Connector) and §Tests. Frontmatter `description:` **must
      not change** — it is the skill's external selector.
      **Verify:** every file under the ≤200-line budget (`CLAUDE.md:8`); the two
      broken section anchors repointed —
      `.agents/mpi-kanban/project-knowledge-index.md:174` and
      `docs/playbooks/add-flow/06-preview-image.md:139`; `CLAUDE.md:32` needs no
      edit because the router keeps the path.
      **MPI-593 already owns this** as its own step 1 (agreed with Fabio
      2026-08-21, not started) — do it there, or fold that card in; not both.
      **Sequence it, never batch it:** `MPI-547`'s plan
      (`tasks/MPI-547/plan.md:99`) edits `§ Dispatching a generation`, and
      `MPI-556` + `MPI-675` both claim `SKILL.md` in `files.json`.
- [ ] **The recipe build/heal loop.** `create-enhancer-recipe` already covers the
      **build** leg (playbook steps 0–3, autonomous to twice-green, stopping at
      Fabio's Stage 2). The **heal** leg — playbook `09-field-evidence.md`, the
      return path when a real production contradicts a green recipe — has no
      skill and no intake path. **Open, for Fabio, when this step is reached:**
      is heal triggered by a card he files, or by detection (a model version
      changing in `models.js`)? **Verify:** replay it against `minimax-h3`'s
      already-merged western findings as a **static** dry run reproducing the
      edit list made by hand — no sweep, no GPU. Any real sweep runs under the
      GPU lease and must go green **twice**; a single `ALL PASS` is a luck pass,
      measured as one.

**Hard rules here, from the playbook, not negotiable:** never set a recipe
`status: 'validated'` — Fabio's, and only after a Stage 2 render. Never render.
Never pipe the harness through `tee`; the pipeline reports tee's exit code, so a
failing sweep reads as exit 0.

## Step 5 — the agent that talks to the user

Last. `brief.md` § "The product shape" is the spec; its constraints are locked
there and not re-argued: the **user is the gate at every step**, **project is
durable state, not the transcript**, **the agent reads corpora rather than
calling black boxes**, and **every spend-incurring action is
confirm-then-VERIFY**.

Sketched only — this gets its own plan when it is reached.

- Project as durable state: named assets, approved beats, decisions, as new
  top-level keys in `project.json` with a `schemaVersion` bump.
  `js/data/projectModel.js` defines the shape and
  `js/migrations/projectMigrations.js` is the seam; it is ready.
- The conversation surface is **net-new** — there is no `MpiChatPanel` or
  anything conversation-shaped in `js/components/`.
- Decide the dispatch path **before** building: the in-process agent either uses
  `POST /connector/generate` (identical contract, `routes/connector.js:34`) or
  gets its own server-side dispatch. Mixing them makes the deliberately-dumb SSE
  relay load-bearing, which `connector.js:34-40` warns against by name.
- RunPod: the client already exists (`routes/runpodRemote.js:234`,
  `GET /runpod/pods/:id`). The gap is the agent *driving* it — every mutation
  followed by a real state read, never a claim from cache.
- Gap 6 — nothing measures "the agent reads a recipe and writes a good prompt in
  conversation". Build that once step 1a exists; the subject does not exist
  before then.
- **Qwen 3.8 27B is evaluated here.** Fabio's reason is external evidence: a
  competitor runs that model for this job. Cloud makes 27B cheap to consider;
  the local free path makes it expensive. Check any Qwen honours `think: false`
  first — a 4B Qwen was rejected as an enhancer for ignoring it.

**Deferred out of step 5:** audio *understanding* — `TextGenerate` has an
`audio` input (`engine/.../nodes_textgen.py:38`) but no installed encoder can
tokenize it; a Qwen3-Omni-class model would be needed. Music *generation* is a
different thing and needs real wiring: `ace` is a CLIPLoader type in the engine
blueprint only, absent from every one of Vision's `comfy_workflows/*.json` and
from `dependencies.js`. Video *understanding* is cheap by contrast — a workflow
to author against `TextGenerate`'s `video` input (1 FPS subsample), no new node
type.

## Parallel Batch

**None, deliberately.** Steps 1a→1b→1c are a dependency chain. Step 2 depends on
step 1. The skill split in step 4 collides with three live cards on one file
(MPI-547, MPI-556, MPI-675). The only genuinely disjoint pair is the corpus work
and the skill split, both in step 4 — batch them there if two workers are free,
with ownership `js/data/recipes/corpus.js` + `docs/agent/**` against
`.claude/skills/cubric-vision/**`, and only once MPI-547 has landed.

## Plan Drift

- **2026-09-09 — "fold in the two Flow-internal enhance buttons" was read as ONE
  DISPATCH, not one backend, and that reading is load-bearing.** The obvious
  reading — route Character Sheet and Music Maker to the cloud default like
  everything else — would have dropped three post-processing nodes those flows
  depend on: `Replace Text` strips newlines, `Input_Scrub_Negation` deletes
  "no …" clauses, `Input_Tidy` eats the trailing full stop because a character
  phrase is spliced into the middle of a longer sentence. Both flows were tuned
  on real GPU runs against that chain, and Character Sheet's recipe is not even
  in JS — it is baked into the graph's `Input_System_Prompt` node. Sending them
  to DeepInfra is changing the instrument without measuring it. So
  `MpiBaseFlow._runEnhance`'s near-copy of the `enqueueGeneration` call was
  deleted and both flows call `runComfyEnhance()`, the single dispatch to that
  graph; the op name and the not-in-this-build guard moved with it, which is why
  the declarations no longer carry `op: 'promptEnhance'` and the step's literal
  grep still passes. **A flow that wants the cloud opts in after someone
  measures the difference.**
- **2026-09-09 — forcing `Input_enhance_prompt` false needed no graph edit.** All
  four workflows already bake `boolean: false` on that MpiIfElse; the only thing
  that ever set it `true` was the `enhancePrompt` control's
  `getInjectionParams()`. Deleting the control IS the forcing. Both halves are
  now asserted — nothing offers the toggle AND every graph bakes false — because
  either alone is a false green.
- **2026-09-09 — the `sdxl` negative-block defect is PARITY, not a regression 1b
  introduced, and that was measured rather than assumed.** A `separate-field`
  recipe returns `POSITIVE PROMPT: …\nNEGATIVE PROMPT: …` as one blob and the
  whole blob lands in the positive box. Cubric-Prompt has **no splitter anywhere
  in `src/main/`** (grepped), so its responder returned the labelled text as
  `prompt` and left `negativePrompt` undefined — the broker path did exactly the
  same thing. `pony.recipe.js:216-227` reached the same conclusion independently
  from the other side while deciding not to emit a negative block at all. Left
  for 1c deliberately: which channel the negative lands in is something the user
  should see and approve in the overlay, not something the control does behind
  them.

- **2026-09-08 — reordered to Fabio's priority, and the letters retired.** The
  first draft led with the card description's A/B/C/D and put the agent
  workspace early. Fabio: the merge of Cubric-Prompt into Vision is the whole
  job and comes first; the agent workspace is last; MPI-593 is near-last;
  Qwen 27B is far future.
- **2026-09-08 — the enhance control went through two designs in one session.**
  First: a toggle that stayed in-graph on the four capable models and opened an
  overlay elsewhere. Fabio replaced it with **one path** — the overlay for
  every model, the in-graph enhancer turned off — on the reasoning that with a
  DeepInfra key there is **no GPU tax on any model**, so the free-in-graph
  advantage only ever applied to a third of the list and only for local users.
  Enhancement becomes its own thing rather than a property of the workflow.
  Consequences: pinning `Input_enhance_prompt` is **back in scope** (it was
  dropped under the toggle design), and the ComfyUI encoder survives as the
  *local/uncensored backend* rather than as a second UI behaviour — chosen over
  Ollama because Ollama is a second runtime holding a duplicate copy of a model
  on the same card.
- **2026-09-08 — the brief's "one control means losing the free in-graph
  enhance" is answered, not accepted.** It is a real cost, deliberately taken,
  and it is bounded: 4 models of 12, local path only.
- **2026-09-08 — renames land from elsewhere.** Vision → "Cubric Studio";
  the Studio repo → "Cubric-Connector", renamed not deleted; `@cubric/ui`
  already deprecated. Step 2 was reworded so it removes a *dependency*, not a
  repo.
- **2026-09-08 — four brief claims corrected by measurement:** `ace` is
  engine-blueprint only; the RunPod client already exists so only the driving is
  missing; the corpus is half-built (`renderRecipeBrief` ships, `listCorpus()`
  and `docs/agent/` do not exist); audio understanding is blocked at the encoder
  while video understanding is only a workflow to author.

## Verification

**Verify mode:** `auto`, with one exception — **step 1c (the overlay) is
`user-ux`**. Step 1d is Fabio's measurement on the GPU and is not a gate on
anything. Everything else self-verifies through tests, greps and a boot.

The umbrella is done when Vision enhances every model with no sibling app
installed and no broker running, `grep` finds no broker or connector-enhance
surface, `npm ci` succeeds with no `../Cubric-Studio` on disk, and Cubric-Prompt
is archived on Fabio's word.

## Preservation Notes

- Move `qwen-3-8-27b-candidate.md` from Cubric-Prompt's memory onto this card
  when step 5 starts — the note says so itself, and the work is Vision's.
- `docs/agent-corpus.md` is the single home of the corpus format. Keep both this
  card and Cubric-Prompt MPI-35 referencing that path rather than restating it.
- Step 2's grep list is the retirement checklist; keep it current if the broker
  surface moves before step 2 runs.
- The four investigations behind this plan live in a session scratchpad that
  expires. Everything durable is quoted inline above with its file:line — if a
  step needs more, re-derive it rather than trusting a path that is gone.
