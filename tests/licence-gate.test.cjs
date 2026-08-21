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
const fs = require('node:fs');
const path = require('node:path');

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

    // Whichever the user installs FIRST is the one that prompts; the other is then
    // free. Both directions, because "it works the way I happened to test it" is not
    // the same claim as "it is symmetric".
    store.clear();
    assert.strictEqual(hasAcceptedLicence(SIBLING), false);
    recordLicenceAcceptance(GATED);
    assert.strictEqual(hasAcceptedLicence(SIBLING), true, 'accepting via fl2va must cover ref2va');

    store.clear();
    assert.strictEqual(hasAcceptedLicence(GATED), false);
    recordLicenceAcceptance(SIBLING);
    assert.strictEqual(hasAcceptedLicence(GATED), true, 'accepting via ref2va must cover fl2va');

    // Provenance is still recorded — which install actually prompted it.
    const receipts = JSON.parse(store.get([...store.keys()][0]));
    assert.strictEqual(receipts[MODEL_LICENCES[GATED].id].acceptedVia, SIBLING);

    // And a version bump still re-prompts BOTH — one agreement, one receipt, so a
    // revised AUP cannot reach one variant and miss the other.
    const licence = MODEL_LICENCES[GATED];
    const original = licence.version;
    licence.version = original + 1;
    assert.strictEqual(hasAcceptedLicence(GATED), false, 'bump must re-prompt fl2va');
    assert.strictEqual(hasAcceptedLicence(SIBLING), false, 'bump must re-prompt ref2va');
    licence.version = original;
});

