// MPI-682 — a flow's uninstall must be able to free the flow's OWN weights.
//
// `_flowRequiredDepIds` protected every flow's deps unconditionally, which was right
// while a flow had no Uninstall button: nothing could ever ask it to release one. The
// Flow Library drawer now can, and the audio flows declare NO requiredModels — their
// whole footprint is flow-owned — so without the exclusion the button is a silent
// no-op and 13.4GB of MiniMax Music is unreclaimable except by hand.
//
// If this fails, either the button frees nothing (assertion 1) or it frees a weight a
// SIBLING flow still needs (assertion 4) — the second is the one that destroys data.
const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

const imp = (p) => import(pathToFileURL(path.resolve(p)).href);

(async () => {
    const reg = await imp('js/data/flowsRegistry.js');
    const { DEPS } = await imp('js/data/modelConstants/dependencies.js');
    // Across the ESM/CJS boundary — downloadManager loads registries via createRequire,
    // so the registry being right is not evidence the guard sees it.
    const dm = require('../routes/downloadManager.js');

    const ownDeps = (id) => reg.FLOWS.find(f => f.id === id)?.requiredDeps || [];

    // Every dep a flow claims must resolve, or protection guards a ghost.
    for (const flow of reg.FLOWS) {
        for (const id of flow.requiredDeps || []) {
            assert.ok(DEPS[id], `flow ${flow.id} requires unknown dep ${id}`);
        }
    }

    const minimax = ownDeps('minimax-music');
    assert.strictEqual(minimax.length, 3, 'fixture drift: minimax-music should own 3 deps');

    // (1) The flow's OWN uninstall releases its own weights. The case that started the card.
    const selfUninstall = dm._flowRequiredDepIds(reg.flowDepKey('minimax-music'));
    for (const id of minimax) {
        assert.ok(!selfUninstall.has(id),
            `a flow uninstalling itself must not self-protect ${id}`);
    }

    // (2) No argument = protect everything (the model-uninstall default path).
    const everything = dm._flowRequiredDepIds();
    for (const id of minimax) {
        assert.ok(everything.has(id), `default (no exclusion) must protect ${id}`);
    }

    // (3) An UNRELATED uninstall must not reclaim them — neither another flow's key nor
    //     a bare model id (both reach this guard through the same `excludeModelId`).
    for (const key of [reg.flowDepKey('stems'), 'krea2']) {
        const guarded = dm._flowRequiredDepIds(key);
        for (const id of minimax) {
            assert.ok(guarded.has(id), `uninstalling ${key} must not free ${id}`);
        }
    }

    // (4) Last owner standing. voice-changer's 3 deps are ALL shared with chatter-box, so
    //     its uninstall must free NOTHING — the shared-weight case that is live on the
    //     current board, not hypothetical.
    const vc = ownDeps('voice-changer');
    const shared = vc.filter(id => ownDeps('chatter-box').includes(id));
    assert.strictEqual(shared.length, 3, 'fixture drift: chatter-box should share 3 deps');
    const afterVc = dm._flowRequiredDepIds(reg.flowDepKey('voice-changer'));
    for (const id of shared) {
        assert.ok(afterVc.has(id), `${id} is still chatter-box's — must survive`);
    }

    // (5) The exclusion is exactly "this flow's own deps that nobody else claims" —
    //     never wider. head-swap owns 2 deps and no other flow wants them.
    const hs = ownDeps('head-swap');
    const afterHs = dm._flowRequiredDepIds(reg.flowDepKey('head-swap'));
    const others = new Set(reg.FLOWS.filter(f => f.id !== 'head-swap')
        .flatMap(f => f.requiredDeps || []));
    for (const id of everything) {
        assert.strictEqual(afterHs.has(id), others.has(id),
            `${id} released by head-swap's uninstall but another flow still needs it`);
    }
    assert.ok(hs.some(id => !afterHs.has(id)), 'head-swap must free at least one own dep');

    console.log(`ok — flow uninstall guard (${everything.size} flow deps protected by default)`);
})();
