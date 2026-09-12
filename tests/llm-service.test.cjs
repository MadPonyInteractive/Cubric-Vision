'use strict';

// MPI-677 step 1a — the enhance service.
// Run: node tests/llm-service.test.cjs
// No framework — matches the other tests/*.test.cjs in this repo.
//
// Three things are worth a test here and the rest is plumbing:
//
//  1. **The backend choice, and that it is the USER'S** (MPI-728). The model
//     card no longer reaches it at all: the `-nsfw` route fired on two of the
//     many models that are actually uncensored, and the `comfy -> ollama`
//     downgrade turned an explicit pick into a different backend silently.
//     Both are asserted gone, not left to a default — and with no pick the
//     answer is ComfyUI, because the Automatic entry went too (2026-09-12).
//  2. **The ComfyUI graph overrides.** They are string keys matched against
//     node titles at dispatch time; a typo fails nothing and changes nothing.
//  3. **The DeepInfra key never reaches the renderer.** Asserted by recording
//     the IPC channels `secretsStore.init` actually registers, not by reading
//     the source and hoping.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    chooseBackend,
    buildComfyInjectionParams,
    resolveRecipeId,
    resolveMode,
    COMFY_ENHANCE_OVERRIDES,
} = require('../js/services/llmService.js');
const { FALLBACK_RECIPE_ID } = require('../js/data/recipes/registry.js');

const ELIGIBLE = { id: 'krea2', capabilities: { promptEnhance: true } };
const PLAIN = { id: 'chroma', capabilities: {} };

// ── Backend choice ───────────────────────────────────────────────────────────

function testComfyIsTheDefault() {
    // Fabio, 2026-09-12: no "Automatic" entry — the RunPod section has none — and
    // with no pick the answer is the engine the app already runs. It used to be
    // the cloud when a key was stored and Ollama otherwise; neither a key nor the
    // model card moves it now, and anything that is not a backend is no pick.
    assert.strictEqual(chooseBackend(), 'comfy');
    assert.strictEqual(chooseBackend({ model: ELIGIBLE }), 'comfy');
    for (const junk of [undefined, null, '', 'auto', 'automatic', 'cloud']) {
        assert.strictEqual(chooseBackend({ override: junk }), 'comfy', `"${junk}" is not a backend`);
    }
}

function testExplicitOverrideWins() {
    assert.strictEqual(chooseBackend({ model: PLAIN, override: 'deepinfra' }), 'deepinfra');
    assert.strictEqual(chooseBackend({ model: PLAIN, override: 'ollama' }), 'ollama');
    assert.strictEqual(chooseBackend({ model: ELIGIBLE, override: 'comfy' }), 'comfy');
    // An override is honoured on any model, including one the user knows wants
    // shaping a hosted provider would sanitise — they asked for it in as many words.
    assert.strictEqual(chooseBackend({ model: { id: 'sdxl-nsfw' }, override: 'deepinfra' }), 'deepinfra');
}

function testComfyIsOfferedOnEveryModel() {
    // MPI-728. `chooseBackend` used to answer `ollama` for an explicit `comfy`
    // pick on any model outside four — a silent downgrade to a second runtime
    // that may not even be installed. The standalone enhancer graph carries its
    // own CLIPLoader and was proven on 2026-09-12 to run with NO generation
    // model loaded at all, so the pick is honoured everywhere.
    for (const model of [PLAIN, ELIGIBLE, { id: 'wan-2-2' }, { id: 'sdxl-nsfw' }, undefined]) {
        assert.strictEqual(chooseBackend({ model, override: 'comfy' }), 'comfy');
    }
}

function testTheModelCardNoLongerSteersTheBackend() {
    // The deleted `-nsfw` rule, asserted GONE rather than absent by accident.
    // A LoRA makes any model uncensored, so an id suffix never was the fact it
    // was read as — and only two of Vision's uncensored models carry one.
    for (const id of ['sdxl-nsfw', 'krea2-nsfw', 'klein-lora-nsfw', 'chroma', 'wan-2-2']) {
        for (const override of [undefined, 'deepinfra', 'ollama']) {
            assert.strictEqual(chooseBackend({ model: { id }, override }), chooseBackend({ override }),
                `the id "${id}" changed the backend — the model card must not steer it`);
        }
    }
}

