/**
 * flow-licence-surface.test.cjs — MPI-666.
 *
 * The Flow Library is a SECOND consumer of the licence descriptors the Model Library has
 * consumed since MPI-451. Consent itself is not at stake here — `downloadService.start()`
 * is the chokepoint and it raises the gate for a flow key exactly as for a model id, which
 * `licence-gate.test.cjs` already pins. What is at stake is whether the Flow surface can
 * SEE the licence, and every way it stops seeing one is silent:
 *
 *   1. The keys the drawer iterates stop resolving to a descriptor — a model id renamed, a
 *      flow's `id` drifting away from its `flow:<id>` entry in MODEL_LICENCES. The chip
 *      quietly reverts to "Get models" and the licence row vanishes. Nothing throws; the
 *      user is simply ambushed again, which is the exact defect this card closed.
 *   2. The descriptor loses a field the drawer renders. A `verify` licence with no
 *      `licenceUrl`, or a territory-restricted one with no `authorizationUrl`, renders a
 *      block with no way out — and "no way out" for a barred user is the whole complaint.
 *
 * `_flowLicences` / `_needsLicenceProof` live inside the component closure and are not
 * importable, so the behaviour half asserts the DATA CONTRACT they stand on (the same
 * lookup, over the same keys, from the same modules) and the anchoring half asserts the
 * component still performs it. Either alone passes while the surface is broken.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// `licences.js` reads acceptance through `Storage`, i.e. localStorage — absent in node.
// Same in-memory stand-in `licence-gate.test.cjs` uses, installed before the first import.
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
};

const SRC = path.join(__dirname, '..', 'js', 'components', 'Compounds', 'LandingPages',
    'MpiFlowLibrary', 'MpiFlowLibrary.js');
const src = () => fs.readFileSync(SRC, 'utf8');

async function load() {
    return {
        registry: await import('../js/data/flowsRegistry.js'),
        licences: await import('../js/data/modelConstants/licences.js'),
    };
}

// The flows that made this card real: all three need `klein-9b`, the app's only `verify`
// licence, and all three said "Get models" while the Model Library said "Licence required"
// for the same weights.
const VERIFY_FLOWS = ['scribble', 'scribble-object', 'object-stamp'];

test('the gated flows resolve a verify licence through their model ids', async () => {
    const { registry, licences } = await load();
    store.clear();
    for (const id of VERIFY_FLOWS) {
        const flow = registry.listFlows().find(f => f.id === id);
        assert.ok(flow, `${id} is no longer a shipped flow — retarget this test, do not delete it`);
        // The drawer iterates RESOLVED ids (an any-of slot contributes one member), which is
        // the same list `_installKeys` builds. A licence found on a candidate that is never
        // resolved would render a block for a model the user is not installing.
        const gated = registry.flowModelIds(flow)
            .map(mid => licences.getModelLicence(mid))
            .filter(Boolean);
        assert.equal(gated.length, 1, `${id} should resolve exactly one gated model`);
        assert.ok(gated[0].verify, `${id}'s licence lost its verify block — the chip goes silent`);
        // Nothing accepted → proof outstanding. This is the boolean behind both the
        // "Licence required" chip and the "Verify licence" button.
        assert.equal(licences.hasAcceptedLicence(registry.flowModelIds(flow).find(
            mid => licences.getModelLicence(mid))), false);
    }
});

test('a flow-only dep key resolves its licence exactly as a model id does', async () => {
    const { registry, licences } = await load();
    // MPI-664 filed `flow:minimax-music` in MODEL_LICENCES: a flow's OWN weights are gated
    // under its dep-queue key, which no ModelDef covers. `_flowLicences` iterates that key
    // alongside the model ids and must not special-case it — if `flowDepKey` ever stops
    // producing the string the descriptor is filed under, 13.3GB of licensed weights install
    // with nothing shown, and the drawer names no licence at all.
    const key = registry.flowDepKey('minimax-music');
    assert.equal(key, 'flow:minimax-music');
    const licence = licences.getModelLicence(key);
    assert.ok(licence, 'flow:minimax-music lost its descriptor — the Flow drawer goes blank');
    assert.ok(licence.licenceUrl, 'a licence the drawer renders must be readable from it');
});

test('every descriptor the flow drawer can render carries its own way out', async () => {
    const { licences } = await load();
    // The drawer renders name + optional poweredBy + Read / Request authorization / Report.
    // A descriptor missing the URL behind a link it triggers renders a dead button, and for
    // a territory-barred user (MPI-591 puts H3 behind Extend Video, and the EU/UK/KR/US are
    // excluded) that button is the only route to the authorization that unblocks them.
    for (const [key, l] of Object.entries(licences.MODEL_LICENCES)) {
        assert.ok(l.name, `${key}: a rendered licence needs a name`);
        assert.ok(l.licenceUrl, `${key}: "Read the licence" needs a target`);
        if (l.territory) {
            assert.ok(l.territory.authorizationUrl,
                `${key}: territory-restricted with no authorizationUrl — the barred user has no route`);
        }
        if (l.report) assert.ok(l.report.url && l.report.label, `${key}: report link is half-declared`);
    }
});

test('MpiFlowLibrary still performs the licence lookup', async () => {
    // Anchoring. The data contract above passes perfectly with the component reverted to
    // its pre-MPI-666 state, which is precisely the bug: the affordances were already built
    // and descriptor-driven, and this surface simply did not consume them.
    const s = src();
    assert.match(s, /import \{ getModelLicence, hasAcceptedLicence \}/,
        'the licence lookup was removed — the Flow surface is blind again');
    assert.match(s, /Licence required/, 'the tile chip is gone');
    assert.match(s, /Verify licence/, 'the footer button no longer names what the click delivers');
    assert.match(s, /Request authorization/, 'the barred-user link is gone from the drawer');
    // Deduped by descriptor id, not by key: H3 ships as two ModelDefs under one agreement.
    assert.match(s, /seen\.has\(licence\.id\)/, 'licence dedupe is keyed on something other than the descriptor id');
});
