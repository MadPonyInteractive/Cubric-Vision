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
 * `flowLicences` / `buildLicenceRows` sit in js/utils/flowLicences.js but pull MpiButton,
 * so importing them here would drag in ComponentFactory and the DOM. The behaviour half
 * therefore asserts the DATA CONTRACT they stand on (the same lookup, over the same keys,
 * from the same modules) and the anchoring half asserts the module and BOTH its consumers
 * still perform it. Either alone passes while the surface is broken.
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
// MPI-666 phase 2: the helpers moved out of the component closure into a module both
// Flow surfaces import, so the anchors follow them there.
const MODULE = path.join(__dirname, '..', 'js', 'utils', 'flowLicences.js');
const mod = () => fs.readFileSync(MODULE, 'utf8');
const BASE_FLOW = path.join(__dirname, '..', 'js', 'components', 'Organisms',
    'MpiBaseFlow', 'MpiBaseFlow.js');

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
    // A flow's OWN weights are gated under its dep-queue key, which no ModelDef covers.
    // `_flowLicences` iterates that key alongside the model ids and must not special-case
    // it, so the two halves of that have to hold:
    //
    //   1. `flowDepKey` still produces the `flow:<id>` shape MODEL_LICENCES is keyed by.
    //      This is the committed contract and is asserted unconditionally.
    assert.equal(registry.flowDepKey('minimax-music'), 'flow:minimax-music');
    assert.equal(registry.flowDepKey('anything'), 'flow:anything');

    //   2. Every `flow:` entry that EXISTS round-trips through `flowDepKey` and carries a
    //      readable licence. A key hand-written in a shape `flowDepKey` never produces is
    //      MPI-664's own warning made real: the lookup misses and 13.3GB of licensed
    //      weights install with nothing shown.
    //
    // A SWEEP OVER WHAT IS THERE, NOT A NAMED KEY — and no assertion that the flow itself
    // is shipped. `flow:minimax-music` is filed in MPI-664's working tree while its FlowDef
    // is not, so a shipped-flow check would fail on that tree, and asserting the key
    // directly fails on CI, which has neither. The first version of this test did exactly
    // that and turned master red on the first push.
    const flowKeys = Object.keys(licences.MODEL_LICENCES).filter(k => k.startsWith('flow:'));
    for (const key of flowKeys) {
        assert.equal(registry.flowDepKey(key.slice('flow:'.length)), key,
            `${key} is not a shape flowDepKey produces — the gate can never fire`);
        assert.ok(licences.getModelLicence(key).licenceUrl,
            `${key}: a licence the drawer renders must be readable from it`);
    }
});

test('a territory bar is an errand too — H3 must not read as ungated', async () => {
    const { licences } = await load();
    // The chip's test was `verify` only, which is a HUGGING FACE access grant. H3 has none:
    // MiniMax do not gate the weights, only the RIGHT to use them — the licence excludes the
    // EU, the UK, Korea and the USA, and the gate's first acknowledgement is "I am outside
    // the excluded territories, or I hold my own authorization". A user inside the bar cannot
    // honestly tick it until MiniMax answer their form, so the trip to the licensor is just
    // as real as klein-9b's. Under the old test the Extend Video tile would have said
    // "Get models" and delivered a Feishu form (MPI-591 + MPI-666).
    const h3 = licences.getModelLicence('minimax-h3');
    assert.ok(h3, 'minimax-h3 lost its licence descriptor — the gate never fires');
    assert.equal(h3.verify, undefined, 'H3 grew a verify block; this test guards the case without one');
    assert.ok(h3.territory?.authorizationUrl, 'H3 lost the territory route the chip now keys on');
    // Both H3 ModelDefs share the one agreement, so either id reaching the tile must answer.
    assert.equal(licences.getModelLicence('minimax-h3-ref2va').id, h3.id);

    // The predicate the chip and the footer are built on, asserted as data: an errand is a
    // verify probe OR a territory bar, on a licence with no receipt filed.
    const errand = (l) => !!(l.verify || l.territory);
    assert.equal(errand(h3), true, 'H3 reads as ungated — the tile is an ambush again');
    // The original case still holds through the widened test, from the other branch.
    assert.equal(errand(licences.getModelLicence('klein-9b')), true);
    // And the widening did not swallow the ungated majority: a descriptor with neither
    // field is still one dialog at install and must NOT pre-announce itself on a tile.
    for (const [key, l] of Object.entries(licences.MODEL_LICENCES)) {
        if (!l.verify && !l.territory) {
            assert.equal(errand(l), false, `${key} would now claim an errand it does not have`);
        }
    }
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

test('the shared licence module still performs the lookup and renders every way out', () => {
    // Anchoring. The data contract above passes perfectly with every consumer reverted to
    // its pre-MPI-666 state, which is precisely the bug: the affordances were already built
    // and descriptor-driven, and the Flow surfaces simply did not consume them.
    //
    // Anchored on SOURCE, not an import: the module pulls MpiButton, so importing it in node
    // drags in ComponentFactory and the DOM. That is the same reason the closure helpers
    // were anchored this way before they moved here.
    const s = mod();
    assert.match(s, /import \{ getModelLicence \}/,
        'the licence lookup was removed — every Flow surface is blind again');
    assert.match(s, /Read the licence/, 'the licence is no longer readable from either surface');
    assert.match(s, /Request authorization/, 'the barred-user link is gone');
    assert.match(s, /licence\.report\.label/, 'the misuse-report channel is no longer rendered (H3 §V.5)');
    // Deduped by descriptor id, not by key: H3 ships as two ModelDefs under one agreement.
    assert.match(s, /seen\.has\(licence\.id\)/, 'licence dedupe is keyed on something other than the descriptor id');
});

test('both Flow surfaces consume the shared module', () => {
    // ONE implementation, two surfaces — the point of the extraction. A copy re-introduced
    // in either file is the drift this guards: one surface attributing its licensor and the
    // other not, when `poweredBy` is licence-mandated (MPI-452) and `report` is a channel
    // H3 §V.5 obliges us to keep reachable.
    const lib = src();
    assert.match(lib, /import \{ flowInstallKeys, flowLicences, buildLicenceRows \}/,
        'MpiFlowLibrary re-grew its own copy of the licence helpers');
    assert.match(lib, /Licence required/, 'the tile chip is gone');
    assert.match(lib, /Verify licence/, 'the footer button no longer names what the click delivers');
    // The widened predicate. `verify` alone reads H3 as ungated (it has none — the bar is
    // territorial), which is the Extend Video ambush this closes.
    assert.match(lib, /licence\.verify \|\| licence\.territory/,
        'the errand test narrowed back to `verify` — a territory-barred flow says "Get models" again');
    assert.match(lib, /Review licence/,
        'a territory licence has nothing to verify; the footer must not promise a probe we never run');

    // MPI-666 phase 2. Without this, MPI-638's `_pick` — which skips the drawer for an
    // available flow inside a project — leaves the licence reachable from Landing only.
    const frame = fs.readFileSync(BASE_FLOW, 'utf8');
    assert.match(frame, /import \{ buildLicenceRows \}/,
        'MpiBaseFlow no longer imports the licence rows — an installed flow is blind again');
    assert.match(frame, /mpi-base-flow__licence/,
        'the licence block left step 0, so a flow opened inside a project shows no licence');
});
