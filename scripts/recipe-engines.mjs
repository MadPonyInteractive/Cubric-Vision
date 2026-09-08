/**
 * Compatibility shim — the enhancer backends MOVED to `services/llmEngines.mjs`
 * (MPI-677 step 1a) and this file is now a pure re-export.
 *
 * WHY THE MOVE, and why it is not a refactor for its own sake: the app itself
 * now needs these clients at runtime (`routes/llm.js` serves the in-app enhance
 * that replaces the broker call to Cubric Prompt), and **`scripts/` is excluded
 * from the portable build** — `scripts/build-portable.mjs:135` lists it in the
 * skip set. A route importing from here would work in dev and be absent in the
 * shipped app.
 *
 * NOTHING WAS EDITED IN THE MOVE. Every constant the Stage 1 sweeps were
 * measured on — Ollama's `num_ctx: 8192` and `think: false`, the `keep_alive: 0`
 * release, ComfyUI's four-node graph, its `SAMPLING` block and its hand-rolled
 * ChatML — travelled verbatim. Those numbers are the instrument, and changing
 * one silently invalidates every green recorded in `docs/recipes/research/`.
 * They are just as load-bearing at their new path.
 *
 * The harness imports this path; new code should import
 * `services/llmEngines.mjs` directly.
 */
export * from '../services/llmEngines.mjs';
