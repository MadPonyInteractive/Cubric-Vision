// js/services/llmService.js

/**
 * llmService — Vision's own prompt enhancement (MPI-677 step 1a).
 *
 * THIS IS WHAT RETIRES CUBRIC PROMPT. The Enhance button used to call out over
 * the broker to a sibling app; the recipe layer landed here in MPI-35, so the
 * whole round trip collapses into: resolve the recipe → fill a system prompt →
 * run an LLM → hand back the text. `js/shell/connectorOps.js` was the thing this
 * replaced; step 1b repointed the button and step 2 DELETED it, along with the
 * broker boot, the connector responder and the `@cubric/connector` dependency.
 *
 * THREE BACKENDS, AND THE CHOICE IS THE USER'S (MPI-728). Fabio, 2026-09-12:
 * the dropdown is about WHERE THE WORK RUNS, not which model is smartest — a
 * user generating on a RunPod pod enhances locally because the card is idle, and
 * a user generating locally pushes enhancement to the cloud to keep VRAM free.
 * `chooseBackend` honours that pick, and with no pick the answer is `comfy`.
 *
 *   - `deepinfra` — needs a stored key. Off-GPU, no queue wait, no VRAM at all.
 *   - `comfy` — THE DEFAULT. Local, through the engine that is already running. It runs the
 *     shipped `qwen3vl_4b_prompt_enhancer.json` through the existing
 *     `promptEnhance` operation. OFFERED ON EVERY MODEL: the graph carries its
 *     own `CLIPLoader` (node 9, `qwen3vl_4b_abliterated_fp8_scaled`), so it
 *     never borrows the generation model's encoder and never touched it —
 *     proven 2026-09-12 by running the graph on an idle bench with no
 *     generation model loaded at all. Its only gate is whether the
 *     `qwen3vl-abliterated-clip` dep is installed.
 *   - `ollama` — local, in a second runtime with its own VRAM. The only backend
 *     that carries an abliterated build.
 *
 * The cloud key lives in the main process and is resolved by `routes/llm.js`.
 * Nothing here ever sees it.
 */

import { resolveRecipe, FALLBACK_RECIPE_ID, getRecipe } from '../data/recipes/registry.js';
import { composeSystemPrompt } from '../data/recipes/styles.js';
import { clientLogger } from './clientLogger.js';

/** The mode every image recipe declares, and the base mode of the video ones. */
const DEFAULT_MODE = 't2v';

/** The registered ComfyUI operation that runs `qwen3vl_4b_prompt_enhancer.json`. */
export const COMFY_ENHANCE_OP = 'promptEnhance';

/** Per-viewer backend override, when the user has pinned one. */
const BACKEND_PREF_KEY = 'cubric.llm.backend';

/** Per-viewer enhancer-model choice, under whichever backend is running it. */
const ENHANCER_MODEL_PREF_KEY = 'cubric.llm.enhancerModel';

/**
 * MPI-35 phase 2's overrides on the shipped enhancer graph.
 *
 * The graph was authored for Character Sheet, and three of its baked values are
 * wrong for a general recipe. NONE OF THE THREE WORST DEFECTS ACTUALLY REACHES
 * THE FOUR ELIGIBLE MODELS TODAY — the newline strip welds a negative block into
 * the positive one but `krea-2` and `flux-2` are not `separate-field` recipes;
 * the `no ...` clause scrub deletes `minimax-h3`'s `overall_soundscape` and the
 * 512-token cap truncates only `minimax-h3`, and that model has no in-graph
 * encoder at all. They are set anyway so the backend does not become wrong the
 * moment a fifth model qualifies.
 *
 *   `Replace Text.replace`             '' -> '\n' makes node 1 an identity pass.
 *                                      Its baked find/replace strips EVERY
 *                                      newline from the model's output.
 *   `Input_Scrub_Negation.regex_pattern` `(?!)` can never match — a no-op, which
 *                                      is safer than deleting a node Character
 *                                      Sheet still needs.
 *   `Input_Tidy.regex_pattern`         narrowed to trailing whitespace; the
 *                                      baked `[\s,.]+$` also eats a closing full
 *                                      stop, right for a spliced phrase and
 *                                      wrong for prose.
 *   `Input_Text_Gen.max_length`        512 tokens (~345 words) truncates a
 *                                      long-budget recipe.
 */
