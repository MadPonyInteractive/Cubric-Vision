/**
 * Recipe registry — data, not code (a target model is an entry, not a branch).
 *
 * Adding support for a new target model = a new `*.recipe.js` file + one line
 * here. Never an enhancer code change.
 *
 * Ported from Cubric-Prompt `src/main/recipes/` (MPI-35 phase 4; the format is
 * settled in `docs/agent-corpus.md`). Two things changed in the port and
 * nothing else did:
 *
 * 1. **Zod is gone.** Cubric-Prompt validated every recipe with
 *    `RecipeSchema.parse()` at module load. Vision's data layer is deliberately
 *    dependency-free, so `validateRecipe()` below replaces it and
 *    `tests/recipe-registry.test.cjs` asserts it across the whole registry.
 *    **Validation therefore moved from module load to TEST time**: a malformed
 *    recipe shipped without running the tests now fails at use rather than at
 *    import. That is the stated cost of not adding a dependency.
 * 2. **Zod's three defaults are applied here** (`normalizeRecipe`). Four
 *    recipes omit `acceptsMedia`/`multiScene` and relied on the schema to fill
 *    them; a consumer reading `mode.acceptsMedia.length` would have crashed on
 *    a plain object literal.
 *
 * This module is free of browser/DOM/Events imports so it loads under both
 * `import` (browser) and `require` (`tests/*.test.cjs`), the same way
 * `js/data/modelConstants/resolveModelDeps.js` does.
 */
import { composeSystemPrompt, DEFAULT_STYLE } from './styles.js';
import { chroma } from './chroma.recipe.js';
import { krea2 } from './krea-2.recipe.js';
import { ltx23 } from './ltx-2.3.recipe.js';
import { wan22 } from './wan-2.2.recipe.js';
import { sdxl } from './sdxl.recipe.js';
import { seedance15 } from './seedance-1.5.recipe.js';
import { seedance20 } from './seedance-2.0.recipe.js';
import { kling30 } from './kling-3.0.recipe.js';
import { minimaxH3 } from './minimax-h3.recipe.js';
import { flux2 } from './flux-2.recipe.js';
import { pony } from './pony.recipe.js';
import { illustrious } from './illustrious.recipe.js';

/** Generation modes a recipe may declare. `r2v` is reference-to-video (MPI-26). */
export const RECIPE_MODES = ['t2v', 'i2v', 'r2v'];
export const OUTPUT_FORMATS = ['prose', 'keyword-list', 'structured-tags', 'timeline'];
export const NEGATIVE_HANDLING = ['none', 'inline-positive', 'separate-field'];
export const RECIPE_STATUSES = ['draft', 'validated'];
export const MEDIA_KINDS = ['image', 'audio', 'video'];
export const RECIPE_STYLES = ['cinematic', 'general', 'candid'];

/** The three defaults Zod used to fill in. Pure — returns a new object. */
function normalizeRecipe(recipe) {
    const modes = {};
    for (const [mode, payload] of Object.entries(recipe.modes)) {
        modes[mode] = {
            acceptsMedia: [],
            multiScene: false,
            ...payload,
        };
    }
    return { status: 'draft', ...recipe, modes };
}

/** Every known recipe. Add a new model by importing it and listing it here. */
export const RECIPE_REGISTRY = [
    chroma,
    flux2,
    krea2,
    ltx23,
    wan22,
    sdxl,
    seedance15,
    seedance20,
    kling30,
    minimaxH3,
    pony,
    illustrious,
].map(normalizeRecipe);

/**
 * Family-level keys other Cubric apps send, mapped to our exact `modelId`s
 * (MPI-20). Vision sends `model.enhanceRecipe ?? model.type` — `wan`, `ltx`,
 * `chroma`, `flux` — none of which match an exact id, so they were all silently
 * enhanced by whatever recipe sat at `RECIPE_REGISTRY[0]`. `wan` and `ltx` are
 * VIDEO models that were getting an IMAGE recipe.
 */
