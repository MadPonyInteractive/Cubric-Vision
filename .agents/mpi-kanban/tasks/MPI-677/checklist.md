# MPI-677 Checklist

Derived from `plan.md`'s steps, in Fabio's stated priority order. The A-D letters
in the card description are retired; `plan.md` carries the mapping note.

- [x] Step 1a — the enhance service (`routes/llm.js`, `js/services/llmService.js`,
      the DeepInfra key slot, the ComfyUI-encoder backend, uncensored routing)
  - [x] `routes/llm.js` + `js/services/llmService.js` — DeepInfra default, Ollama
        fallback. 907/907 `npm test`, lint clean, and a **live** one-shot call
        echoing the backend and model that answered (`validation.md`)
  - [x] DeepInfra key slot in `main/secretsStore.js` — its own set/has/get/clear,
        its own fork-bridge message pair, never the RunPod slot; a test records
        the IPC channels and proves no renderer-readable get channel exists
  - [x] MPI-35 phase 2's overrides on the enhancer graph, and a test asserting
        every injection key addresses a real node title (`Replace Text.replace`
        among them)
  - [x] Uncensored routing — an NSFW card can never fall through to DeepInfra;
        asserted four ways rather than left to a default
  - [x] **The ComfyUI-encoder backend end to end — RUN 2026-09-10.** Krea 2, backend
        pinned `comfy`, 34 s, honest state `qwen3vl_4b_abliterated`, output in the
        `krea-2` recipe's prose shape. Re-run with `fetch` wrapped: ZERO
        `/llm/enhance`, only ComfyUI. The first attempt died on an engine restart
        another instance delegated — see validation.md
  - [x] **A live DeepInfra call** — Fabio supplied a key; `hasKey:true` →
        `defaultBackend:deepinfra` → a real cloud completion echoing
        `google/gemma-4-26B-A4B-it`, with Ollama up and deliberately unused
- [x] Step 1b — the control (one button, `resolveRecipe()` locally,
      `Input_enhance_prompt` forced false, settings toggle removed)
  - [x] The broker call is gone — `llmService.enhance()` replaces
        `connectorOps.enhancePrompt()`; no capability probe, no 10×3 s poll. Proven in
        the running app: three enhances → three `POST /llm/enhance`, zero
        `/connector/enhance` and zero `/connector/capabilities` in the network log
  - [x] One button, every model, every workflow, NO per-model branch — live on the
        project's SDXL card, `krea2` (`enhanceRecipe`) and `chroma-flash` (`type`), all
        three resolving EXACTLY (no `note`, so nothing fell back)
  - [x] `Input_enhance_prompt` forced false on all four graphs — they already bake
        `false`; deleting the only injector is what forces it. Both halves asserted
  - [x] The settings-panel toggle removed — gone from `PROMPT_BOX_CONTROLS`, the
        visibility gate, four `components` lists, `promptControlDefaults` and the reuse
        restore list
  - [x] The two Flow-internal enhance buttons folded in — ONE dispatch
        (`runComfyEnhance`), not one backend; `op: 'promptEnhance'` is gone from every
        flow declaration. See validation.md for why the backend deliberately did not move
  - [x] Hidden on edit and inpaint — live: `qwenEdit`/`kleinEdit`/`inpaint` mount zero
        buttons, `t2i`/`i2i`/`control` mount one
  - [x] `capabilities.promptEnhance` JSDoc rewritten to ComfyUI-backend eligibility; a
        test records that it drives no UI
  - [x] **Character Sheet + Music Maker RUN end to end — 2026-09-10.** Character Sheet
        13 s to a proper character phrase; Music Maker's `auto` enhance completed on the
        engine with its three-marker output (`[MOOD]`/`[VOCAL]`/`[ARRANGEMENT]`) and was
        cancelled before the music graph — no song rendered, no card written
