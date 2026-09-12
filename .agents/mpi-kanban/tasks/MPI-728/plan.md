# MPI-728 — Prompt-enhancement settings: the key, the models, and who chooses

Parent: **MPI-677** (the consolidation umbrella), whose step 1c found all three
gaps. Read the card description first — it carries Fabio's direction verbatim and
the measurement behind it. This plan is the order and the verifies.

Project mode: **`scalable-foundation`**.

## The goal

**The app stops guessing which LLM should enhance, and the user picks — with
enough on screen to pick well.** Everything here is downstream of that: the
deletion, the key field and the Ollama ladder all exist so that a choice is
possible and informed.

## Current State

**2026-09-12, ROUND 3 — SHIPPED AS `da3b23bc`, pushed. MASTER WAS RED ON THIS CARD
AND THAT COMMIT IS THE FIX.** `fef67f9d`'s retargeted desktop spec had never been
run; run here it failed at `:89`, and so had every master CI run since `fef67f9d`.
It closed panels with `querySelector('.mpi-slide-over')`, which hands back the
Remote panel still sliding out (it stays in the DOM up to 400ms), and close() on
that node is a no-op. Now `[aria-expanded="true"]`. `MpiSlideOver` was correct.

Fabio's round-3 review, all in `da3b23bc`:
- **No "Automatic".** DeepInfra / Ollama / ComfyUI, and **ComfyUI is the default**
  (`chooseBackend` / `backendPreference`; `serverStatus()` deleted with the route
  it fed). DeepInfra is listed but DISABLED until a key is saved; ComfyUI likewise
  until its plugin is installed. A pinned backend that becomes unavailable stays
  selected with a "Needs…" note — never swapped.
- **"New to DeepInfra?" promo** → `https://deepinfra.com/dash`. RunPod's promo CSS
  is lifted into `MpiSettings.css` as `.mpi-settings__signup` and shared.
- **One picker open at a time, app-wide.** Every picker trigger stopPropagation()s,
  hiding the click from the other open picker's document listener, so lists
  stacked. New bus event `ui:picker-open` in MpiDropdown / MpiTreePicker /
  MpiStylePicker. NOT `ui:close-all-popups`: MpiModal and MpiPopup close on that
  whatever its reason, and a picker can sit inside either.
- **`.claude/rules/` updated with his permission.** A peer's uncommitted
  MPI-589/678 lines in `component-events-primitives.md` stayed out of the commit
  via a hand-built index blob; they are still in the working copy, theirs.

Verified: `npm test` 949/949, both lints clean, both touched desktop specs pass. CI
on `da3b23bc` is recorded in `validation.md`. NOT proven RED on HEAD: the new
exclusivity asserts (stash is banned; the red master came first).

**ROUND 3 IS VERIFIED BY FABIO (2026-09-12), in the desktop app.** Clear, the
greyed DeepInfra entry with no key, the ComfyUI default, the dashboard button, and
one dropdown open at a time: all four check out, and he had already seen Save work.
"There's no cost in the dropdown" meant exactly "it does not read as a ranking",
confirmed. **Phases 1+2 have nothing outstanding.**