export const COMFY_ENHANCE_OVERRIDES = Object.freeze({
    'Replace Text.replace': '\n',
    'Input_Scrub_Negation.regex_pattern': '(?!)',
    'Input_Tidy.regex_pattern': '\\s+$',
    'Input_Text_Gen.max_length': 2048,
});

/**
 * Build the `injectionParams` for one ComfyUI enhance.
 *
 * `Input_System_Prompt` is ChatML-wrapped because the graph concatenates it with
 * the user text and a trailing `<|im_end|>\n<|im_start|>assistant` — the baked
 * value ends on `<|im_start|>user` for exactly that reason, so a bare system
 * prompt would arrive with no role markers at all.
 *
 * KNOWN DIVERGENCE, recorded rather than silently "fixed": the shipped graph
 * leaves `use_default_template: True` on `TextGenerate` and hand-rolls its ChatML
 * anyway, so the recipe lands inside the default template's user turn. The Stage
 * 1 harness measures the opposite (template off, ChatML hand-rolled — see
 * `services/llmEngines.mjs`). Both are proven, on different instruments: the
 * graph's shape returned a correct French translation from an injected recipe on
 * 2026-08-19, and the harness's shape produced every recorded green. So a
 * `comfy`-backend enhance is NOT the configuration a recipe went green on, and
 * step 1d's measurement is where that gets settled — do not flip the widget on a
 * hunch.
 */
export function buildComfyInjectionParams(systemPrompt) {
    return {
        Input_System_Prompt: `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user`,
        ...COMFY_ENHANCE_OVERRIDES,
    };
}

/** With no pick, the engine the app already runs (Fabio, 2026-09-12). */
const DEFAULT_BACKEND = 'comfy';

/**
 * Which backend runs this enhance — the user's pick, or `comfy`.
 *
 * IT NO LONGER READS THE MODEL CARD AT ALL (MPI-728). Three rules that did have
 * gone, deliberately:
 *
 * 1. **The `-nsfw` route.** It derived "uncensored" from an id suffix, and Fabio
 *    listed what is actually uncensored in Vision — every SDXL model, both
 *    Chroma models, Wan 2.2, and anything at all with a downloaded LoRA. Only
 *    two carry the suffix, so the rule fired on the wrong models and quietly
 *    sent the rest to a hosted provider. A LoRA makes any model uncensored, so
 *    the property was never a fact about the card; the disposition belongs to
 *    the person, and the picker is where they state it.
 * 2. **The silent `comfy -> ollama` downgrade.** It existed because `comfy` used
 *    to mean the generation model's own encoder. The standalone graph loads its
 *    own CLIP and runs anywhere (proven 2026-09-12), so an explicit pick is now
 *    honoured — and Ollama may not even be installed to downgrade to.
 * 3. **Automatic.** With no pick it chose the cloud when a key was stored and
 *    Ollama otherwise. Fabio removed that entry (2026-09-12) to match the RunPod
 *    section, which has none, and made ComfyUI the default — so neither a stored
 *    key nor a running Ollama moves the answer any more.
 *
 * @param {object}  a
 * @param {string} [a.override]  the user's choice ('deepinfra'|'ollama'|'comfy'); anything else is no choice
 */
export function chooseBackend({ override } = {}) {
    return override === 'comfy' || override === 'deepinfra' || override === 'ollama' ? override : DEFAULT_BACKEND;
}

/** The user's backend: ComfyUI until they pick another. */
export function backendPreference() {
    try {
        return chooseBackend({ override: localStorage.getItem(BACKEND_PREF_KEY) });
    } catch {
        return DEFAULT_BACKEND;   // private window / storage disabled
    }
}

/** Pin a backend, or pass a falsy value to go back to the default. */
export function setBackendPreference(backend) {
    try {
        if (backend) localStorage.setItem(BACKEND_PREF_KEY, backend);
        else localStorage.removeItem(BACKEND_PREF_KEY);
    } catch { /* storage disabled — the choice just does not persist */ }
}

