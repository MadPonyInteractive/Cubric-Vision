'use strict';

// Contract tests for the ported prompt-recipe registry (Cubric-Prompt MPI-35).
// Run: node tests/recipe-registry.test.cjs
// No framework — matches the other tests/*.test.cjs in this repo.
//
// This file carries TWO jobs that used to live in two places:
//
//  1. **What Zod used to do.** Cubric-Prompt validated every recipe with
//     `RecipeSchema.parse()` at module load. Vision's data layer is
//     dependency-free, so validation moved here — to TEST time. A malformed
//     recipe shipped without running these tests fails at use, not at import.
//     That is the stated cost of not adding Zod (`docs/agent-corpus.md`).
//
//  2. **The resolution audit.** "The recipe exists" is not the claim "the
//     caller can reach it." MPI-20 closed that hole for `wan`/`ltx` and it
//     reopened the moment a new `type` shipped: `h3` matched nothing, so two
//     VIDEO models were enhanced by the `chroma` IMAGE recipe and nothing
//     failed loudly — the fallback is designed to answer. So every key
//     `models.js` actually sends is resolved here, read from `models.js`
//     itself rather than from a hardcoded list, so a key added there shows up
//     without anyone remembering to update this test.

const assert = require('assert');
const {
    RECIPE_REGISTRY,
    RECIPE_ALIASES,
    FALLBACK_RECIPE_ID,
    RECIPE_MODES,
    getRecipe,
    resolveRecipe,
    listRecipes,
    selectSystemPrompt,
    validateRecipe,
} = require('../js/data/recipes/registry.js');
const { renderRecipeBrief, renderAllBriefs } = require('../js/data/recipes/brief.js');
const { composeSystemPrompt, DEFAULT_STYLE } = require('../js/data/recipes/styles.js');
const { MODELS } = require('../js/data/modelConstants/models.js');

// ── Tests ────────────────────────────────────────────────────────────────────

function testEveryRecipeValidates() {
    const problems = RECIPE_REGISTRY.flatMap(validateRecipe);
    assert.deepStrictEqual(problems, [], `invalid recipes:\n  ${problems.join('\n  ')}`);
}

function testValidatorActuallyBites() {
    // A validator that passes everything proves nothing. Each mutation below is
    // a real defect the Zod schema used to catch at import.
    const good = RECIPE_REGISTRY[0];
    const clone = () => JSON.parse(JSON.stringify(good));

    const noModes = clone();
    noModes.modes = {};
    assert.ok(validateRecipe(noModes).length, 'empty modes must fail');

    const badStatus = clone();
    badStatus.status = 'validated-ish';
    assert.ok(validateRecipe(badStatus).length, 'unknown status must fail');

    const badMode = clone();
    badMode.modes.t2i = badMode.modes[Object.keys(badMode.modes)[0]];
    assert.ok(validateRecipe(badMode).length, 'unknown mode key must fail');

    const badBudget = clone();
    badBudget.modes[Object.keys(badBudget.modes)[0]].wordBudget = { min: 90, max: 30 };
    assert.ok(validateRecipe(badBudget).length, 'min >= max must fail');

    const badRegex = clone();
    badRegex.modes[Object.keys(badRegex.modes)[0]].forbiddenPatterns = [
        { pattern: '([unclosed', why: 'nonsense' },
    ];
    assert.ok(validateRecipe(badRegex).length, 'an uncompilable forbiddenPattern must fail');

    const emptyPrompt = clone();
    emptyPrompt.modes[Object.keys(emptyPrompt.modes)[0]].systemPrompt = '';
    assert.ok(validateRecipe(emptyPrompt).length, 'an empty systemPrompt must fail');

    assert.deepStrictEqual(validateRecipe(good), [], 'the unmutated recipe must still pass');
}

function testRegistryIntegrity() {
    assert.strictEqual(RECIPE_REGISTRY.length, 12, 'the v1.0 recipe set is 12 models');
    assert.strictEqual(listRecipes(), RECIPE_REGISTRY);

    const ids = RECIPE_REGISTRY.map((r) => r.modelId);
    assert.strictEqual(new Set(ids).size, ids.length, 'recipe ids must be unique');

    for (const r of RECIPE_REGISTRY) {
        assert.strictEqual(getRecipe(r.modelId), r);
        for (const mode of Object.keys(r.modes)) {
            assert.ok(RECIPE_MODES.includes(mode), `${r.modelId}: unknown mode ${mode}`);
        }
    }
}

function testDraftStaysHumanOnly() {
    // The `draft -> validated` flip is a human act, taken only after a real
    // render (Fabio). Nothing in this repo may set it. If a recipe ever reads
    // `validated` here, someone flipped it in code — that is the failure.
    for (const r of RECIPE_REGISTRY) {
        assert.strictEqual(r.status, 'draft', `${r.modelId} must ship as draft`);
    }
}

function testZodDefaultsSurvived() {
    // Four recipes omit these two fields and relied on Zod to fill them; a
    // consumer reading `mode.acceptsMedia.length` would crash on a raw literal.
    for (const r of RECIPE_REGISTRY) {
        for (const [mode, m] of Object.entries(r.modes)) {
            assert.ok(Array.isArray(m.acceptsMedia), `${r.modelId}.${mode} acceptsMedia`);
            assert.strictEqual(typeof m.multiScene, 'boolean', `${r.modelId}.${mode} multiScene`);
        }
    }
    // Spot-check one that omits both in its source file.
    assert.deepStrictEqual(getRecipe('chroma').modes.t2v.acceptsMedia, []);
    assert.strictEqual(getRecipe('chroma').modes.t2v.multiScene, false);
}

