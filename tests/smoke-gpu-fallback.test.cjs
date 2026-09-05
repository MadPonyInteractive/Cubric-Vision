/**
 * selectGpu — the card the smoke runner asks RunPod for (MPI-450, 2026-08-10).
 *
 * The run this covers died AFTER its ~300 GB fill leg and after the CPU Pod was already
 * deleted: RunPod refused the L4 create with HTTP 502 ("no longer any instances
 * available"), `app()` throws on any non-2xx, and the refusal therefore flew past the
 * retry loop that exists to absorb it. The other half of the fix is here — a card that has
 * refused a create must drop out of the running even though the availability payload still
 * advertises it, because availability is a snapshot and a create is the real answer.
 */
const test = require('node:test');
const assert = require('node:assert');

let selectGpu;
test.before(async () => {
    ({ selectGpu } = await import('../scripts/smoke-workflows.mjs'));
});

// Shape from the live /runpod/gpu-availability payload: stock is signalled by lowestPrice,
// there is no stockStatus field.
const stocked = (id, displayName) => ({ id, displayName, lowestPrice: { minMemory: 24 } });
const dry = (id, displayName) => ({ id, displayName, lowestPrice: { minMemory: null } });

test('picks the top preferred card when everything is in stock', () => {
    const { hit, rank } = selectGpu([
        stocked('NVIDIA GeForce RTX 4090', 'RTX 4090'),
        stocked('NVIDIA L4', 'L4'),
        stocked('NVIDIA GeForce RTX 5090', 'RTX 5090'),
        stocked('NVIDIA GeForce RTX 3090', 'RTX 3090'),
    ]);
    assert.equal(hit.displayName, 'RTX 5090', 'preference #1 regardless of array order');
    assert.equal(rank, 1);
});

// GPU_ORDER led with L4 until 2026-09-05, when MIN_RAM_GB went to 80 and made L4 (54 GB
// hosts), 3090 (30) and 4090 (31) unable to satisfy the floor at all — leading with one of
// them spends a create attempt per card to reach the only one that can place. They stay in
// the list as the fallback walk if the floor is ever lowered, so rank still has to advance
// past a missing top preference rather than defaulting to 1.
test('falls to the next preference when the top card is not offered at all', () => {
    const { hit, rank } = selectGpu([
        stocked('NVIDIA GeForce RTX 3090', 'RTX 3090'),
        stocked('NVIDIA L4', 'L4'),
    ]);
    assert.equal(hit.displayName, 'L4');
    assert.equal(rank, 2, 'L4 is preference #2 now, and rank reports the real position');
});

test('a card that already refused a create is skipped for the next preference', () => {
    const gpus = [stocked('NVIDIA L4', 'L4'), stocked('NVIDIA GeForce RTX 3090', 'RTX 3090')];
    const { hit, notes } = selectGpu(gpus, ['NVIDIA L4']);
    assert.equal(hit.displayName, 'RTX 3090', 'must advance past the refused card, not re-offer it');
    assert.ok(notes.some(n => /refused a create already/.test(n)), 'says WHY it moved on');
});

test('exclusion does not depend on the payload dropping the card', () => {
    // The real failure: RunPod kept advertising L4 as available in the very same payload
    // that had just refused to create one. Stock is not the signal here — the refusal is.
    const { hit } = selectGpu([stocked('NVIDIA L4', 'L4')], ['NVIDIA L4']);
    assert.equal(hit, null, 'nothing left to try once the only card has refused');
});

test('out-of-stock cards are passed over', () => {
    const { hit, notes } = selectGpu([dry('NVIDIA L4', 'L4'), stocked('NVIDIA GeForce RTX 3090', 'RTX 3090')]);
    assert.equal(hit.displayName, 'RTX 3090');
    assert.ok(notes.some(n => /no availability/.test(n)));
});

test('name matching is exact — L40/L40S and 3090 Ti are different, pricier cards', () => {
    const { hit } = selectGpu([
        stocked('NVIDIA L40S', 'L40S'),
        stocked('NVIDIA L40', 'L40'),
        stocked('NVIDIA GeForce RTX 3090 Ti', 'RTX 3090 Ti'),
        stocked('NVIDIA GeForce RTX 4090', 'RTX 4090'),
    ]);
    assert.equal(hit.displayName, 'RTX 4090', 'a substring match would have rented an L40S here');
});

// Negative control: without the exclusion the same input keeps handing back the sold-out
// card, which is precisely the loop the fix removes. If this ever fails, the exclusion has
// stopped being load-bearing and the tests above prove nothing.
test('control — with no exclusion the refused card is offered again', () => {
    const { hit } = selectGpu([stocked('NVIDIA L4', 'L4'), stocked('NVIDIA GeForce RTX 3090', 'RTX 3090')], []);
    assert.equal(hit.displayName, 'L4');
});
