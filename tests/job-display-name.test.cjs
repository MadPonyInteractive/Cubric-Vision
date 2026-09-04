// MPI-686 — a finished download must be announced by its TITLE, never its dep key.
//
// `notificationService` resolves the name for the completion toast AND for the OS
// notification body, which leaves the app entirely. A download job id is either a bare
// model id or a NAMESPACED entity key, and the resolver has been wrong once per entity
// the app grew:
//   MPI-310 — plugins: "plugin:image-describer installed."
//   MPI-686 — flows:   "flow:voice-changer installed."
//
// Assertions 1-3 pin the three namespaces that exist. Assertion 4 is the general rule.
// Assertion 5 is the point of the file: it fails when a FOURTH `*DepKey` helper appears
// in the registries, because that is a new namespace whose keys will fall through to the
// raw-id fallback exactly like the two above.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const imp = (p) => import(pathToFileURL(path.resolve(p)).href);

(async () => {
    const { jobDisplayName } = await imp('js/shell/notificationService.js');
    const { FLOWS, flowDepKey } = await imp('js/data/flowsRegistry.js');
    const { PLUGINS, pluginDepKey } = await imp('js/data/pluginsRegistry.js');
    const { MODELS } = await imp('js/data/modelRegistry.js');

    // (1) The reported case, by name. Voice Changer's install toast read
    //     "flow:voice-changer installed." in the user's app on 2026-09-04.
    assert.strictEqual(jobDisplayName(flowDepKey('voice-changer')), 'Voice Changer',
        'the flow that reported this must resolve to its Library title');

    // (2) Every flow, not just that one.
    for (const f of FLOWS) {
        assert.strictEqual(jobDisplayName(flowDepKey(f.id)), f.title, `flow ${f.id}`);
    }

    // (3) Plugins and models still resolve — the clauses MPI-310 and the original added.
    for (const p of PLUGINS) {
        assert.strictEqual(jobDisplayName(pluginDepKey(p.id)), p.title, `plugin ${p.id}`);
    }
    const model = MODELS.find(m => m && m.id && m.name);
    assert.strictEqual(jobDisplayName(model.id), model.name, `model ${model.id}`);

    // (4) The general rule: nothing a user reads may carry the `<namespace>:<id>` shape.
    const announced = [
        ...FLOWS.map(f => flowDepKey(f.id)),
        ...PLUGINS.map(p => pluginDepKey(p.id)),
        ...MODELS.filter(m => m && m.id).map(m => m.id),
    ].map(jobDisplayName);
    const leaked = announced.filter(n => typeof n === 'string' && n.includes(':'));
    assert.deepStrictEqual(leaked, [], 'these reach the user as a raw dep key');

    // (5) The tripwire. Discover every `*DepKey` helper the registries export; each one
    //     mints a namespace that `jobDisplayName` must have a clause for. A new helper
    //     here means a new entity — add its clause, then add its name below.
    const KNOWN = ['flowDepKey', 'pluginDepKey'];
    const found = new Set();
    for (const file of fs.readdirSync('js/data')) {
        if (!/Registry\.js$/.test(file)) continue;
        const src = fs.readFileSync(path.join('js/data', file), 'utf8');
        // Both declaration forms in use: `export function xDepKey(` and
        // `export const xDepKey =`. `*FromDepKey` is the inverse lookup, not a minter.
        for (const m of src.matchAll(/export\s+(?:function|const)\s+(\w+DepKey)\b/g)) {
            if (!/FromDepKey$/.test(m[1])) found.add(m[1]);
        }
    }
    assert.deepStrictEqual([...found].sort(), KNOWN.slice().sort(),
        'a new *DepKey helper mints a namespace — give jobDisplayName a clause for it, '
        + 'then add it to KNOWN. Skipping this is how MPI-310 and MPI-686 both happened.');

    console.log(`ok — job display name (${announced.length} entities, 0 raw keys announced)`);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