**NEW OPEN QUESTION, FABIO'S: SHOW A PRICE.** He never asked for one before, but
now wants it: "maybe price per token would suffice". Nothing is decided or built,
and it folds into this card because it is the same panel. Proposed shape, NOT
verified: each DeepInfra model option's stacked meta shows `$/1M in · $/1M out`,
maybe with an "≈ $ per enhance" estimate (recipe size × price), and local backends
say they cost no money. Open: where the prices come from (a dated static field on
`MODEL_REGISTRY` in `services/llmEngines.mjs`, or DeepInfra's API, which nobody
has checked for pricing), and whether this overlaps MPI-741 (credits research, a
peer's card).

**THE SINGLE NEXT ACTION:** settle the price display with Fabio (build it or park
it), then phase 3, the Ollama lifecycle.

### Round 2 state, for reference

**2026-09-12, round 2 — RESTRUCTURED ON FABIO'S SCREENSHOT REVIEW, still awaiting
his eyes.** He compared the section against the RunPod one and was right three
times: a field label with no field under it (`[hidden]` is inert against
`display: flex`), the cost metas truncated to "CLOUD W…", and the wrong layout
(the house pattern is label ABOVE + full-width control). All three fixed and
re-verified live. Two scope calls came with it, both his: **a new "Remote"
slide-over** holding the LLM and RunPod sections, both MOVED out of Settings
rather than duplicated; and **the section is about the LANGUAGE MODEL, not about
one button** — it covers image description and the agent too, so
`MpiEnhancementSettings` became `MpiLlmSettings`, retitled "Language Models",
restructured one row per job. `npm test` still 944/944, both lints clean.

**THE SINGLE NEXT ACTION is unchanged: Fabio opens the DESKTOP app.** Now: the
nav's new Remote entry, the DeepInfra key field (a browser can only exercise its
disabled branch), and whether the copy reads as a placement choice.

**One check is owed and NOT RUN:** `tests/desktop/runpod-settings-extract.spec.js`
was retargeted from Settings to Remote. It is an Electron spec and this session
has no evidence it passes.

**`.claude/rules/` IS NOW STALE and was deliberately not edited** — rule files need
explicit permission. `component-mounts.md:170` and
`component-events-primitives.md:198` both say `MpiSettings` mounts
`MpiRunpodSettings` into `#mpiSettingsRunpodMount` and destroys it. Both facts
moved to `MpiRemote` / `#mpiRemoteRunpodMount`.

### Round 1 state, for reference

**2026-09-12 — PHASES 1 AND 2 ARE BUILT, in `doing`, awaiting Fabio's eyes.**
The precondition passed in its strongest form (the graph ran on an idle bench with
NO generation model loaded — `validation.md` has the prompt id and the output), so
nothing was rewritten. `npm test` is 944/944, both lints clean, the new assertions
proved RED on HEAD by script, and the panel was driven live on an own isolated
instance: both branches of the dep gate, the per-backend model filter, persistence
across a close/reopen, and a real end-to-end enhance.

**THE SINGLE NEXT ACTION: Fabio opens Settings in the DESKTOP app.** Two things no
automated check can reach — the DeepInfra key field (Playwright drives a browser,
where `secretsClient.isAvailable()` is false by design, so only the disabled branch
was exercised) and whether the copy reads as a PLACEMENT choice rather than a
quality ranking, which is the whole point of the card.

**Phase 3 (the Ollama lifecycle) is untouched** and is what remains after that.

**The gotcha worth carrying:** the shared `cubric-agent-profile` is a FIXED path, so
a peer's isolated app holds the single-instance lock and yours dies at exit 0 with
an `EPERM` prune as the only tell. `CUBRIC_AGENT_PROFILE=<a copy of it>` is the fix
— a copy rather than a fresh dir, because a fresh profile has no dep state and the
ComfyUI entry then greys out for the wrong reason.

### The earlier state, for reference

**2026-09-12 — planned, not started.** Nothing in `js/services/llmService.js` has
changed; the four lines the card names are all still on disk at `:49`, `:139`,
`:160`, `:168`. What changed today is only the card: `720dacb1` recorded Fabio's
call that the classification is DELETED rather than replaced.

**Three findings from this planning pass that resize the card.** All measured on
disk 2026-09-12, not read from the description:

1. **Gap 1 is a UI field, not a store.** `main/secretsStore.js` already has
   `setDeepInfraKey` (`:163`), `hasDeepInfraKey` (`:175`), both `ipcMain.handle`
   channels (`:238-239`) and the fork-bridge request/response pair (`:267-276`).
   `js/core/secretsClient.js` already exposes `setDeepInfraKey` (`:81`),
   `hasDeepInfraKey` (`:93`), `clearDeepInfraKey` (`:106`) and the desktop-only
   gate `isAvailable()` (`:27`) the field needs. `routes/llm.js:49`
   asks the bridge FIRST and falls back to `DEEPINFRA_API_KEY` second, so the
   card's "the key only ever reached the app through the environment" describes
   the missing field, not the missing plumbing. `tests/llm-service.test.cjs:172-223`
   already covers the store and the bridge. **Nothing main-side is owed.**
