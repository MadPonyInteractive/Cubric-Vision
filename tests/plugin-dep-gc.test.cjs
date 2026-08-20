// MPI-310 — the plugin entity exists to stop a model uninstall from deleting a dep
// that no model and no Flow owns. If this fails, the captioner weight silently
// vanishes after an unrelated uninstall and the feature breaks with a ComfyUI
// "clip not found" deep in the graph.
const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

const imp = (p) => import(pathToFileURL(path.resolve(p)).href);

(async () => {
    const reg = await imp('js/data/pluginsRegistry.js');
    // MPI-579: resolve against the FULL union, not `assetDeps` alone. The dep
    // entries were split into four siblings (modelDeps / assetDeps / loraDeps /
    // nodesDeps) and `dependencies.js` re-merges them. While the only plugin dep
    // was a support weight, assetDeps happened to be enough; the LTX Video
    // upscaler needs a transformer, which lives in modelDeps, so the narrower map
    // reported a real dep as unknown.
    const depsMod = await imp('js/data/modelConstants/dependencies.js');
    const ASSET = depsMod.DEPS;
    assert.ok(ASSET, 'could not resolve the dep union export');

    const protectedIds = reg.pluginRequiredDepIds();
    assert.ok(protectedIds.has('qwen3vl-abliterated-clip'),
        'captioner weight must be in the protected set');

    // Every dep a plugin claims must actually resolve, or protection guards a ghost.
    for (const p of reg.PLUGINS) {
        for (const id of p.requiredDeps || []) {
            assert.ok(ASSET[id], `plugin ${p.id} requires unknown dep ${id}`);
            assert.ok(ASSET[id].url && ASSET[id].sha256, `dep ${id} missing url/sha256`);
        }
    }

    // Key namespacing: must not collide with Flow keys or bare model ids.
    assert.strictEqual(reg.pluginDepKey('image-describer'), 'plugin:image-describer');
    assert.ok(reg.pluginForOperation('imageDescribe'), 'op -> plugin lookup must resolve');

    // MPI-580 — the dropdown contribution point. The dep key is also the dropdown
    // value, so the round trip has to hold or a selected entry resolves to nothing.
    assert.strictEqual(
        reg.pluginFromDepKey(reg.pluginDepKey('image-describer'))?.id, 'image-describer',
        'dep key must round-trip back to its plugin');
    // A bare upscale-model FILENAME must never resolve to a plugin — that is the whole
    // reason the entry carries a namespaced value rather than a title.
    assert.strictEqual(reg.pluginFromDepKey('4x-NMKD-Siax.pth'), undefined);
    assert.strictEqual(reg.pluginFromDepKey(''), undefined);
    // A plugin declaring no `upscale` block contributes to neither kind.
    assert.deepStrictEqual(reg.upscalePluginsFor('video'), []);
    assert.deepStrictEqual(reg.upscalePluginsFor('image'), []);

    // The registry being right is not enough — downloadManager.js must actually SEE it
    // across the ESM/CJS boundary (it loads registries via createRequire, not import).
    const dm = require('../routes/downloadManager.js');

    // (1) Unrelated uninstall must NOT reclaim the weight.
    const guarded = dm._pluginRequiredDepIds('krea2');
    assert.ok(guarded.has('qwen3vl-abliterated-clip'),
        'uninstalling an unrelated model must not delete the plugin weight');

    // (2) The plugin's OWN uninstall must be able to reclaim it. Protecting it here
    //     would make the Uninstall button a silent no-op — 5.24GB the user can never
    //     get back. This is the case that regressed once already.
    const selfUninstall = dm._pluginRequiredDepIds(reg.pluginDepKey('image-describer'));
    assert.ok(!selfUninstall.has('qwen3vl-abliterated-clip'),
        'a plugin uninstalling itself must not self-protect its own weight');

    // (3) No argument = protect everything (the model-uninstall default path).
    assert.ok(dm._pluginRequiredDepIds().has('qwen3vl-abliterated-clip'),
        'default (no exclusion) must protect');

    console.log('ok — plugin dep GC protection', [...protectedIds]);
})();