// ── The ComfyUI graph overrides ──────────────────────────────────────────────

function testInjectionParamsCarryTheOverrides() {
    const params = buildComfyInjectionParams('SYSTEM');

    // The four MPI-35 phase 2 overrides, `Replace Text.replace` among them.
    for (const key of Object.keys(COMFY_ENHANCE_OVERRIDES)) {
        assert.ok(key in params, `missing override: ${key}`);
        assert.strictEqual(params[key], COMFY_ENHANCE_OVERRIDES[key]);
    }
    assert.strictEqual(params['Replace Text.replace'], '\n',
        'node 1 strips every newline unless replace is an identity');
    assert.strictEqual(params['Input_Scrub_Negation.regex_pattern'], '(?!)');
    assert.ok(params['Input_Text_Gen.max_length'] > 512, 'the baked 512 truncates a long-budget recipe');

    // Every key must address a real node title, optionally `.widget`.
    const graph = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'comfy_workflows', 'qwen3vl_4b_prompt_enhancer.json'), 'utf8'));
    const titles = new Set(Object.values(graph).map((n) => (n._meta && n._meta.title || '').toLowerCase()));
    for (const key of Object.keys(params)) {
        const dot = key.indexOf('.');
        const title = (dot === -1 ? key : key.slice(0, dot)).toLowerCase();
        assert.ok(titles.has(title), `injection key "${key}" addresses no node in the enhancer graph`);
    }
}

function testSystemPromptIsChatMlWrapped() {
    const params = buildComfyInjectionParams('BE A ROBOT');
    // The graph appends `\n<|im_end|>\n<|im_start|>assistant` after the user
    // text, so this value must open the system turn and close it on `user`.
    assert.ok(params.Input_System_Prompt.startsWith('<|im_start|>system\n'));
    assert.ok(params.Input_System_Prompt.includes('BE A ROBOT'));
    assert.ok(params.Input_System_Prompt.endsWith('<|im_end|>\n<|im_start|>user'));
}

// ── Recipe resolution (the same contract the broker responder had) ───────────

function testRecipeResolutionAndFallback() {
    assert.deepStrictEqual(resolveRecipeId('krea-2'), { recipeId: 'krea-2', fellBack: false });
    assert.deepStrictEqual(resolveRecipeId('h3'), { recipeId: 'minimax-h3', fellBack: false },
        'the alias map must still reach MiniMax-H3 — it fell to the chroma IMAGE recipe for a week');
    const miss = resolveRecipeId('no-such-model');
    assert.strictEqual(miss.recipeId, FALLBACK_RECIPE_ID);
    assert.strictEqual(miss.fellBack, true, 'a miss must be reported, not absorbed');
}

function testModeResolution() {
    assert.strictEqual(resolveMode('krea-2'), 't2v');
    assert.strictEqual(resolveMode('krea-2', 'r2v'), 't2v', 'an unsupported mode falls back, never returns undefined');
    assert.strictEqual(resolveMode('minimax-h3', 'r2v'), 'r2v');
}

// ── The DeepInfra key never reaches the renderer ─────────────────────────────

