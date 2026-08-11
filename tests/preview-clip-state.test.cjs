/**
 * MPI-535 — clip playback state must belong to the GENERATION, not to a card.
 *
 * The `VHS_latentpreview` marker fires ONCE per sampler run (H3 single-pass = one
 * prompt = one marker for the whole run), so a consumer that latches it can never
 * recover from missing it. These tests pin the durable half: activeGenerations
 * records the marker's clip contract for the run's whole life and hands it back on
 * demand, so a consumer can re-read it per frame instead of latching.
 */
const test = require('node:test');
const assert = require('node:assert');

// The module is a browser ESM singleton; it imports events.js only.
const load = async () => {
    const url = new URL('../js/services/activeGenerations.js', `file://${__filename}`).href;
    const { activeGenerations } = await import(`${url}?t=${Math.random()}`);
    return activeGenerations;
};

const startGen = (ag) => ag.start({
    scope: 'gallery', tempId: 't1', operation: 'i2v_ms', modelId: 'minimax-h3', exec: {},
}).id;

test('a run with no marker has no clip state (still-mode models stay still)', async () => {
    const ag = await load();
    const id = startGen(ag);
    assert.strictEqual(ag.getPreviewClip(id), null);
    ag.end(id, { revokePreview: false });
});

test('the marker payload is recorded for the run and survives repeated reads', async () => {
    const ag = await load();
    const id = startGen(ag);
    ag.resetPreview(id, { length: 56, rate: 24, id: '381' });
    for (let i = 0; i < 3; i++) {
        assert.deepStrictEqual(ag.getPreviewClip(id), { rate: 24, length: 56 });
    }
    ag.end(id, { revokePreview: false });
});

test('a second stage marker replaces the contract, it does not stack', async () => {
    const ag = await load();
    const id = startGen(ag);
    ag.resetPreview(id, { length: 56, rate: 24 });
    ag.resetPreview(id, { length: 121, rate: 16 });
    assert.deepStrictEqual(ag.getPreviewClip(id), { rate: 16, length: 121 });
    ag.end(id, { revokePreview: false });
});

test('a marker with no usable payload still marks the run as clip-bursting', async () => {
    // Rate/length are hints with fallbacks; the FACT of the marker is what flips
    // playback out of still mode, so it must not depend on the payload parsing.
    const ag = await load();
    const id = startGen(ag);
    ag.resetPreview(id, null);
    assert.deepStrictEqual(ag.getPreviewClip(id), { rate: null, length: null });
    ag.end(id, { revokePreview: false });
});

test('clip state is dropped with the generation, never leaking into the next run', async () => {
    const ag = await load();
    const first = startGen(ag);
    ag.resetPreview(first, { length: 56, rate: 24 });
    ag.end(first, { revokePreview: false });
    assert.strictEqual(ag.getPreviewClip(first), null);

    const second = startGen(ag);
    assert.strictEqual(ag.getPreviewClip(second), null, 'a fresh gen must start still');
    ag.end(second, { revokePreview: false });
});

test('a marker for an unknown generation is ignored', async () => {
    const ag = await load();
    ag.resetPreview('not-a-gen', { length: 56, rate: 24 });
    assert.strictEqual(ag.getPreviewClip('not-a-gen'), null);
});