function testAliasesResolve() {
    assert.ok(getRecipe(FALLBACK_RECIPE_ID), 'FALLBACK_RECIPE_ID must name a real recipe');

    for (const [key, target] of Object.entries(RECIPE_ALIASES)) {
        assert.ok(getRecipe(target), `alias ${key} points at unknown recipe ${target}`);
        assert.strictEqual(resolveRecipe(key).modelId, target);
        assert.strictEqual(getRecipe(key), undefined, `alias ${key} must not also be an id`);
    }

    // Exact ids still win, and an unknown key resolves to nothing (the CALLER
    // applies the fallback, so a miss stays visible here).
    assert.strictEqual(resolveRecipe('minimax-h3').modelId, 'minimax-h3');
    assert.strictEqual(resolveRecipe('not-a-model'), undefined);
}

function testResolutionAudit() {
    // Every key models.js actually sends: `enhanceRecipe ?? type`.
    const keys = new Map();
    for (const m of MODELS) {
        const key = m.enhanceRecipe ?? m.type ?? '(none)';
        keys.set(key, [...(keys.get(key) ?? []), m.id]);
    }
    assert.ok(keys.size > 0, 'models.js yielded no keys — the import shape changed');

    const unreachable = [];
    for (const [key, ids] of keys) {
        if (!resolveRecipe(key)) unreachable.push(`${key} (${ids.join(', ')})`);
    }
    assert.deepStrictEqual(
        unreachable,
        [],
        `these models fall through to '${FALLBACK_RECIPE_ID}':\n  ${unreachable.join('\n  ')}`,
    );

    // The three keys MPI-25 flagged as needing an explicit enhanceRecipe.
    assert.strictEqual(resolveRecipe('pony').modelId, 'pony');
    assert.strictEqual(resolveRecipe('illustrious').modelId, 'illustrious');
    for (const id of ['ill-anime', 'ill-anime-beauty', 'pony-mix']) {
        const model = MODELS.find((m) => m.id === id);
        assert.ok(model, `models.js no longer ships ${id}`);
        assert.ok(
            resolveRecipe(model.enhanceRecipe ?? model.type),
            `${id} must resolve to a recipe, not the fallback`,
        );
    }
}

function testSelectSystemPrompt() {
    for (const r of RECIPE_REGISTRY) {
        for (const mode of Object.keys(r.modes)) {
            const prompt = selectSystemPrompt(r.modelId, mode);
            assert.ok(prompt && prompt.length > 200, `${r.modelId}.${mode} system prompt`);
        }
    }
    assert.strictEqual(selectSystemPrompt('not-a-model', 't2v'), undefined);
    assert.strictEqual(selectSystemPrompt('chroma', 'r2v'), undefined, 'unsupported mode');
}

function testRegisterAxis() {
    // The register axis is deferred to v1.1, so composeSystemPrompt is a
    // PASS-THROUGH for every recipe without a styleVocabulary — 11 of 12. Only
    // krea-2 declares one, which is why styles.js had to port at all: dropping
    // it would silently change that one recipe's shipped prompt.
    const withVocab = RECIPE_REGISTRY.filter((r) =>
        Object.values(r.modes).some((m) => m.styleVocabulary),
    ).map((r) => r.modelId);
    assert.deepStrictEqual(withVocab, ['krea-2']);

    for (const r of RECIPE_REGISTRY) {
        for (const [mode, m] of Object.entries(r.modes)) {
            if (m.styleVocabulary) continue;
            for (const style of ['cinematic', 'general', 'candid']) {
                assert.strictEqual(
                    composeSystemPrompt(m, style),
                    m.systemPrompt,
                    `${r.modelId}.${mode} must be untouched by style ${style}`,
                );
            }
        }
    }

    const krea = getRecipe('krea-2').modes.t2v;
    assert.notStrictEqual(composeSystemPrompt(krea, 'candid'), krea.systemPrompt);
    assert.ok(composeSystemPrompt(krea, 'candid').includes('REGISTER — CANDID'));
    assert.strictEqual(DEFAULT_STYLE, 'general');
    assert.strictEqual(
        selectSystemPrompt('krea-2', 't2v'),
        composeSystemPrompt(krea, 'general'),
        'the default style must be general — cinematic on every prompt is the bug',
    );
}

function testBriefRendersFromData() {
    const briefs = renderAllBriefs(RECIPE_REGISTRY);
    const modeCount = RECIPE_REGISTRY.reduce((n, r) => n + Object.keys(r.modes).length, 0);
    assert.strictEqual(briefs.length, modeCount);

    const h3 = renderRecipeBrief(getRecipe('minimax-h3'), 'r2v');
    assert.ok(h3.startsWith('# MiniMax H3 — r2v'));
    for (const section of ['## Element order', '## Vocabulary', '## Do', '## Never', '## Examples']) {
        assert.ok(h3.includes(section), `brief is missing ${section}`);
    }
    // Rendered from the data, never restated: a field the recipe carries must
    // appear verbatim in the brief.
    const mode = getRecipe('minimax-h3').modes.r2v;
    assert.ok(h3.includes(mode.structureOrder[0]));
    assert.ok(h3.includes(mode.dos[0]));
    assert.ok(h3.includes(String(mode.wordBudget.max)));

    assert.strictEqual(renderRecipeBrief(getRecipe('chroma'), 'r2v'), '', 'undeclared mode');
}

const tests = {
    testEveryRecipeValidates,
    testValidatorActuallyBites,
    testRegistryIntegrity,
    testDraftStaysHumanOnly,
    testZodDefaultsSurvived,
    testAliasesResolve,
    testResolutionAudit,
    testSelectSystemPrompt,
    testRegisterAxis,
    testBriefRendersFromData,
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`FAIL  ${name}\n      ${err.message}`);
    }
}

if (failed) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log(`\nAll ${Object.keys(tests).length} recipe registry contract tests passed.`);
