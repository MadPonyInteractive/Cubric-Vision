# MPI-677 Checklist

Derived from `plan.md`'s steps, in Fabio's stated priority order. The A-D letters
in the card description are retired; `plan.md` carries the mapping note.

- [ ] Step 1a — the enhance service (`routes/llm.js`, `js/services/llmService.js`,
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
  - [ ] **The ComfyUI-encoder backend end to end** — written, not yet run: the
        verify needs the button (step 1b) and the GPU, which was leased by
        MPI-591 at the time
  - [x] **A live DeepInfra call** — Fabio supplied a key; `hasKey:true` →
        `defaultBackend:deepinfra` → a real cloud completion echoing
        `google/gemma-4-26B-A4B-it`, with Ollama up and deliberately unused
- [ ] Step 1b — the control (one button, `resolveRecipe()` locally,
      `Input_enhance_prompt` forced false, settings toggle removed)
- [ ] Step 1c — the overlay *(verify mode: `user-ux`)*
- [ ] Step 1d — Fabio's GPU measurement of the ComfyUI backend *(not a gate)*
- [ ] Step 2 — cut the cord (broker surface + `@cubric/connector` dependency)
- [ ] Step 3 — release the repos *(archive Cubric-Prompt on Fabio's explicit go)*
- [ ] Step 4 — the corpus, the skill split (MPI-593 owns it), the build/heal loop
- [ ] Step 5 — the agent that talks to the user *(gets its own plan when reached)*