2. **The settings home exists, and so does the precedent for not bloating it.**
   `MpiSettings.js` is 991 lines and mounts `MpiRunpodSettings` — its own Compound
   since MPI-177 — into `#mpiSettingsRunpodMount`, forwarding `onOpen` so it
   re-reads on every open. Enhancement follows that shape exactly rather than
   adding a seventh inline `<section>`.
3. **The deletion and the picker are ONE edit, not two in sequence.** Remove
   `isUncensoredModel` and `chooseEngineModelId()` returns `undefined` on every
   path — the function is dead, not merely simplified. The thing that revives it
   is the user's stored enhancer id, which is the same localStorage shape
   `backendPreference()` / `setBackendPreference()` already use (`:172-189`). So
   phase 1 is a SWAP: an inference replaced by a preference.

## Decisions (settled — do not re-litigate)

- **The classification is deleted, not re-homed.** No `uncensored: true` field on
  the model defs. A LoRA the user downloads makes any model uncensored, so the
  property was never a fact about the card; a suffix and a boolean are the same
  mistake at different resolutions. (Fabio, 2026-09-12.)
- **The reason is about the user, not the model.** A user who wants nothing
  explicit would never pick an uncensored LLM; the uncensored user is the exact
  inverse. The app cannot know which it is talking to and the target model does
  not say, so the disposition belongs to the person.
- **Uncensored is not a synonym for better, and the copy must not imply it is.**
  The abliterated 12B is the enhancer OF RECORD and it dropped the user's own
  subject 6 runs in 10 where both shipped models dropped none (MPI-677
  `validation.md`, the dog experiment, 30 runs).
- **The `-nsfw` model ids stay.** `sdxl-nsfw`, `krea2-nsfw`, `klein-lora-nsfw`
  are card names and product data. What goes is the inference drawn FROM the name.
- **Phase 1 does not ship without phase 2.** Deleting the route while no picker
  exists leaves a user who wants the abliterated build with no way to ask for it —
  `backendPreference()` accepts `'comfy'` but nothing in the UI sets it. The two
  phases land in ONE commit. This is the whole reason the card is planned as a
  unit rather than taken as "four lines".

## Answered by Fabio, 2026-09-12 — and the question's premise was wrong

**THE DROPDOWN IS ABOUT WHERE THE WORK RUNS, NOT WHICH MODEL IS SMARTEST.** This
is the framing everything else follows from, and the copy has to carry it. His
two cases are the spec:

- Generating on a **RunPod pod** — enhance locally on **Ollama**, because the
  local card is idle anyway.
- Generating **locally in ComfyUI** — push enhancement to **DeepInfra**, so it
  costs no local VRAM and the generation stays fast.

So the entries are **backends, not model ids**: **DeepInfra / Ollama / ComfyUI.**
The enhancer-model choice sits *under* the chosen backend, it is not the top-level
axis.

**ONE DROPDOWN PER JOB, NOT ONE FOR THE APP.** Fabio: "Perhaps we could have
three dropdowns: Enhancement, Descriptions, the agent later on." Enhancement and
Descriptions ship here; **Descriptions is MPI-737**, its own card, and the agent's
dropdown arrives with MPI-677 step 5.

**THE FOUR-MODEL GATE I ASKED ABOUT DOES NOT EXIST — measured 2026-09-12.**
`comfy_workflows/qwen3vl_4b_prompt_enhancer.json` carries **its own `CLIPLoader`**
(node 9, `qwen3vl_4b_abliterated_fp8_scaled.safetensors`), and so does
`image_descriptor.json` (node 35). Neither borrows the generation model's encoder.
So `canEnhanceInGraph()`'s four-model restriction is a **VRAM-thrift heuristic**
— those four already have that weight resident — **not a capability limit**. The
graph runs on any model; it just loads the weight itself.