- [ ] Step 1c — the overlay *(verify mode: `user-ux` — it ends with Fabio, not a green test)*
  - [x] Short prompt above, Enhance, editable enhanced text below, OK / Cancel; the
        box keeps only the short prompt (`MpiEnhanceDialog`, a new Compound). The
        iteration loop is structural: Enhance always reads the UPPER box, so nothing
        in the overlay can feed an enhancement back into the enhancer
  - [x] The short prompt is stored beside the enhanced one, and **staleness is
        detected, never announced** — `_enhanced = { source, positive }`, re-checked
        on every edit; the control drops to un-enhanced on any difference
  - [x] The lower box mirrors the model's fields — `splitLabelledPrompt()` cuts a
        `separate-field` recipe's blob and the negative half gets its own box, then
        its own channel. **Proven live on three shapes** (validation.md): `sdxl`
        labelled, `kling-3.0` unlabelled-with-trailing-label, `chroma` left uncut
  - [x] `Reuse` restores both texts and the enhanced state — `sourcePrompt` carried
        `getRunPayload` → sidecar → `buildPromptReusePayload` → `injectPrompts`
  - [x] An empty lower box on OK means "not enhanced, run my words raw"
  - [x] Driven live in the running app on 2026-09-10, plus the operation gate re-checked
        through the overlay change. The iteration loop is proven AT THE WIRE: with a full
        enhancement in the lower box, a third Enhance press sent the SHORT prompt.
        **Reuse was driven from `buildPromptReusePayload()` into `injectPrompts()` — the
        whole chain except the sidecar write/read, which needs a real generation and a
        reload. That leg is unit-tested and source-asserted, not driven**
  - [ ] **Fabio's user-ux pass — the gate, and the only thing left on step 1c.**
        Everything under the UI is proven; what is owed is a person looking at it.
        **UNDERWAY 2026-09-11, two defects found and fixed** (validation.md):
        provenance was dropped on reopen, taking the fallback warning with it
        (`4f493f4f`); the toast on OK is gone and the feedback moved into the wait
        as a spinner over the enhanced box (`238d3081`). **Still owed:**
        `OK → reopen → Cancel → reopen`, the separate-field negative channel (needs
        an SDXL / Pony / Illustrious / Kling card), the operation gate, and Reuse
        **after an app reload** — the one leg nothing has ever driven
- [ ] Step 1d — Fabio's GPU measurement of the ComfyUI backend *(not a gate)*
- [x] Step 2 — cut the cord (broker surface + `@cubric/connector` dependency)
  - [x] Deleted `services/brokerBoot.js`, `services/connectorResponder.js`,
        `js/shell/connectorOps.js`, `POST /connector/enhance` and the
        `promptEnhance` field on `/connector/capabilities`. The `MpiPromptBox`
        wand block the plan also named was already gone — step 1b removed it
  - [x] Removed the `@cubric/connector` **broker-SDK** dependency from
        `package.json` + `package-lock.json`, its exclusion rule in
        `scripts/build-portable.mjs`, and its boot in `server.js`
  - [x] **The four KEEP routes still answer**, verified live on a booted server:
        `/connector/generate` and `/connector/open-project` return their own
        `BAD_REQUEST` (the route ran and validated its body),
        `/connector/jobs/:id/result` returns `{received:false}`,
        `/connector/jobs/stream` returns `event: connected`.
        `/connector/enhance` is **404**
  - [x] `models.js` JSDoc reworded — `type` / `enhanceRecipe` **keep their values**
        and now name the local `resolveRecipe()` index, not a sibling app
  - [x] Enhance still works after the cut: live `/llm/enhance` on the booted
        server, `ok:true`, honest state `deepinfra / google/gemma-4-26B-A4B-it`
  - [ ] *Not a gate, recorded in validation.md:*
        `resources/cubric/connector-manifest.json` still advertises four broker
        capabilities nothing serves. Left in place because the portable build
        reads and hashes it (`assertConnectorManifest`) — step 5 owns its fate
- [ ] Step 3 — release the repos *(archive Cubric-Prompt on Fabio's explicit go)*
- [ ] Step 4 — the corpus, the skill split (MPI-593 owns it), the build/heal loop
- [ ] Step 5 — the agent that talks to the user *(gets its own plan when reached)*
