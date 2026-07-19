// MPI-310 — a text op (the captioner) completes with ZERO media. Before the
// outputKind gate, generationService's `if (!urls.length)` read that as a cancelled
// run: it emitted generation:cancelled and returned, discarding the caption it had
// read one line earlier. That is the whole reason the MPI-308 harness had to bypass
// generationService.
//
// This asserts the DECLARATION half of the contract (what the branch reads) plus the
// registry sync, which is what actually drifts. The emit sequence itself is exercised
// in-app — it needs the full Events/state/store graph to be meaningful.
const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

const imp = (p) => import(pathToFileURL(path.resolve(p)).href);

(async () => {
    const { commands } = await imp('js/data/commandRegistry.js');
    const { OPERATION_REGISTRY } = await imp('js/core/operationRegistry.js');

    const describe = commands.imageDescribe;
    assert.ok(describe, 'imageDescribe must be registered');
    assert.strictEqual(describe.outputKind, 'text',
        'the gate branches on this exact value — a typo silently restores the old bug');
    assert.strictEqual(describe.universal, true,
        'must be universal, which is what keeps it out of every op dropdown');
    assert.strictEqual(describe.requiresImages, 1);

    // Default must stay 'media': every pre-existing op relies on the absent field
    // meaning "produces files". If this flipped, real generations would take the
    // text branch and never write a gallery card.
    const textOps = Object.entries(commands).filter(([, c]) => c.outputKind === 'text');
    assert.deepStrictEqual(textOps.map(([k]) => k), ['imageDescribe'],
        'exactly one text op today — a new one must be added here deliberately');
    for (const [key, cmd] of Object.entries(commands)) {
        if (key === 'imageDescribe') continue;
        assert.notStrictEqual(cmd.outputKind, 'text', `${key} must not be text`);
    }

    // Registry sync — nothing enforced this before, and the JSON twin is hand-edited
    // (regenerating it strips the `universal` flags).
    const json = JSON.parse(fs.readFileSync(path.resolve('operation_registry.json'), 'utf8'));
    for (const [key, cmd] of Object.entries(commands)) {
        if (cmd.stub) continue;
        assert.ok(OPERATION_REGISTRY[key], `${key} missing from operationRegistry.js`);
        assert.ok(json[key], `${key} missing from operation_registry.json`);
    }

    console.log(`ok — text-op contract + ${Object.keys(OPERATION_REGISTRY).length} ops in sync`);
})();