The T5/umT5 crash warning in `models.js` is real but describes the **in-graph**
`TextGenerate` node wired to a generation model's own CLIP (Krea2 node 58, behind
`Input_enhance_prompt` at node 241). It does not apply to the standalone graph.

**So the honest gate on the ComfyUI entry is the one the plugin already uses:
is `qwen3vl-abliterated-clip` installed?** (`js/data/pluginsRegistry.js:63`,
`requiredDeps`.) Same dep, same question, for both jobs. No per-model greying to
design.

**`canEnhanceInGraph()` therefore has no caller left after this card.** Do not
delete it in phase 1 — verify first whether the VRAM-thrift reading is worth
keeping as a *recommendation* in the picker ("no extra VRAM on this model"), which
is the only honest use left for it. **Verify on a non-Krea model before relying on
any of this**: both loaders pass `type: "krea2"` to `CLIPLoader`, and that is a
Comfy CLIP-type string, not a model dependency — but it has never been exercised
outside the four.

## Phase 1 — the swap: an inference becomes a preference

**Owns:** `js/services/llmService.js`, `tests/llm-service.test.cjs`.

- [ ] Delete `UNCENSORED_MODEL_ID` (`:49`) and `isUncensoredModel` (`:139`),
      including the doc comment that proposes the rejected `uncensored: true`.
- [ ] Delete the NSFW branch in `chooseBackend` (`:160`) and the comment stating
      the guarantee it enforced.
- [ ] **AND FIX THE LINE ABOVE IT, which the new design contradicts.**
      `chooseBackend`'s first line is
      `if (override === 'comfy') return canEnhanceInGraph(model) ? 'comfy' : 'ollama'`
      — it silently DOWNGRADES an explicit ComfyUI pick to Ollama on any model
      outside the four. That was defensible while `comfy` meant the in-graph
      encoder. It is wrong now: the standalone graph loads its own CLIP and runs
      anywhere, so an explicit pick must be honoured. A user who picks ComfyUI and
      silently gets Ollama is the same class of defect as the silent NSFW route
      being deleted, and Ollama may not even be installed.
      **`canEnhanceInGraph()` then has no caller.** Do not delete it in the same
      breath — decide first whether it survives as the picker's "no extra VRAM on
      this model" hint (see the Answered section). If it does not, it goes, and
      `capabilities.promptEnhance` on the four model defs goes with it: that flag
      has exactly one reader.
- [ ] **Verify the standalone graph on a non-Krea model BEFORE relying on any of
      this.** Both loaders pass `type: "krea2"` to `CLIPLoader` — a Comfy
      CLIP-type string, not a model dependency, but never exercised outside the
      four. If it turns out to be a real dependency the whole "offered on every
      model" design changes shape, so this is the first thing to run, not the last.
- [ ] Replace `chooseEngineModelId` (`:168`) with the user's stored choice.
      Mirror the existing preference pair exactly: `enhancerModelPreference()` /
      `setEnhancerModelPreference(id)` on `cubric.llm.enhancerModel`, same
      try/catch-around-localStorage shape as `backendPreference()` (`:172`), which
      is there because a private window throws on access.
- [ ] Update the module header: the three-backend paragraph describes `comfy` as
      "the local/uncensored path" and that wording is now wrong.
- [ ] **The test surface is THREE WHOLE TEST FUNCTIONS, not "four assertions"** —
      measured 2026-09-12, correcting the card:
      `testUncensoredNeverReachesTheCloud` (`:55-64`) is DELETED outright. It
      asserts the rule being removed, "stated four ways so a refactor cannot
      quietly drop it" — which is exactly what this is, and it is deliberate, not
      the accident that comment was guarding against.
      `testUncensoredWorkGetsTheAbliteratedModel` (`:78-85`) is REPLACED by a
      preference test. `testUncensoredModelIsIdSuffixed` (`:86-92`) is DELETED;
      the function under test is gone. Plus their three registration entries at
      `:236,238,239`.