/**
 * The user's enhancer LLM, or undefined for the registry default.
 *
 * THIS IS WHAT REPLACED `chooseEngineModelId()` — an inference became a
 * preference. It is NOT validated against the chosen backend here: coverage is
 * asymmetric on purpose (abliterated builds are local-only, frontier models
 * cloud-only), and `routes/llm.js` already answers a mismatch by NAME
 * (`"<model>" has no <backend> variant.`). Swallowing it here would turn the
 * user's explicit pick into a silent fall-back to something else — the exact
 * defect this card deleted.
 */
export function enhancerModelPreference() {
    try {
        return localStorage.getItem(ENHANCER_MODEL_PREF_KEY) || undefined;
    } catch {
        return undefined;   // private window / storage disabled
    }
}

/** Pin an enhancer model by registry id, or pass a falsy value for the default. */
export function setEnhancerModelPreference(id) {
    try {
        if (id) localStorage.setItem(ENHANCER_MODEL_PREF_KEY, id);
        else localStorage.removeItem(ENHANCER_MODEL_PREF_KEY);
    } catch { /* storage disabled — the choice just does not persist */ }
}

/**
 * Resolve a caller's recipe key exactly as the broker responder used to: exact
 * id, then family alias, then the pinned fallback.
 *
 * The fallback is DESIGNED TO ANSWER, which is why it hides a miss so well — two
 * MiniMax-H3 VIDEO cards were enhanced by the `chroma` IMAGE recipe for a week
 * and nothing failed loudly. `fellBack` is the honest signal; surface it.
 */
export function resolveRecipeId(key) {
    const matched = key ? resolveRecipe(key) : undefined;
    return matched
        ? { recipeId: matched.modelId, fellBack: false }
        : { recipeId: FALLBACK_RECIPE_ID, fellBack: true };
}

/**
 * The mode to run. `t2v` unless the caller names one the recipe declares; a
 * recipe that has no `t2v` (none today, but the union is open) falls to its
 * first declared mode rather than failing with no system prompt.
 */
export function resolveMode(recipeId, asked) {
    const modes = getRecipe(recipeId)?.modes || {};
    if (asked && modes[asked]) return asked;
    if (modes[DEFAULT_MODE]) return DEFAULT_MODE;
    return Object.keys(modes)[0];
}

/**
 * Split a `separate-field` recipe's labelled reply into its two channels.
 *
 * THE FOUR `separate-field` RECIPES DO NOT AGREE ON A FORMAT, which is why this
 * anchors on the NEGATIVE label alone and treats everything before it as the
 * positive half. Measured across the registry rather than assumed from `sdxl`:
 *
 *   `sdxl`      `POSITIVE PROMPT: …\nNEGATIVE PROMPT: …` — both labelled, and its
 *               system prompt states the contract literally ("your reply starts
 *               with POSITIVE PROMPT: and ends at the end of the NEGATIVE PROMPT
 *               line").
 *   `kling-3.0` unlabelled prose, then a trailing `Negative Prompt:` block — a
 *               DIFFERENT label in a DIFFERENT case, and no positive label at
 *               all. A splitter written to `sdxl`'s shape reads this as prose and
 *               welds the negative into the positive, silently.
 *   `pony`,     declare the field and deliberately emit NO negative block: the
 *   `illustrious` author's baseline is a constant ladder, and a constant needs no
 *               LLM to write it. They parse to `null` here and keep their raw
 *               text, which is correct, not a miss.
 *
 * NOTHING ANYWHERE SPLIT IT UNTIL NOW and the whole blob landed in the positive
 * field. That was not a Vision bug: Cubric-Prompt's broker responder had no
 * splitter either (grepped across `src/main/`), so it returned the labelled text
 * as `prompt` and left `negativePrompt` undefined — identical behaviour on both
 * sides of the retirement, which is why step 1b recorded it as PARITY, not a
 * regression, and left the fix here where the user can SEE which channel each
 * half lands in before approving it. `pony.recipe.js:216-227` reached the same
 * conclusion from the recipe side while deciding to emit no negative block at all.
 *
 * Returns `null` when the reply carries no usable positive half — a recipe that
 * ignored its own format, or a truncated answer. The caller then keeps the raw
 * text, so a parse miss degrades to exactly what shipped rather than to an empty
 * box.
 *
 * @param {string} text
 * @returns {{positive: string, negative: string}|null}
 */