export const RECIPE_ALIASES = {
    // `flux` -> FLUX.2 Klein. Four Vision models carry `enhanceRecipe: 'flux'`
    // (klein-4b, boogu-edit-high, boogu-edit-balanced, qwen-edit) and ALL FOUR can
    // reach the enhancer: the Enhance button is offered on every op of every model.
    // (`capabilities.promptEnhance` does NOT gate it — that flag belongs to
    // ComfyUI's in-graph enhancer node. Checked 2026-08-05; do not re-derive it
    // the other way.)
    //
    // Pointed at `flux-2` regardless, because the other three are not asking for a
    // different recipe — they are asking for **no enhancement at all**. An edit op
    // wants an instruction, not a scene description (MPI-21, closed by Fabio
    // 2026-08-05). Sending them to `chroma` was never more correct than sending
    // them here; it was differently wrong. Meanwhile `klein-4b`'s generative ops —
    // t2i, i2i, control, detail — are real traffic that this alias serves
    // correctly.
    //
    // The real fix is the `operation` field, which is already sent and currently
    // discarded: gate on it and the edit ops never reach a recipe at all.
    flux: 'flux-2',
    krea2: 'krea-2',
    wan: 'wan-2.2',
    ltx: 'ltx-2.3',
    // `h3` -> MiniMax-H3. THE SAME DEFECT MPI-20 EXISTED TO FIX, recurring on a
    // model added after it: `minimax-h3` and `minimax-h3-ref2va` declare
    // `type: 'h3'` with no `enhanceRecipe`, `h3` matched nothing, and both fell
    // through to FALLBACK_RECIPE_ID. So two VIDEO models were being enhanced by
    // the `chroma` IMAGE recipe — and the whole three-mode H3 recipe (72/72
    // green, its own `r2v` mode) had never once been reachable from the caller it
    // was written for. Measured 2026-08-10 by resolving every model key through
    // `resolveRecipe`; do not assume a recipe is reachable because it exists.
    h3: 'minimax-h3',
    // `chroma` needs no alias — it matches a recipe id exactly.
};

/**
 * Substituted when a requested key resolves to nothing. Explicit — **not**
 * `RECIPE_REGISTRY[0]`: reordering the registry must not silently change what
 * every unmatched model enhances with (MPI-20).
 *
 * Chosen, not inherited: `chroma` is the general-purpose natural-language image
 * recipe and the only image recipe currently Stage 1 green, which makes it the
 * least-wrong destination for a model we know nothing about. `sdxl` would hand a
 * tag-style prompt to an unknown model; `krea-2` is tuned to one encoder.
 */
export const FALLBACK_RECIPE_ID = 'chroma';

/** Look up a recipe by its neutral model id. */
export function getRecipe(modelId) {
    return RECIPE_REGISTRY.find((r) => r.modelId === modelId);
}

/**
 * Look up a recipe by exact id **or** by a family alias — the resolution a
 * caller sending `enhanceRecipe ?? type` gets. Kept separate from `getRecipe` so
 * in-app callers (picker, tests) still see the exact id space.
 */
export function resolveRecipe(key) {
    const aliased = RECIPE_ALIASES[key];
    return getRecipe(key) ?? (aliased ? getRecipe(aliased) : undefined);
}

/** All recipes, for the target picker. */
export function listRecipes() {
    return RECIPE_REGISTRY;
}

/**
 * Resolve a recipe + mode (+ style) to its system prompt — the string that fills
 * the enhancer's system field. Returns `undefined` for an unknown model or a
 * mode the recipe does not support; the caller decides the fallback.
 *
 * `style` defaults to `general`: cinematic art direction forced onto every
 * prompt is the bug. A recipe that has not authored `styleVocabulary` is
 * unaffected whatever style is asked for.
 */
export function selectSystemPrompt(modelId, mode, style = DEFAULT_STYLE) {
    const modeRecipe = getRecipe(modelId)?.modes[mode];
    return modeRecipe && composeSystemPrompt(modeRecipe, style);
}

// ── Validation ────────────────────────────────────────────────────────────────

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isStringArray = (v) => Array.isArray(v) && v.every(isNonEmptyString);