- [ ] `testExplicitOverrideWins` (`:66-76`) SURVIVES — every assertion in it
      still passes — but its closing comment ("An override is NOT allowed to send
      uncensored work to the cloud by accident") describes a rule that will no
      longer exist. Reword the comment; do not touch the assertion.
- [ ] Remove the `NSFW_ELIGIBLE` / `NSFW_PLAIN` fixtures once nothing reads them.
      They are orphaned BY this change, so they are in scope; the file's other
      dead code, if any, is not.

**Verify:** `npm test` green; `node --test tests/llm-service.test.cjs` green;
`grep -rn "isUncensoredModel\|UNCENSORED_MODEL_ID" --include=*.js --include=*.cjs .`
returns nothing outside `engine/`; `npm run lint` clean. **Prove the new
assertions FAIL on HEAD's pre-swap source by script** — `git show HEAD:<path>`
into a regex check, never by eye (MPI-677's round-3 rule).

## Phase 2 — the picker, and the key field

**Owns:** `js/components/Compounds/LandingPages/MpiEnhancementSettings/` (new),
`js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` (one mount
div + one mount call + `onOpen` forward), `js/components/types.js`.

Its own Compound mounted into `MpiSettings`, following `MpiRunpodSettings`
(MPI-177) — not a seventh inline section in a 991-line file.

- [ ] **The DeepInfra key.** Write-only field through
      `secretsClient.setDeepInfraKey` / `hasDeepInfraKey` / `clearDeepInfraKey`,
      copying `MpiRunpodSettings.js:1729-1820`'s shape verbatim: disabled with a
      "Desktop app only" placeholder when `secretsClient.isAvailable()` is false,
      never read back, state key never added to `js/state.js` (see the warning at
      `js/state.js:181`).
- [ ] **The Enhancement dropdown — backends, not model ids.** Automatic /
      DeepInfra / Ollama / ComfyUI, writing the `cubric.llm.backend` preference
      that has existed in localStorage with no UI since step 1a. **ComfyUI is
      offered on every model**, greyed only when `qwen3vl-abliterated-clip` is
      absent, with "Install the Image Describer plugin" as the reason — the
      same gate `pluginsRegistry.js:63` already applies.
- [ ] **The enhancer-model choice sits UNDER the chosen backend**, not beside it:
      visible for DeepInfra and Ollama, listing `MODEL_REGISTRY` filtered to the
      ids that backend can actually serve (`deepInfraId` / `ollamaName` present),
      writing `setEnhancerModelPreference` from phase 1. ComfyUI has exactly one
      model — the weight its graph loads — so it shows none.
- [ ] **The Descriptions dropdown is MPI-737's**, not this card's. Leave the
      section's markup able to hold it; do not build it here.
- [ ] **The copy that makes the choice informable**, and it carries three facts
      that are not optional: a hosted provider will refuse or sanitise what a
      local abliterated build will shape (this is the guarantee `chooseBackend`
      used to enforce silently, now information the user needs); **uncensored is
      not better** — the 12B's measured subject-drop goes here; and one plain
      sentence on what enhancement does at all.
      **It must read as a placement choice, never as a quality ranking.** Say what
      each backend COSTS — cloud: no VRAM, needs a key; Ollama: local, second
      runtime, its own VRAM; ComfyUI: local, reuses the engine already running.

**Every control is a `ComponentFactory.create()` component, BEM-named
`.mpi-enhancement-settings__*`, colors from CSS vars, icons from
`js/utils/icons.js`, listeners via `on`/`off` with a real `el.destroy()`** — the
Critical Rules Snapshot applies and `MpiRunpodSettings` is the worked example.

**Verify:** `npm run lint:components` clean; the panel opens, each control
persists across a close/reopen (`onOpen` re-reads) and across an app restart; a
stored key reports `hasKey` on `/llm/status`; **user-ux** — Fabio drives it.

## Phase 3 — the Ollama lifecycle, ported

**Owns:** `routes/llm.js`, `services/llmEngines.mjs`, plus the new Compound.

**This is consolidation debt, and the source still exists.** Cubric-Prompt is
archived, not deleted — `c:\AI\Mpi\Cubric-Prompt` is on disk and its MPI-8 and
MPI-17 are the specification. **Read them before writing anything**; step 1a
ported the engine and the route and none of the ladder, and nothing recorded that
it had not.

- [ ] The MPI-8 ladder: probe the server, spawn `ollama serve` detached, treat
      ENOENT as the not-installed signal, one-time remembered consent, then
      winget, download page as the fallback. **Never bundle Ollama, never stop it
      on quit** — the user may be running it for something else.
- [ ] MPI-17: the spawn must inherit the desktop app's configured model
      directory, recovered from the Ollama app's own `server.log`. **Never set
      `OLLAMA_MODELS` as a persistent variable** — it shadows whatever the user
      later picks. Measured on Fabio's machine as 0 models reported against 9
      models / 63.2 GB on disk.
- [ ] Model presence check + `api/pull` with progress. Today a user with Ollama
      running but without the model gets `Ollama chat failed: 404 Not Found` raw;
      grepped 2026-09-12, there is no `api/pull`, no presence check and no
      `ensureOllama` anywhere in this repo.

**Verify:** with Ollama stopped, the app offers to start it and does; with it
running but the model absent, the pull runs with visible progress and the enhance
then succeeds; `OLLAMA_MODELS` is not set persistently anywhere
(`grep -rn "OLLAMA_MODELS"`). **user-ux** — only a real machine shows this.

## Parallel Batch

**None.** Phase 1 is the contract phase 2's controls write to, and phase 3 edits
the route phase 2 calls. Three phases, one file lineage, one worker.

## Completed

**Phase 1 + phase 2, one change set, 2026-09-12.** Files: `js/services/llmService.js`,
`tests/llm-service.test.cjs`, `js/data/modelConstants/models.js`,
`tests/output-prompt-capture.test.cjs`, `routes/llm.js`, the new
`js/components/Compounds/LandingPages/MpiEnhancementSettings/{js,css}`,
`MpiSettings.js`, `js/components/types.js`, `js/shell/preloadStyles.js`.
Evidence in `validation.md`.

## Plan Drift

- **2026-09-12 — `canEnhanceInGraph()` was DELETED, not kept as a hint, and the
  measurement is why.** The plan left the decision open pending the precondition.
  The precondition answered it: the "no extra VRAM on this model" reading holds for
  `krea2`/`krea2-nsfw` (whose workflows load the same encoder file AND the same
  CLIP type as the enhancer graph, so ComfyUI's cache hits) and FAILS for
  `klein-4b`/`klein-9b` (`qwen_3_4b` and `qwen_3_8b_int8_convrot`, type `flux2` — a
  different weight and a different cache key). A hint wrong on half its members is
  worse than none, so it went, and `capabilities.promptEnhance` with it — the plan
  pre-authorised that branch. If the hint is ever wanted, derive it from the
  workflow's own CLIPLoader instead of hand-setting a boolean.
- **2026-09-12 — `chooseBackend()` no longer takes `model` at all.** The plan
  described fixing the `comfy -> ollama` downgrade and deleting the `-nsfw` route.
  With both gone the function reads no model property, so the parameter went too
  rather than sitting there as a lie about what steers the choice. Callers still
  pass `{ model, ... }` harmlessly; the tests assert the card cannot change the
  answer.
- **2026-09-12 — phase 2 added `GET /llm/models`, which the plan did not name.**
  `MODEL_REGISTRY` lives in `services/llmEngines.mjs`, server-side ESM the renderer
  cannot import, so the picker had no way to list models or know which backend can
  serve each. The route reports per-backend coverage (`ollama` / `deepinfra`) rather
  than one "available" flag, because coverage is asymmetric on purpose. `routes/llm.js`
  was added to this card's ownership for it.
- **2026-09-12 — the enhancer-model select is hidden under Automatic and ComfyUI,
  not merely filtered.** ComfyUI runs one graph with one baked weight, so there is
  nothing to pick; Automatic means the app chooses the backend, and a model chosen
  under a backend nobody picked cannot be honoured. Both say so in a hint rather
  than showing a control that does nothing.
- **2026-09-12 round 2 — A NEW "REMOTE" SLIDE-OVER, and both sections MOVED into
  it** (Fabio, on reviewing the panel). Settings had grown to a thousand lines of
  local-machine concerns with the RunPod engine bolted on the end; the language
  models were about to be bolted on beside it. Neither belongs there. `MpiRemote`
  is a new LandingPages Compound that owns no controls — it mounts `MpiLlmSettings`
  and `MpiRunpodSettings` and forwards `onOpen` — and the nav gained `Remote`
  between Settings and Hotkeys. **Moved, not duplicated:** each section lives in
  exactly one panel, which is what `runpod-settings-extract.spec.js` now asserts.
  `MpiRunpodSettings` itself was unchanged apart from its header comment.
- **2026-09-12 round 2 — THE SECTION IS ABOUT THE LANGUAGE MODEL, NOT ABOUT ONE
  BUTTON.** Fabio: "right now the whole section is built only for prompt
  enhancement, which is not. It's also for image description." He is right and the
  plan was wrong — it scoped the copy to Enhance and pushed everything else to
  MPI-737. So: `MpiEnhancementSettings` → `MpiLlmSettings`, titled **Language
  Models**, structured one row PER JOB. Image descriptions ships now with its one
  honest option (ComfyUI) and says WHY it is the only one — `MODEL_REGISTRY` is six
  text-only models, so nothing hosted can look at an image. That needs no new
  plumbing, so MPI-737's scope is untouched: it still owns making the row a real
  choice. The agent is a third row later and the section takes it without being
  rearranged.
- **2026-09-12 round 2 — `[hidden]` IS INERT AGAINST A `display` DECLARATION, and
  a `.hidden` assertion will not catch it.** The first draft hid the model row with
  `row.hidden = true` on a `display: flex` element, so the label stayed on screen
  with no control under it — and the live probe passed, because it read the
  PROPERTY. Any group this section hides needs `[hidden] { display: none }`
  restated in CSS, and the check must be `getComputedStyle(...).display`.
- **2026-09-12 round 2 — the dropdown cost metas were TRUNCATING**, to "CLOUD W…"
  and "NO VRAM…". Those labels are the entire reason the control reads as a
  placement choice. RunPod already had the remedy (MPI-620); it is now
  `.mpi-dropdown--stacked`, named for the shape rather than for one consumer.
- **2026-09-12 — a pin the current backend cannot serve is NOT silently swapped.**
  The service passes the stored id straight through and `routes/llm.js` answers by
  name (`"DeepSeek V3.2 (Cloud only)" has no ollama variant.`). Swallowing it would
  turn an explicit pick into a quiet substitution, which is the exact defect this
  card deleted. The DROPDOWN shows `Default` in that state and leaves the stored
  pin alone, so switching back restores it.

## Verification

**Verify mode:** `user-ux`

Phase 1 alone is `auto` and must not ship alone. Phases 2 and 3 are surfaces only
Fabio can judge, and phase 3 cannot be judged at all on a machine where Ollama is
already installed and warm — the states worth testing are "not installed",
"installed but stopped" and "running without the model".

**Do not** set any recipe `status: 'validated'`, and do not render. Both are
Fabio's, and only after a Stage 2 render.