function testSecretsStoreDeepInfraSlot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cubric-secrets-'));
    const prevUserData = process.env.APP_USER_DATA;
    process.env.APP_USER_DATA = dir;
    try {
        // Fresh module state per run, and no safeStorage — the derived-key AES-GCM
        // fallback is the branch a headless test machine takes anyway.
        delete require.cache[require.resolve('../main/secretsStore.js')];
        const store = require('../main/secretsStore.js');

        const channels = [];
        store.init({ app: null, safeStorage: null, ipcMain: { handle: (c) => channels.push(c) }, logger: null });

        // THE INVARIANT: set / presence / clear, and no way to read it back.
        assert.ok(channels.includes('secrets:set-deepinfra-key'));
        assert.ok(channels.includes('secrets:has-deepinfra-key'));
        assert.ok(channels.includes('secrets:clear-deepinfra-key'));
        const leaky = channels.filter((c) => /deepinfra/i.test(c) && /get/i.test(c));
        assert.deepStrictEqual(leaky, [], `renderer-readable key channel registered: ${leaky.join(', ')}`);

        assert.strictEqual(store.hasDeepInfraKey(), false);
        assert.deepStrictEqual(store.setDeepInfraKey(''), { ok: false, reason: 'empty' });

        assert.strictEqual(store.setDeepInfraKey('di-secret-123').ok, true);
        assert.strictEqual(store.hasDeepInfraKey(), true);
        assert.strictEqual(store.getDeepInfraKey(), 'di-secret-123');

        // Its own slot, never the RunPod one: setting one must not answer for the other.
        assert.strictEqual(store.hasApiKey(), false, 'the DeepInfra key must not satisfy hasApiKey()');
        store.setApiKey('runpod-secret-456');
        assert.strictEqual(store.getDeepInfraKey(), 'di-secret-123', 'the RunPod key overwrote the DeepInfra slot');

        // Never plaintext on disk, whichever encryption branch ran.
        const onDisk = fs.readFileSync(path.join(dir, 'runpod-secrets.json'), 'utf8');
        assert.ok(!onDisk.includes('di-secret-123'), 'the key is on disk in plaintext');

        store.clearDeepInfraKey();
        assert.strictEqual(store.hasDeepInfraKey(), false);
        assert.strictEqual(store.hasApiKey(), true, 'clearing DeepInfra must not clear RunPod');
    } finally {
        if (prevUserData === undefined) delete process.env.APP_USER_DATA;
        else process.env.APP_USER_DATA = prevUserData;
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function testForkBridgeAnswersDeepInfraRequests() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cubric-secrets-'));
    const prevUserData = process.env.APP_USER_DATA;
    process.env.APP_USER_DATA = dir;
    try {
        delete require.cache[require.resolve('../main/secretsStore.js')];
        const store = require('../main/secretsStore.js');
        store.init({ app: null, safeStorage: null, ipcMain: null, logger: null });
        store.setDeepInfraKey('bridge-key-789');

        let handler = null;
        const sent = [];
        store.registerForkBridge({ on: (_e, fn) => { handler = fn; }, send: (m) => sent.push(m) });
        assert.ok(handler, 'registerForkBridge did not subscribe');

        handler({ type: 'secrets:has-deepinfra-key-request', id: 'a' });
        handler({ type: 'secrets:get-deepinfra-key-request', id: 'b' });

        assert.deepStrictEqual(sent[0], { type: 'secrets:has-deepinfra-key-response', id: 'a', has: true });
        assert.deepStrictEqual(sent[1], { type: 'secrets:get-deepinfra-key-response', id: 'b', value: 'bridge-key-789' });
    } finally {
        if (prevUserData === undefined) delete process.env.APP_USER_DATA;
        else process.env.APP_USER_DATA = prevUserData;
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ── Runner ───────────────────────────────────────────────────────────────────

const tests = [
    testComfyIsTheDefault,
    testExplicitOverrideWins,
    testComfyIsOfferedOnEveryModel,
    testTheModelCardNoLongerSteersTheBackend,
    testInjectionParamsCarryTheOverrides,
    testSystemPromptIsChatMlWrapped,
    testRecipeResolutionAndFallback,
    testModeResolution,
    testSecretsStoreDeepInfraSlot,
    testForkBridgeAnswersDeepInfraRequests,
];

let failed = 0;
for (const t of tests) {
    try {
        t();
        console.log(`  ok  ${t.name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL ${t.name}\n    ${err.message}`);
    }
}
console.log(failed
    ? `\n${failed} of ${tests.length} llm service tests FAILED.`
    : `\nAll ${tests.length} llm service tests passed.`);
if (failed) process.exitCode = 1;