function validateMode(recipe, mode, m, problems) {
    const at = `${recipe.modelId}.${mode}`;
    const fail = (msg) => problems.push(`${at}: ${msg}`);

    if (!RECIPE_MODES.includes(mode)) fail(`unknown mode key`);
    if (!OUTPUT_FORMATS.includes(m.outputFormat)) fail(`outputFormat ${m.outputFormat}`);
    if (!NEGATIVE_HANDLING.includes(m.negativeHandling)) fail(`negativeHandling ${m.negativeHandling}`);
    if (!isNonEmptyString(m.lengthNorm)) fail('lengthNorm must be a non-empty string');
    if (!isNonEmptyString(m.systemPrompt)) fail('systemPrompt must be a non-empty string');
    if (!isStringArray(m.structureOrder) || !m.structureOrder.length) fail('structureOrder must be a non-empty string array');
    if (!isStringArray(m.dos)) fail('dos must be a string array');
    if (!isStringArray(m.donts)) fail('donts must be a string array');
    if (!isStringArray(m.examplePrompts) || !m.examplePrompts.length) fail('examplePrompts must be a non-empty string array');
    if (!isStringArray(m.acceptsMedia) || m.acceptsMedia.some((k) => !MEDIA_KINDS.includes(k))) fail('acceptsMedia must be media kinds');
    if (typeof m.multiScene !== 'boolean') fail('multiScene must be a boolean');

    if (!m.vocabulary || typeof m.vocabulary !== 'object') {
        fail('vocabulary must be an object');
    } else {
        for (const [domain, terms] of Object.entries(m.vocabulary)) {
            if (!isStringArray(terms)) fail(`vocabulary.${domain} must be a string array`);
        }
    }

    if (m.styleVocabulary !== undefined) {
        for (const [style, domains] of Object.entries(m.styleVocabulary)) {
            if (!RECIPE_STYLES.includes(style)) fail(`styleVocabulary.${style} is not a style`);
            for (const [domain, terms] of Object.entries(domains ?? {})) {
                if (!isStringArray(terms)) fail(`styleVocabulary.${style}.${domain} must be a string array`);
            }
        }
    }

    if (m.wordBudget !== undefined) {
        const { min, max } = m.wordBudget;
        const ok = (n) => Number.isInteger(n) && n > 0;
        if (!ok(min) || !ok(max)) fail('wordBudget min/max must be positive integers');
        else if (min >= max) fail(`wordBudget min ${min} >= max ${max}`);
    }

    if (m.forbiddenPatterns !== undefined) {
        if (!Array.isArray(m.forbiddenPatterns)) {
            fail('forbiddenPatterns must be an array');
        } else {
            for (const entry of m.forbiddenPatterns) {
                if (!isNonEmptyString(entry?.pattern) || !isNonEmptyString(entry?.why)) {
                    fail('forbiddenPatterns entries need a pattern and a why');
                    continue;
                }
                try {
                    new RegExp(entry.pattern);
                } catch (err) {
                    fail(`forbiddenPatterns /${entry.pattern}/ does not compile: ${err.message}`);
                }
            }
        }
    }
}

/**
 * What `RecipeSchema.parse()` used to do, as a plain shape check. Returns the
 * list of problems — empty means valid. It never throws and never mutates, so a
 * caller may report every fault at once rather than the first.
 */
export function validateRecipe(recipe) {
    const problems = [];
    if (!recipe || typeof recipe !== 'object') return ['recipe is not an object'];

    for (const field of ['modelId', 'family', 'displayName']) {
        if (!isNonEmptyString(recipe[field])) problems.push(`${recipe.modelId ?? '?'}: ${field} must be a non-empty string`);
    }
    if (!RECIPE_STATUSES.includes(recipe.status)) problems.push(`${recipe.modelId}: status ${recipe.status}`);
    if (recipe.notes !== undefined && !isNonEmptyString(recipe.notes)) problems.push(`${recipe.modelId}: notes must be a non-empty string when present`);

    const modes = recipe.modes;
    if (!modes || typeof modes !== 'object' || !Object.keys(modes).length) {
        problems.push(`${recipe.modelId}: a recipe must declare at least one mode`);
        return problems;
    }
    for (const [mode, payload] of Object.entries(modes)) validateMode(recipe, mode, payload, problems);
    return problems;
}
