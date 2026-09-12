/**
 * cue-all-eligibility.test.cjs — MPI-733 Phase 1.
 *
 * "Cue all" queues ONE job per selected gallery card, each carrying exactly one
 * media item. `selectCueAllTargets` is the pure half of that: given the
 * REMEMBERED op, the model, and the selected groups, it answers which cards the
 * op can actually consume and which get skipped.
 *
 * What is locked here is the required-slot rule, because getting it wrong is
 * expensive in a way a UI bug is not: too permissive and the user spends N
 * generations on jobs that were never runnable.
 *
 * The helper is pure and lives in commandRegistry beside the slot functions it
 * reads, so this is a plain node:test with no DOM and no harness.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const REG = '../js/data/commandRegistry.js';

// Groups as the gallery grid holds them: an id, a media type, and history the
// helper never looks at. `type` is the only field the rule reads.
const img = id => ({ id, type: 'image', name: id });
const vid = id => ({ id, type: 'video', name: id });
const aud = id => ({ id, type: 'audio', name: id });

// LTX is the model with `capabilities.audio`, which is what un-gates the
// optional audio slot on the shared video ops. Used to prove that un-gating an
// OPTIONAL slot still does not make it a batch axis.
const LTX = { id: 'ltx', mediaType: 'video', capabilities: { audio: true } };

test('an image op over a mixed selection takes only the images, in selection order', async () => {
    const { selectCueAllTargets } = await import(REG);

    const groups = [img('a'), vid('b'), img('c'), aud('d'), img('e')];
    const { eligible, skipped, reason } = selectCueAllTargets('upscale', null, groups);

    assert.deepStrictEqual(eligible.map(g => g.id), ['a', 'c', 'e']);
    assert.deepStrictEqual(skipped.map(g => g.id), ['b', 'd']);
    assert.strictEqual(reason, null, 'something was eligible, so there is no refusal reason');
});

test('a text-only remembered op returns zero eligible', async () => {
    const { selectCueAllTargets } = await import(REG);

    // t2i declares no media slots at all — there is nothing to batch over.
    const t2i = selectCueAllTargets('t2i', null, [img('a'), img('b')]);
    assert.deepStrictEqual(t2i.eligible, []);
    assert.strictEqual(t2i.reason, 'not-batchable');
    assert.deepStrictEqual(t2i.skipped.map(g => g.id), ['a', 'b'], 'skipped carries the whole selection');

    // t2v_ms declares ONLY an optional audio slot. Zero required slots is the
    // same answer: a text op with a decoration is still a text op.
    const t2v = selectCueAllTargets('t2v_ms', LTX, [aud('a')]);
    assert.deepStrictEqual(t2v.eligible, []);
    assert.strictEqual(t2v.reason, 'not-batchable');
});

test('extend over a video selection returns all of them', async () => {
    const { selectCueAllTargets } = await import(REG);

    const groups = [vid('a'), vid('b'), vid('c')];
    const { eligible, skipped, reason } = selectCueAllTargets('extend', null, groups);

    assert.deepStrictEqual(eligible.map(g => g.id), ['a', 'b', 'c']);
    assert.deepStrictEqual(skipped, []);
    assert.strictEqual(reason, null);
});

test('a null or unknown remembered op returns zero eligible, and says which', async () => {
    const { selectCueAllTargets } = await import(REG);

    for (const op of [null, undefined, '', 'noSuchOp']) {
        const { eligible, skipped, reason } = selectCueAllTargets(op, null, [img('a'), img('b')]);
        assert.deepStrictEqual(eligible, [], `${String(op)} must yield nothing`);
        assert.strictEqual(reason, 'no-operation', `${String(op)} must read as "nothing picked"`);
        assert.deepStrictEqual(skipped.map(g => g.id), ['a', 'b']);
    }
});

test('an op needing TWO required inputs is not batchable — a one-item job cannot fill it', async () => {
    const { selectCueAllTargets } = await import(REG);

    // flowHeadSwap declares image,image REQUIRED. Batching it one item at a time
    // would dispatch N graphs each missing their second input.
    const swap = selectCueAllTargets('flowHeadSwap', null, [img('a'), img('b'), img('c')]);
    assert.deepStrictEqual(swap.eligible, []);
    assert.strictEqual(swap.reason, 'not-batchable');

    // Same shape on the audio side.
    const voice = selectCueAllTargets('flowVoiceChanger', null, [aud('a'), aud('b')]);
    assert.deepStrictEqual(voice.eligible, []);
    assert.strictEqual(voice.reason, 'not-batchable');
});

test('OPTIONAL slots are not a batch axis, even when the model un-gates them', async () => {
    const { selectCueAllTargets } = await import(REG);

    // i2v_ms is REQ image | OPT image,audio. On LTX the optional audio slot
    // survives filterMediaInputsForModel — and must STILL not make an audio
    // selection eligible, or the batch queues image-to-video jobs with no image.
    const audioSel = selectCueAllTargets('i2v_ms', LTX, [aud('a'), aud('b')]);
    assert.deepStrictEqual(audioSel.eligible, []);
    assert.strictEqual(audioSel.reason, 'wrong-media-type');

    // The required image slot is what the op batches over.
    const imageSel = selectCueAllTargets('i2v_ms', LTX, [img('a'), img('b')]);
    assert.deepStrictEqual(imageSel.eligible.map(g => g.id), ['a', 'b']);

    // krea2Edit's 2nd reference slot is optional too: it is a per-job extra, not
    // a second thing to iterate. Two images = two separate one-image edits.
    const krea = selectCueAllTargets('krea2Edit', null, [img('a'), img('b')]);
    assert.deepStrictEqual(krea.eligible.map(g => g.id), ['a', 'b']);
});

test('an all-wrong-type selection is refused with wrong-media-type, not silently empty', async () => {
    const { selectCueAllTargets } = await import(REG);

    const { eligible, skipped, reason } = selectCueAllTargets('extend', null, [img('a'), img('b')]);
    assert.deepStrictEqual(eligible, []);
    assert.deepStrictEqual(skipped.map(g => g.id), ['a', 'b']);
    assert.strictEqual(reason, 'wrong-media-type', 'the menu tooltip needs to tell these two cases apart');
});

test('empty and junk selections do not throw', async () => {
    const { selectCueAllTargets } = await import(REG);

    assert.deepStrictEqual(selectCueAllTargets('upscale', null, []).eligible, []);
    assert.deepStrictEqual(selectCueAllTargets('upscale', null).eligible, []);
    // A null in the list is dropped rather than crashing the menu that labels off the count.
    assert.deepStrictEqual(
        selectCueAllTargets('upscale', null, [img('a'), null, img('b')]).eligible.map(g => g.id),
        ['a', 'b'],
    );
});

test('CONTRACT: every op the plan promised is eligible, and each is single-required-input', async () => {
    const { selectCueAllTargets, getCommandMediaInputs } = await import(REG);

    const IMAGE_OPS = ['edit', 'krea2Edit', 'kleinEdit', 'qwenEdit', 'i2i', 'control', 'upscale', 'pid', 'i2v'];
    for (const op of IMAGE_OPS) {
        const { eligible, reason } = selectCueAllTargets(op, null, [img('a'), img('b')]);
        assert.strictEqual(eligible.length, 2, `${op} must batch an image selection`);
        assert.strictEqual(reason, null, `${op} must not be refused`);
        const required = getCommandMediaInputs(op).filter(s => s.required);
        assert.strictEqual(required.length, 1, `${op} must declare exactly one required slot`);
    }

    const { eligible: videoEligible } = selectCueAllTargets('extend', null, [vid('a'), vid('b')]);
    assert.strictEqual(videoEligible.length, 2, 'extend must batch a video selection');
});

// ── Which slot the batch varies (Phase 3) ───────────────────────────────────
//
// Raised by Fabio in the app: on `i2v_ms` the role pill (MPI-466) toggles a lone
// staged image between `startFrame` and `endFrame`, so "try five different END
// frames" is a real request. Batching the op's REQUIRED slot would silently run
// all five as start frames instead — a wrong result that looks like a working one.

// Staged chips as `getRunPayload()` hands them over: roles already assigned.
const chip = (role, mediaType = 'image') => ({ id: `staged:${role}`, url: `/s-${role}.png`, mediaType, role });
const card = (mediaType = 'image') => ({ id: 'card', url: '/card.png', mediaType, source: 'app' });

const LTX_MS = { id: 'ltx-23', mediaType: 'video', capabilities: { audio: true } };

test('the batch varies the slot the staged chip expresses, not the required one', async () => {
    const { buildCueAllJobItems } = await import(REG);

    // Untagged lone image reads as startFrame -> unchanged default.
    const asStart = buildCueAllJobItems('i2v_ms', LTX_MS, [chip('startFrame')], card());
    assert.deepStrictEqual(asStart.map(m => [m.id, m.role]), [['card', 'startFrame']]);

    // Pill toggled to endFrame -> the batch sweeps END frames.
    const asEnd = buildCueAllJobItems('i2v_ms', LTX_MS, [chip('endFrame')], card());
    assert.deepStrictEqual(asEnd.map(m => [m.id, m.role]), [['card', 'endFrame']],
        'a pill-tagged endFrame chip must make the batch an endFrame sweep');
});

test('every OTHER staged chip survives — hold the start frame, sweep the end', async () => {
    const { buildCueAllJobItems } = await import(REG);

    const items = buildCueAllJobItems(
        'i2v_ms', LTX_MS, [chip('startFrame'), chip('endFrame')], card());
    assert.deepStrictEqual(items.map(m => [m.id, m.role]), [
        ['staged:startFrame', 'startFrame'],
        ['card', 'endFrame'],
    ], 'the fixed start frame must ride along; only the swept slot is displaced');

    // A staged AUDIO chip is not the batch axis and must not be dropped either.
    const withAudio = buildCueAllJobItems(
        'i2v_ms', LTX_MS, [chip('startFrame'), chip('inputAudio', 'audio')], card());
    assert.deepStrictEqual(withAudio.map(m => m.id), ['card', 'staged:inputAudio']);
});

test('ORDINAL slots keep their order — the batch card never displaces the base image', async () => {
    const { buildCueAllJobItems } = await import(REG);
    const { MODELS } = await import('../js/data/modelConstants/models.js');
    const krea = MODELS.find(m => (m.supportedOps || []).includes('krea2Edit'));
    assert.ok(krea, 'a krea2Edit model must exist for this to mean anything');

    // krea2Edit's slots are ORDINAL: stripOrdinalMediaRoles drops the roles so chip
    // ORDER decides the slot. Appending would put the base image second.
    const items = buildCueAllJobItems(
        'krea2Edit', krea, [chip('inputImage'), chip('inputImage2')], card());
    assert.deepStrictEqual(items.map(m => m.id), ['staged:inputImage', 'card'],
        'the base image must stay at index 0, or the edit runs on the wrong asset');
});

test('nothing staged falls back to the required slot, and junk does not throw', async () => {
    const { buildCueAllJobItems } = await import(REG);

    assert.deepStrictEqual(
        buildCueAllJobItems('i2i', null, [], card()).map(m => [m.id, m.role]),
        [['card', 'inputImage']]);
    assert.deepStrictEqual(buildCueAllJobItems('i2i', null, [], null), []);
    assert.deepStrictEqual(buildCueAllJobItems('i2i', null, [null], card()).length, 1);
});

// ── Phase 3's contract with the dispatcher ──────────────────────────────────
//
// Phase 3 builds ONE media item per job and hands it to `enqueueGeneration`,
// which rejects any job with an unfilled required slot BEFORE it queues —
// `findMissingMediaSlot`, js/services/generationService.js:114. A rejection there
// is a toast and a silent no-op, i.e. exactly the "Cue all does nothing" symptom.
//
// The trap is that the two rules read DIFFERENT slot lists: eligibility filters
// by model (`filterMediaInputsForModel`), the enqueue guard does not. So an op
// whose unfiltered list carries a second required slot of another mediaType would
// pass eligibility and then be refused at enqueue, for every job, forever.
//
// This asserts the invariant that makes that impossible, rather than restating
// the guard: for every (model, op) the helper accepts, EVERY required slot in the
// UNFILTERED list is of the batched mediaType — so a single item satisfies them.
test('CONTRACT: nothing the helper accepts can be refused by the enqueue guard', async () => {
    const { selectCueAllTargets, getCommandMediaInputs } = await import(REG);
    const { MODELS } = await import('../js/data/modelConstants/models.js');

    const byType = { image: img, video: vid, audio: aud };
    let accepted = 0;

    for (const model of MODELS) {
        for (const op of (model.supportedOps || [])) {
            for (const [type, make] of Object.entries(byType)) {
                if (!selectCueAllTargets(op, model, [make('a')]).eligible.length) continue;
                accepted++;
                for (const slot of getCommandMediaInputs(op).filter(s => s.required !== false)) {
                    assert.strictEqual(
                        slot.mediaType, type,
                        `${model.id}/${op} batches ${type} but also requires a ${slot.mediaType} `
                        + `slot (${slot.key}) — every one of its jobs would be refused at enqueue`,
                    );
                }
            }
        }
    }

    // Guards the guard: if the registry ever stops offering a batchable op, this
    // test would pass by testing nothing at all.
    assert.ok(accepted > 0, 'no (model, op) combination was batchable — the sweep tested nothing');
});