export function splitLabelledPrompt(text) {
    // The NEGATIVE label is the only thing all the emitting recipes share, so it is
    // the anchor; the positive label is stripped if it happens to be there. Lazy
    // match, so a recipe that names the block twice cuts at the FIRST one.
    const m = /^([\s\S]*?)[\r\n]*[ \t]*NEGATIVE[ \t]+PROMPT[ \t]*:[ \t]*([\s\S]*)$/i
        .exec(String(text || ''));
    if (!m) return null;
    const positive = m[1].replace(/^[\s]*POSITIVE[ \t]+PROMPT[ \t]*:[ \t]*/i, '').trim();
    return positive ? { positive, negative: m[2].trim() } : null;
}

/**
 * The enhancer LLM catalogue, for the settings picker (MPI-728).
 *
 * `MODEL_REGISTRY` lives in `services/llmEngines.mjs` — server-side ESM the
 * renderer cannot import — so it arrives over `/llm/models`. Each entry reports
 * per-backend coverage (`ollama` / `deepinfra`) rather than a single "available",
 * because coverage is asymmetric on purpose and the picker filters by the backend
 * the user chose. An unreachable server answers `[]`, which the picker renders as
 * "the default" rather than as an error — nothing is broken, there is simply
 * nothing to choose between yet.
 */
export async function enhancerModels() {
    try {
        const res = await fetch('/llm/models');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        return Array.isArray(body?.models) ? body.models : [];
    } catch {
        return [];
    }
}

/** One completion through the server (DeepInfra or Ollama). */
async function runServerBackend({ prompt, system, backend, modelId }) {
    const res = await fetch('/llm/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system, backend, modelId }),
    });
    return res.json();
}

/**
 * ONE COMPLETION THROUGH COMFYUI — and the ONLY dispatch to that graph in the app.
 *
 * Every ComfyUI enhance goes through here: the prompt box's control, Character Sheet's
 * Enhance button and Music Maker's automatic pre-Generate rewrite. Before MPI-677 step
 * 1b the flows had their own copy of this call in `MpiBaseFlow._runEnhance`, which is
 * how the seed rule and the `onText`-not-`onComplete` rule came to be written twice.
 * `commandRegistry`'s own comment has called the `promptEnhance` op reusable since
 * MPI-504; this is the single route that makes it so.
 *
 * `system` is OPTIONAL, and its absence is meaningful rather than a mistake: Character
 * Sheet's recipe is baked into the graph's `Input_System_Prompt` node, so a caller with
 * nothing to say leaves the baked value standing.
 *
 * WHY THE FLOWS STAY ON THIS BACKEND rather than inheriting the cloud default: the
 * graph is not just an LLM call, it is a PIPELINE — `Replace Text` strips newlines,
 * `Input_Scrub_Negation` deletes "no ..." clauses, `Input_Tidy` eats the trailing full
 * stop because a character phrase is spliced into the middle of a longer sentence. Both
 * flows were tuned on GPU runs against that chain. Routing them to DeepInfra would drop
 * three post-processing nodes and change the instrument without measuring it, which is
 * the trap this repo documents. A flow that wants the cloud opts in by asking for it,
 * after someone has measured the difference.
 *
 * @param {object}  a
 * @param {string}  a.prompt              the text to rewrite
 * @param {string} [a.system]             a system prompt to inject; omit to keep the graph's
 * @param {object} [a.injectionParams]    extra params by node title (the caller's recipe knobs)
 * @param {string} [a.modelId]            a model to pin the job to; null lets the queue pick
 * @returns {Promise<{ok:boolean, text?:string, backend?:string, model?:string, error?:string}>}
 *          Never rejects — an error and a cancel both resolve `{ ok: false }`.
 */
