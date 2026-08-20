/**
 * flow-lora-rack.test.cjs — MPI-504.
 *
 * A Flow that declares `settingsModel` fills its `Input_Lora_1..6` nodes from that
 * model's user LoRA rack. The value crosses THREE boundaries to get there, and every
 * one of them drops an unknown key in silence:
 *
 *   flowService  config.loraModelId
 *     → generationService  runCommand({...}) — an explicit WHITELIST
 *       → commandExecutor  _buildParams → params.Lora_N → Input_Lora_N
 *
 * Nothing throws if a link is missing. The flow opens, the panel opens, the LoRAs
 * save, the run succeeds — and the output has no LoRA in it. That is the same shape
 * as the Enhance dead-box this card also fixed: right everywhere the user can see,
 * lost on the one hop nobody watched.
 *
 * These are source assertions because the chain is three browser modules deep and
 * standing them up costs more than it proves — the same call `flow-defer-commit`
 * makes about `deferCommit`. The RENDER half is a real desktop probe instead:
 * tests/desktop/flow-lora-button.spec.js.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('flowService puts the declared settingsModel into the config', () => {
    const src = read('js/services/flowService.js');
    assert.match(
        src,
        /loraModelId:\s*flow\.settingsModel \|\| null/,
        'the flow config must carry loraModelId, or the rack never leaves the descriptor',
    );
    assert.match(
        src,
        /model:\s*\{ id: null,/,
        'a flow still dispatches as an OPERATION — settingsModel must not become a model selection',
    );
});

test('the runCommand whitelist forwards loraModelId', () => {
    const src = read('js/services/generationService.js');
    assert.match(
        src,
        /loraModelId:\s*config\.loraModelId \?\? null/,
        'runCommand takes an explicit whitelist; a key not named there never reaches the executor',
    );
});

test('the executor injects the rack ONLY for a flow that named a model', () => {
    const src = read('js/services/commandExecutor.js');
    // The universal-op branch is shared by every tool in the app. Gating on the
    // explicit id — not on `payload.operation` — is what keeps every other op
    // injecting no LoRAs, exactly as before.
    assert.match(
        src,
        /if \(payload\.loraModelId\) \{/,
        'the flow rack must be gated on the explicit id, never on the operation',
    );
    assert.match(
        src,
        /getModelSettings\(project, payload\.loraModelId\)/,
        'the rack is the MODEL\'s own settings — a flow gets no private copy',
    );
    assert.match(
        src,
        /params\[`Lora_\$\{i \+ 1\}`\] = param/g,
        'slots land as Lora_N, which the Input_ canonicalization pass renames to Input_Lora_N',
    );
});

test('a staged-LoRA model is skipped loudly, not injected in the wrong shape', () => {
    const src = read('js/services/commandExecutor.js');
    const branch = src.slice(src.indexOf('if (payload.loraModelId) {'));
    assert.match(
        branch.slice(0, 900),
        /loraStages\?\.length/,
        'a loraStages model needs stage prefixes; injecting flat slots would be silently wrong',
    );
});

test('BOTH Blocks that own a settings overlay listen for the flow button', () => {
    // The twin trap: each Block mounts its OWN MpiModelSettings, so a listener in
    // only one of them leaves the button dead in the other workspace — and dead
    // exactly the way this card's other bug was dead, with no error anywhere.
    for (const p of [
        'js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js',
        'js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js',
    ]) {
        const src = read(p);
        assert.match(
            src,
            /Events\.on\('ui:open-model-settings'/,
            `${p} mounts a settings overlay, so it must open it for a Flow too`,
        );
        assert.match(src, /_settingsOverlay\.el\.open\(\{ modelId \}\)/, `${p} must open on the named model`);
    }
});

test('the character sheet declares the model whose rack it uses', () => {
    const src = read('js/data/flowsRegistry.js');
    const flow = src.slice(src.indexOf("id: 'character-sheet'"));
    assert.match(flow.slice(0, 4000), /settingsModel:\s*'krea2'/);
    assert.match(flow.slice(0, 20000), /id: 'loras', type: 'button'[\s\S]{0,80}action: 'settings'/,
        'the button is a plain action button — the flow builds no LoRA UI of its own');
});
