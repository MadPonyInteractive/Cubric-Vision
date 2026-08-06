// MPI-451 — the per-model licence gate.
//
// A few model licences oblige US, as distributor, to bind the END USER to the
// licensor's restrictions before they receive the weights (MiniMax H3 §V.2). The gate
// that does that hangs off two pure functions in `licences.js`, and both of their
// failure modes are silent:
//
//   1. `hasAcceptedLicence` returning true when it should not = the weights download
//      with no consent recorded. Nothing errors; we are just in breach.
//   2. `getModelLicence` matching a model it should not = a consent dialog in front
//      of an install that never needed one, on every ungated model in the library.
//
// Neither shows up in a screenshot, so they are pinned here. The DOM half (the scroll
// gate, the checkboxes) is verified in the running app — it needs a laid-out modal,
// which is exactly what a node test cannot give it.

const assert = require('node:assert');
const test = require('node:test');

// `licences.js` reads acceptance through `Storage`, which is localStorage — absent in
// node. One in-memory stand-in, installed before the first import.
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
};

const licences = () => import('../js/data/modelConstants/licences.js');

const GATED = 'minimax-h3';

test('an ungated model is not gated and needs no acceptance', async () => {
    const { getModelLicence, hasAcceptedLicence } = await licences();
    store.clear();
    // The whole "models with no descriptor are completely unaffected" guarantee is
    // this lookup missing. If a real model id ever lands in MODEL_LICENCES by accident,
    // every install of it grows a modal.
    assert.strictEqual(getModelLicence('sdxl-realistic'), null);
    assert.strictEqual(hasAcceptedLicence('sdxl-realistic'), true);
});

test('a gated model blocks until it is accepted, then stays accepted', async () => {
    const { hasAcceptedLicence, recordLicenceAcceptance } = await licences();
    store.clear();
    assert.strictEqual(hasAcceptedLicence(GATED), false);
    recordLicenceAcceptance(GATED);
    assert.strictEqual(hasAcceptedLicence(GATED), true);
});

test('acceptance survives a restart', async () => {
    const { hasAcceptedLicence, recordLicenceAcceptance } = await licences();
    store.clear();
    recordLicenceAcceptance(GATED);
    const persisted = new Map(store);   // what would be on disk after a quit
    store.clear();
    for (const [k, v] of persisted) store.set(k, v);
    assert.strictEqual(hasAcceptedLicence(GATED), true);
});

test('a version bump re-prompts, and a receipt for another agreement does not count', async () => {
    const { MODEL_LICENCES, hasAcceptedLicence, recordLicenceAcceptance } = await licences();
    const licence = MODEL_LICENCES[GATED];

    // How a revised AUP reaches someone who accepted the old one.
    store.clear();
    recordLicenceAcceptance(GATED);
    const original = licence.version;
    licence.version = original + 1;
    assert.strictEqual(hasAcceptedLicence(GATED), false, 'a version bump must re-prompt');
    licence.version = original;

    // The licensor replacing the document outright rather than revising it: a receipt
    // filed under a different agreement is not a receipt for this one.
    store.clear();
    recordLicenceAcceptance(GATED);
    const key = [...store.keys()][0];
    const receipts = JSON.parse(store.get(key));
    store.set(key, JSON.stringify({ 'some-other-agreement': receipts[licence.id] }));
    assert.strictEqual(hasAcceptedLicence(GATED), false, 'a receipt for another licence must not count');
});

test('models sharing one agreement share one acceptance', async () => {
    const { MODEL_LICENCES, getModelLicence, hasAcceptedLicence, recordLicenceAcceptance } = await licences();
    // H3 ships as two ModelDefs (fl2va + ref2va) under a single agreement. The licence
    // binds the PERSON, so re-showing the identical 25 clauses for the second variant
    // would be friction that buys no consent. Receipts are keyed by LICENCE id, which
    // is what makes that work — and this test is what stops someone "fixing" it back
    // to a per-model key.
    const SIBLING = 'minimax-h3-ref2va';
    assert.strictEqual(getModelLicence(SIBLING), MODEL_LICENCES[GATED], 'both ids must share ONE descriptor object');

    store.clear();
    assert.strictEqual(hasAcceptedLicence(SIBLING), false);
    recordLicenceAcceptance(GATED);
    assert.strictEqual(hasAcceptedLicence(SIBLING), true, 'accepting via fl2va must cover ref2va');

    // Provenance is still recorded — which install actually prompted it.
    const receipts = JSON.parse(store.get([...store.keys()][0]));
    assert.strictEqual(receipts[MODEL_LICENCES[GATED].id].acceptedVia, GATED);
});

test('every descriptor carries what the gate renders', async () => {
    const { MODEL_LICENCES } = await licences();
    // A descriptor missing a field does not crash the dialog — it renders an empty
    // row, which is a consent gate that shows the user nothing. Cheaper to pin here.
    for (const [modelId, l] of Object.entries(MODEL_LICENCES)) {
        assert.ok(l.id && typeof l.id === 'string', `${modelId}: id`);
        assert.ok(Number.isInteger(l.version) && l.version >= 1, `${modelId}: version`);
        assert.ok(l.name && l.modelName && l.summary, `${modelId}: display copy`);
        assert.match(l.licenceUrl, /^https:\/\//, `${modelId}: licenceUrl`);
        assert.ok(Array.isArray(l.sections) && l.sections.length, `${modelId}: sections`);
        for (const s of l.sections) {
            assert.ok(s.heading, `${modelId}: section heading`);
            assert.ok(Array.isArray(s.items) && s.items.length, `${modelId}: section items`);
        }
        assert.ok(Array.isArray(l.acknowledgements) && l.acknowledgements.length,
            `${modelId}: at least one checkbox, or Accept unlocks on scroll alone`);
        // §V.5 of the H3 agreement requires a reachable misuse-reporting mechanism, and
        // the gate is where we make it reachable.
        assert.match(l.report.url, /^https:\/\//, `${modelId}: report url`);
        if (l.territory) {
            assert.ok(l.territory.territories.length, `${modelId}: territory list`);
            // The whole point of the territory branch: route to the licensor's own
            // authorization, never disclaim the restriction onto the user.
            assert.match(l.territory.authorizationUrl, /^https:\/\//, `${modelId}: authorizationUrl`);
        }
    }
});