export async function runComfyEnhance({ prompt, system, injectionParams, modelId = null } = {}) {
    const { getCommand } = await import('../data/commandRegistry.js');
    // The op is a separate registration from any flow's own; a build shipped without it
    // would otherwise fail deep inside the queue.
    if (!getCommand(COMFY_ENHANCE_OP)) {
        return { ok: false, error: 'The prompt enhancer is not available in this build.' };
    }
    const { enqueueGeneration } = await import('./generationService.js');
    return new Promise((resolve) => {
        enqueueGeneration(
            {
                operation: COMFY_ENHANCE_OP,
                model: { id: modelId, mediaType: 'image' },
                positive: prompt,
                negative: '',
                injectionParams: {
                    ...(system ? { Input_System_Prompt: system } : {}),
                    ...(injectionParams || {}),
                    // Driven, never a user field, and never stored: a fixed seed returns
                    // the same phrase on every press and the loop is Enhance -> edit ->
                    // Enhance. Spread LAST so no caller can reach it.
                    Input_Seed: Math.floor(Math.random() * 2 ** 31),
                },
            },
            {
                // A text op never fires onComplete — GenerationCallbacks.onText.
                onText: (text) => resolve({
                    ok: true,
                    text: String(text || '').trim(),
                    backend: 'comfy',
                    model: 'qwen3vl_4b_abliterated',
                }),
                onError: (err) => resolve({ ok: false, error: (err && err.message) || 'Enhance failed.' }),
                // `cancelled` so a caller can tell a user's own Stop from a failure and
                // stay quiet about it. The flows were silent on cancel before this call
                // was shared, and a toast for something you just pressed Stop on is noise.
                onCancel: () => resolve({ ok: false, cancelled: true, error: 'Enhance cancelled.' }),
            },
            { scope: 'gallery' },
        );
    });
}

/**
 * Enhance one prompt.
 *
 * @param {object}  a
 * @param {string}  a.prompt        the user's short prompt
 * @param {object}  a.model         the model card being generated with
 * @param {string} [a.recipeKey]    defaults to `model.enhanceRecipe ?? model.type`
 * @param {string} [a.mode]         recipe mode; defaults to `t2v`
 * @param {string} [a.backend]      explicit override; defaults to the preference, then ComfyUI
 * @returns {Promise<{ok:boolean, text?:string, negativeText?:string, backend?:string,
 *                    model?:string, recipeId?:string, fellBack?:boolean, note?:string,
 *                    error?:string}>}
 *          `negativeText` is present ONLY for a `separate-field` recipe whose reply
 *          parsed. `text` is then the positive half alone — the caller must not
 *          re-split it.
 */
export async function enhance({ prompt, model, recipeKey, mode, backend } = {}) {
    const idea = String(prompt || '').trim();
    if (!idea) return { ok: false, error: 'Write a prompt first, then Enhance.' };

    const { recipeId, fellBack } = resolveRecipeId(recipeKey ?? model?.enhanceRecipe ?? model?.type);
    const recipe = getRecipe(recipeId);
    const resolvedMode = resolveMode(recipeId, mode);
    const modeRecipe = recipe?.modes?.[resolvedMode];
    if (!modeRecipe) {
        return { ok: false, error: `No enhancer recipe for "${recipeId}" (mode "${resolvedMode}").` };
    }
    // `selectSystemPrompt` would re-look-up the same recipe; compose from the
    // mode we already resolved so an i2v/r2v caller cannot silently get t2v.
    // Style defaults to `general` — v1.0 ships one general recipe per model and
    // the register axis is v1.1 (MPI-19/MPI-24); a recipe without
    // `styleVocabulary` is byte-identical whatever style is asked for.
    const system = composeSystemPrompt(modeRecipe);

    const chosen = chooseBackend({ override: backend ?? backendPreference() });

    const result = chosen === 'comfy'
        ? await runComfyEnhance({ prompt: idea, injectionParams: buildComfyInjectionParams(system) })
        : await runServerBackend({
            prompt: idea,
            system,
            backend: chosen,
            modelId: enhancerModelPreference(),
        });

    if (!result.ok) {
        clientLogger.warn('prompt', `[llmService] enhance failed on ${chosen}: ${result.error}`);
        return result;
    }
    // Only a recipe that DECLARES two channels gets its reply split. A prose recipe
    // that happens to write the words "negative prompt" is not offering a second
    // field, and cutting its text there would silently delete half the prompt.
    const split = modeRecipe.negativeHandling === 'separate-field'
        ? splitLabelledPrompt(result.text)
        : null;

    return {
        ...result,
        ...(split ? { text: split.positive, negativeText: split.negative } : {}),
        recipeId,
        fellBack,
        // Honest signal, surfaced verbatim: the requested target had no recipe
        // and a default ran. Not an error — the user pressed a button that exists.
        note: fellBack
            ? `No enhancer recipe for "${recipeKey ?? model?.enhanceRecipe ?? model?.type ?? '(none)'}" — used "${recipeId}".`
            : undefined,
    };
}
