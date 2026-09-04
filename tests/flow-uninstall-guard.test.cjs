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
    // FOUR since MPI-664: the three MiniMax weights plus `qwen3vl-abliterated-clip`, the
    // prompt enhancer, which became required the day enhancement moved inside Generate.
    // That fourth one is SHARED with the krea2 and qwen models, and it is safe here for
    // a reason worth stating: the flow guard below is only one contributor to the keep
    // set — the MODELS sweep in the same function protects it whenever either model is
    // installed, so assertion (1) freeing it from the FLOW side deletes nothing a model
    // still owns.
    assert.strictEqual(minimax.length, 4, 'fixture drift: minimax-music should own 4 deps');

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

    // (4) MPI-684 — voice-changer must be able to free its OWN weights, and the node pack
    //     it genuinely shares must survive. This assertion used to read "voice-changer's
    //     3 deps are ALL shared with chatter-box, so its uninstall must free NOTHING",
    //     which pinned a BUG as expected behaviour: chatter-box declared the VC weight
    //     pair it never loads (`chatterbox_vc/` is reached only by `load_vc_model()`,
    //     called solely from `FL_ChatterboxVCNode`). Because the guard walks DECLARED
    //     flows, that made voice-changer a strict subset of chatter-box and its Uninstall
    //     a permanent no-op — no path existed to reclaim the 1.0GB. Re-adding those ids
    //     to chatter-box fails this test, which is the point.
    const vc = ownDeps('voice-changer');
    const shared = vc.filter(id => ownDeps('chatter-box').includes(id));
    assert.deepStrictEqual(shared, ['ComfyUI_Fill-ChatterBox'],
        'only the node pack is genuinely shared — a WEIGHT here means chatter-box has re-declared what it cannot load');
    const afterVc = dm._flowRequiredDepIds(reg.flowDepKey('voice-changer'));
    assert.ok(afterVc.has('ComfyUI_Fill-ChatterBox'),
        'the node pack is chatter-box\'s too — it must survive voice-changer\'s uninstall');
    for (const id of ['chatterbox-vc-s3gen', 'chatterbox-vc-conds']) {
        assert.ok(!afterVc.has(id),
            `${id} is voice-changer's alone — its own uninstall must be able to free it`);
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