test('every descriptor carries what the gate renders', async () => {
    const { MODEL_LICENCES } = await licences();
    // A descriptor missing a field does not crash the dialog — it renders an empty
    // row, which is a consent gate that shows the user nothing. Cheaper to pin here.
    for (const [modelId, l] of Object.entries(MODEL_LICENCES)) {
        assert.ok(l.id && typeof l.id === 'string', `${modelId}: id`);
        assert.ok(Number.isInteger(l.version) && l.version >= 1, `${modelId}: version`);
        assert.ok(l.name && l.modelName && l.summary, `${modelId}: display copy`);
        // licenceUrl is EITHER hosted, or a root-relative path to a copy bundled under
        // licences/. MiniMax H3 §III.1 obliges us to *provide a copy* of the agreement to
        // anyone who "uses your products or services related thereto" — a link to the
        // licensor's server names a copy rather than providing one, and dies offline or
        // when they move the file. A bundled path must therefore actually resolve on disk;
        // a typo'd one would open a 404 in the user's browser and silently discharge
        // nothing, which is the failure this half of the assertion exists to catch.
        if (l.licenceUrl.startsWith('/')) {
            const onDisk = path.join(__dirname, '..', l.licenceUrl);
            assert.ok(fs.existsSync(onDisk), `${modelId}: bundled licenceUrl missing on disk (${l.licenceUrl})`);
            assert.ok(fs.statSync(onDisk).size > 0, `${modelId}: bundled licence is empty`);
        } else {
            assert.match(l.licenceUrl, /^https:\/\//, `${modelId}: licenceUrl`);
        }
        // Attribution is optional (most licences want none), but an empty string would
        // render a blank row that looks like a layout bug rather than a missing notice.
        if ('poweredBy' in l) {
            assert.ok(l.poweredBy && typeof l.poweredBy === 'string', `${modelId}: poweredBy`);
        }
        assert.ok(Array.isArray(l.sections) && l.sections.length, `${modelId}: sections`);
        for (const s of l.sections) {
            assert.ok(s.heading, `${modelId}: section heading`);
            assert.ok(Array.isArray(s.items) && s.items.length, `${modelId}: section items`);
        }
        assert.ok(Array.isArray(l.acknowledgements) && l.acknowledgements.length,
            `${modelId}: at least one checkbox, or Accept unlocks on scroll alone`);
        // §V.5 of the H3 agreement requires a reachable misuse-reporting mechanism, and
        // the gate is where we make it reachable. Not every licence asks for one — the
        // FLUX NCL does not — so it is optional, but a present one must be reachable.
        if (l.report) assert.match(l.report.url, /^https:\/\//, `${modelId}: report url`);
        if (l.territory) {
            assert.ok(l.territory.territories.length, `${modelId}: territory list`);
            // The whole point of the territory branch: route to the licensor's own
            // authorization, never disclaim the restriction onto the user.
            assert.match(l.territory.authorizationUrl, /^https:\/\//, `${modelId}: authorizationUrl`);
        }
    }
});

// ── MPI-357 — the proof half ─────────────────────────────────────────────────
//
// A `verify` descriptor says the licensor grants access to a PERSON, on their own model
// page, and that we prove it before the weights move. Both halves of that fail silently:
// a receipt that satisfies the gate without the probe, and a probe aimed at a file the
// gate does not actually cover. Neither errors; both just quietly let everyone through.

const VERIFIED = 'klein-9b';

test('a verify licence is not satisfied by consent alone', async () => {
    const { getModelLicence, hasAcceptedLicence, recordLicenceAcceptance } = await licences();
    assert.ok(getModelLicence(VERIFIED).verify, 'this test is meaningless without a verify block');

    // The exact shape of a receipt written before the proof step existed, and of one
    // written by a consent-only path that forgot to pass `verified`. Either must NOT
    // unlock the install — otherwise the probe is decoration.
    store.clear();
    recordLicenceAcceptance(VERIFIED);
    assert.strictEqual(hasAcceptedLicence(VERIFIED), false, 'consent without proof must re-prompt');

    store.clear();
    recordLicenceAcceptance(VERIFIED, { verified: true });
    assert.strictEqual(hasAcceptedLicence(VERIFIED), true, 'a proven acceptance must stick');

    // And the token is not in there. It is used for one request and dropped; a receipt
    // that carried it would put a live credential in localStorage and into any portable
    // build copied to another machine.
    const receipt = JSON.parse(store.get([...store.keys()][0]))[getModelLicence(VERIFIED).id];
    assert.deepStrictEqual(Object.keys(receipt).sort(), ['acceptedVia', 'at', 'verified', 'version']);
});

test('an unproven verify licence does not block the ungated ones', async () => {
    const { hasAcceptedLicence, recordLicenceAcceptance } = await licences();
    // The `verified` requirement is per-descriptor. H3 has no verify block and must keep
    // clearing on consent alone — a blanket `r.verified === true` would silently start
    // re-prompting every H3 user who already accepted.
    store.clear();
    recordLicenceAcceptance(GATED);
    assert.strictEqual(hasAcceptedLicence(GATED), true, 'a non-verify licence still clears on consent');
    assert.strictEqual(hasAcceptedLicence(VERIFIED), false);
});

test('every verify descriptor names a probe target that could be gated', async () => {
    const { MODEL_LICENCES } = await licences();
    for (const [modelId, l] of Object.entries(MODEL_LICENCES)) {
        if (!l.verify) continue;
        assert.match(l.verify.repoId, /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/, `${modelId}: repoId`);
        assert.ok(l.verify.probePath, `${modelId}: probePath`);
        assert.ok(!l.verify.probePath.startsWith('/') && !l.verify.probePath.includes('..'),
            `${modelId}: probePath must stay inside the repo`);
        // The measured trap this whole card turned on. Hugging Face serves LICENSE.md and
        // README.md unauthenticated ON PURPOSE — you must be able to read terms before
        // accepting them — so either as a probe target returns 200 for a user who has
        // accepted nothing. The live check below is the real proof; this one runs offline
        // and in CI, and catches the mistake at the moment someone writes it.
        assert.ok(!/^(LICENSE|LICENCE|README)\.md$/i.test(l.verify.probePath),
            `${modelId}: ${l.verify.probePath} is served without a token — it would pass every user`);
    }
});

// Live, and therefore skipped on CI. The offline test above pins what we BELIEVE about
// the probe target; only Hugging Face can say whether it is still true. Run it whenever
// a verify descriptor is added or a licensor changes their gate.
test('the probe target is really gated, and the licence really is not', {
    skip: process.env.CI ? 'network test — run locally' : false,
}, async (t) => {
    const { MODEL_LICENCES } = await licences();
    const seen = new Set();
    for (const l of Object.values(MODEL_LICENCES)) {
        if (!l.verify || seen.has(l.verify.repoId)) continue;
        seen.add(l.verify.repoId);
        const base = `https://huggingface.co/${l.verify.repoId}/resolve/main`;

        const probe = await fetch(`${base}/${l.verify.probePath}`, { method: 'HEAD', redirect: 'manual' });
        assert.ok(probe.status === 401 || probe.status === 403,
            `${l.verify.repoId}/${l.verify.probePath} answered ${probe.status} with NO token — the gate is open`);

        const licenceDoc = await fetch(`${base}/LICENSE.md`, { method: 'HEAD', redirect: 'manual' });
        t.diagnostic(`${l.verify.repoId}: probe ${probe.status}, LICENSE.md ${licenceDoc.status}`);
    }
});
