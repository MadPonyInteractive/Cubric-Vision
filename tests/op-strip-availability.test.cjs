/**
 * op-strip-availability.test.cjs — MPI-356.
 *
 * The op strip renders whatever getAvailableCommands returns, so three registry
 * contracts became load-bearing:
 *
 *  1. Every strip-eligible op carries a `short` — a missing one renders a blank
 *     chip and sorts to the end of the strip.
 *  2. Results come back in canonical OP_ORDER, so an op holds roughly the same
 *     position across models (the reason ops left the radial: its item angles
 *     are computed from the FILTERED count, so changing model rotated the ring).
 *  3. Absent vs disabled are different states. A mask op in a workspace with no
 *     mask tool (Gallery) must be ABSENT — a dimmed item the user can never
 *     light up is dead weight. Missing a mask in a workspace that HAS the tool
 *     stays present-but-unavailable, because painting one fixes it.
 *
 * The last test pins the sort against _pickFallbackOp (MpiPromptBox): that
 * function sorts candidates by media capacity, and Array#sort is stable, so
 * reordering the registry output could have silently changed which op the box
 * lands on when chips are added or cleared. It must not.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const KREA2 = { mediaType: 'image', supportedOps: ['t2i', 'i2i', 'depth', 'krea2Edit', 'upscale', 'detail'] };
const keys = list => list.map(c => c.key);

test('every strip-eligible op has a short, and every short is a known verb', async () => {
    const { commands, OP_ORDER } = await import('../js/data/commandRegistry.js');
    const stripOps = Object.entries(commands).filter(([, c]) => !c.stub && !c.universal && c.mediaType);
    assert.deepStrictEqual(stripOps.filter(([, c]) => !c.short).map(([k]) => k), [],
        'strip-eligible ops must declare a short label');
    assert.deepStrictEqual(stripOps.filter(([, c]) => !OP_ORDER.includes(c.short)).map(([k]) => k), [],
        'every short must appear in OP_ORDER or it sorts to the end of the strip');
});

test('inpaint replaces change/remove: mask-gated, prompt-optional, one op', async () => {
    const { commands } = await import('../js/data/commandRegistry.js');
    assert.ok(!commands.change && !commands.remove,
        'change/remove are retired — inpaint covers both (deprecated in operationRegistry, not here)');
    // Prompt-optional is what lets ONE op do both jobs: with a prompt it replaces
    // the masked area, empty it erases and fills. Flip this and removal is gone.
    assert.strictEqual(commands.inpaint.promptRequired, false);
    assert.strictEqual(commands.inpaint.requiresMask, true);
});

test('results come back in canonical order, not registry or supportedOps order', async () => {
    const { getAvailableCommands } = await import('../js/data/commandRegistry.js');
    assert.deepStrictEqual(
        keys(getAvailableCommands('image', KREA2, { imageCount: 1 })),
        ['t2i', 'i2i', 'depth', 'krea2Edit', 'upscale', 'detail']);

    const WAN = { mediaType: 'video', supportedOps: ['i2v_ms', 't2v_ms'] };
    assert.deepStrictEqual(keys(getAvailableCommands('video', WAN, {})), ['t2v_ms', 'i2v_ms'],
        'video ops sort by verb too, ignoring supportedOps order');
});

test('mask ops: absent without a mask TOOL, dimmed without a mask', async () => {
    const { getAvailableCommands } = await import('../js/data/commandRegistry.js');

    const gallery = getAvailableCommands('image', KREA2, { imageCount: 1, canMask: false });
    assert.strictEqual(gallery.find(c => c.key === 'detail'), undefined,
        'no mask tool in this workspace -> the op is not rendered at all');

    const history = getAvailableCommands('image', KREA2, { imageCount: 1, canMask: true });
    assert.strictEqual(history.find(c => c.key === 'detail').available, false,
        'mask tool present but nothing painted -> present, dimmed, fixable');
    assert.strictEqual(
        getAvailableCommands('image', KREA2, { imageCount: 1, canMask: true, hasMask: true })
            .find(c => c.key === 'detail').available, true);

    assert.ok(getAvailableCommands('image', KREA2, { imageCount: 1 }).some(c => c.key === 'detail'),
        'omitting canMask must not silently hide mask ops from a caller that never opted in');
});

test('the canonical sort does not change which op _pickFallbackOp lands on', async () => {
    const { commands, getAvailableCommands } = await import('../js/data/commandRegistry.js');

    const maxSlots = (key, mediaType) => {
        const cmd = commands[key];
        const declared = Array.isArray(cmd.mediaInputs)
            ? cmd.mediaInputs.filter(s => s.mediaType === mediaType).length
            : 0;
        const min = mediaType === 'image' ? cmd.requiresImages : cmd.requiresVideo;
        return declared || Math.max(0, Number(min) || 0);
    };
    // Mirror of MpiPromptBox._pickFallbackOp (importing it pulls the app graph).
    const pickFallback = (cmds, imgN, vidN) => {
        const candidates = cmds.filter(c => (c.requiresImages ?? 0) > 0 || (c.requiresVideo ?? 0) > 0);
        const fitting = candidates
            .filter(c => maxSlots(c.key, 'image') >= imgN && maxSlots(c.key, 'video') >= vidN)
            .sort((a, b) => maxSlots(a.key, 'image') - maxSlots(b.key, 'image'));
        const pool = fitting.length ? fitting : candidates;
        return (pool.find(c => c.available) ?? pool[0])?.key ?? null;
    };
    const registryOrder = list => {
        const order = Object.keys(commands);
        return [...list].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    };

    for (const imageCount of [0, 1, 2, 3]) {
        const sorted = getAvailableCommands('image', KREA2, { imageCount });
        assert.strictEqual(
            pickFallback(sorted, imageCount, 0),
            pickFallback(registryOrder(sorted), imageCount, 0),
            `fallback op changed at imageCount=${imageCount}`);
    }
});

/**
 * MPI-360 — the "?" guide. getOpHelp is the only lookup the dialog performs, so
 * three things are load-bearing: it never returns an empty popup, a per-model
 * override merges rather than replaces, and the inpaint entry keeps teaching the
 * empty-prompt erase (the prompt IS that op's router).
 */
test('getOpHelp falls back to the info one-liner when an op has no authored guide', async () => {
    const { getOpHelp, commands } = await import('../js/data/commandRegistry.js');

    const bare = Object.entries(commands).find(([, c]) => !c.help && c.info);
    assert.ok(bare, 'expected at least one op with info but no help block');
    const help = getOpHelp(bare[0]);
    assert.ok(help.body.length > 0, 'a guide with no authored body must fall back to info, not render empty');
    assert.ok(!/—/.test(help.body[0]), 'the "Label — " prefix belongs to the title, not the body');
    assert.strictEqual(help.title, commands[bare[0]].label);

    assert.strictEqual(getOpHelp('no-such-op'), null);
});

test('getOpHelp merges a per-model override over the base instead of replacing it', async () => {
    const { getOpHelp } = await import('../js/data/commandRegistry.js');

    const base = getOpHelp('t2i');
    const sdxl = getOpHelp('t2i', { id: 'sdxl-realistic', type: 'sdxl' });
    const krea2 = getOpHelp('t2i', { id: 'krea2', type: 'krea2' });

    assert.notDeepStrictEqual(sdxl.body, base.body, 'sdxl overrides t2i body (keywords, not prose)');
    assert.deepStrictEqual(krea2.body, base.body, 'a model with no override gets the base guide');
    assert.strictEqual(sdxl.title, base.title, 'unspecified keys survive the merge');
});

test('the inpaint guide teaches the empty prompt and warns off delete instructions', async () => {
    const { getOpHelp } = await import('../js/data/commandRegistry.js');
    const help = getOpHelp('inpaint');

    assert.ok(help.examples.some(e => e.prompt === ''),
        'the empty prompt is the erase path — it must appear as an example');
    assert.ok(help.examples.some(e => e.bad === true),
        'the "remove the X" mistake must be marked bad, not merely described');
});

/**
 * MPI-354 — depth takes a SECOND, optional image on Klein only.
 *
 * Klein runs all seven ops from one master graph, and its depth branch shares the
 * edit branch's ReferenceLatent chain: image 1 supplies the depth, image 2 supplies
 * the subject posed into it. Krea2/SDXL depth has no such input and must stay
 * one-image — but all three share the single `depth` op def, so the slot is
 * capability-gated rather than declared per model.
 *
 * Both directions are pinned: the slot must APPEAR for a model declaring
 * `depthSubject`, and must be ABSENT everywhere else — including in the op-fit
 * count, or Krea2 depth would light up with two chips staged and then inject an
 * image its graph never reads.
 */
const KLEIN = {
    id: 'klein-4b', type: 'klein', mediaType: 'image',
    supportedOps: ['t2i', 'i2i', 'depth', 'kleinEdit', 'inpaint', 'detail', 'upscale'],
    capabilities: { depthSubject: true },
};

test('depth exposes its optional subject slot on Klein and hides it everywhere else', async () => {
    const { getCommandMediaInputs, filterMediaInputsForModel } = await import('../js/data/commandRegistry.js');
    const raw = getCommandMediaInputs('depth');

    const klein = filterMediaInputsForModel(raw, KLEIN);
    assert.deepStrictEqual(klein.map(s => s.title), ['Input_Image', 'Input_Image_2']);
    assert.strictEqual(klein[1].required, false, 'the subject image must stay optional — depth alone still runs');

    const krea2 = filterMediaInputsForModel(raw, KREA2);
    assert.deepStrictEqual(krea2.map(s => s.title), ['Input_Image'],
        'a model without capabilities.depthSubject must never see the second slot');
});

test('the gated slot widens op-fit for Klein only', async () => {
    const { getAvailableCommands } = await import('../js/data/commandRegistry.js');
    const depthOf = (model, imageCount) =>
        getAvailableCommands('image', model, { imageCount, canMask: true }).find(c => c.key === 'depth');

    assert.strictEqual(depthOf(KLEIN, 2)?.available, true, 'Klein depth accepts two images');
    assert.strictEqual(depthOf(KLEIN, 1)?.available, true, 'and still accepts one');
    assert.strictEqual(depthOf(KREA2, 2)?.available, false, 'Krea2 depth must NOT light up on two chips');
    assert.strictEqual(depthOf(KREA2, 1)?.available, true, 'Krea2 depth unchanged on one');
});

test('the depth guide teaches the two-image meaning on Klein only', async () => {
    const { getOpHelp } = await import('../js/data/commandRegistry.js');
    const base = getOpHelp('depth');
    const klein = getOpHelp('depth', KLEIN);

    assert.notDeepStrictEqual(klein.body, base.body, 'Klein depth has its own guide');
    assert.ok(klein.body.some(p => /second image/i.test(p)),
        'the Klein guide must explain what the second image does — it changes the op');
    assert.deepStrictEqual(getOpHelp('depth', KREA2).body, base.body,
        'every other model keeps the one-image guide');
});

/**
 * MPI-354 — the ratio picker is hidden on ops that size themselves from the input.
 *
 * Klein's depth and edit scale the input image to a megapixel target and never read
 * Input_Width/Height, so the picker there is not merely inert — it tells the user they
 * chose an output shape they will not get. Krea2/SDXL depth DOES generate at our
 * dimensions and shares the same `depth` op, so the gate is per model.
 */
test('the ratio picker is hidden only on a model\'s declared image-sized ops', async () => {
    const { modelShowsRatio } = await import('../js/data/commandRegistry.js');
    const klein = { ...KLEIN, imageSizedOps: ['depth', 'kleinEdit'] };

    assert.strictEqual(modelShowsRatio(klein, 'depth'), false, 'Klein depth inherits the input shape');
    assert.strictEqual(modelShowsRatio(klein, 'kleinEdit'), false, 'Klein edit inherits the input shape');
    assert.strictEqual(modelShowsRatio(klein, 't2i'), true, 'Klein t2i still takes a ratio');
    assert.strictEqual(modelShowsRatio(klein, 'i2i'), true, 'Klein i2i still takes a ratio');

    // The negative control that matters: a model with no declaration keeps every picker.
    // NOTE the KREA2 fixture (line 28) declares no imageSizedOps, so this pins the
    // DEFAULT, not Krea2's real behaviour — the shipped Krea2 has had depth in
    // imageSizedOps since MPI-365. Do not read this line as a claim about that model.
    assert.strictEqual(modelShowsRatio(KREA2, 'depth'), true,
        'a model declaring no imageSizedOps keeps the ratio picker on every op');
    assert.strictEqual(modelShowsRatio(null, 'depth'), true, 'no model = no gate');
});

test('Klein declares exactly the two ops that derive their own size', async () => {
    const { getModelById } = await import('../js/data/modelRegistry.js');
    const klein = getModelById('klein-4b');
    assert.deepStrictEqual(klein.imageSizedOps, ['depth', 'kleinEdit']);
    // Every declared op must be one this model actually runs, or the entry is dead.
    for (const op of klein.imageSizedOps) {
        assert.ok(klein.supportedOps.includes(op), `${op} must be in supportedOps`);
    }
});

// ── MPI-365: Chroma depth is image-sized, and batch is op-gated ────────────────
// Both bugs below shipped and were user-reported on 2026-08-02. Neither raised an
// error — a wrong ratio padded the gallery card, and a dead batch quietly returned
// one image — which is exactly why they need pinning rather than eyeballing.

test('Chroma depth inherits the input shape, so it must not offer a ratio', async () => {
    const { modelShowsRatio } = await import('../js/data/commandRegistry.js');
    const { getModelById } = await import('../js/data/modelRegistry.js');

    for (const id of ['chroma-flash', 'chroma-hyper']) {
        const m = getModelById(id);
        // Traced in chroma_t2i.json: depth's latent is VAEEncode 2762 <-
        // ImageScaleToTotalPixels(megapixels: 1) <- Input_Image. MpiCrop (2682), which
        // DOES read Input_Width/Height, feeds the i2i latent (VAEEncode 2616) instead —
        // that mix-up is what left depth out of imageSizedOps in the first place.
        assert.strictEqual(modelShowsRatio(m, 'depth'), false, `${id} depth must hide the ratio picker`);
        assert.strictEqual(modelShowsRatio(m, 'detail'), false, `${id} detail is image-sized`);
        assert.strictEqual(modelShowsRatio(m, 'upscale'), false, `${id} upscale is image-sized`);
        // The control: only t2i samples EmptyLatentImage(Input_Width, Input_Height).
        assert.strictEqual(modelShowsRatio(m, 't2i'), true, `${id} t2i still takes a ratio`);
    }

    // SDXL is the cross-model negative control: its depth switches the CONDITIONING
    // pipe and keeps sampling the empty latent, so it genuinely honours the picker.
    assert.strictEqual(modelShowsRatio(getModelById('sdxl-realistic'), 'depth'), true,
        'SDXL depth generates at our dimensions — it must keep the ratio picker');
});

test('batch is hidden on ops whose latent is VAE-encoded', async () => {
    const { modelShowsBatch } = await import('../js/data/commandRegistry.js');
    const { getModelById } = await import('../js/data/modelRegistry.js');

    // Input_Batch_Size reaches only EmptyLatentImage, and on Chroma only t2i samples it.
    const chroma = getModelById('chroma-flash');
    assert.strictEqual(modelShowsBatch(chroma, 't2i'), true, 'Chroma t2i batches for real');
    for (const op of ['i2i', 'depth', 'detail', 'upscale']) {
        assert.strictEqual(modelShowsBatch(chroma, op), false, `Chroma ${op} must not offer batch`);
    }

    // SDXL keeps depth — different graph shape, same field. If these two models ever
    // agree on this list, one of them is wrong.
    const sdxl = getModelById('sdxl-realistic');
    assert.strictEqual(modelShowsBatch(sdxl, 't2i'), true, 'SDXL t2i batches');
    assert.strictEqual(modelShowsBatch(sdxl, 'depth'), true, 'SDXL depth samples the empty latent, so it batches');
    assert.strictEqual(modelShowsBatch(sdxl, 'i2i'), false, 'SDXL i2i is VAE-encoded — no batch');

    // Defaults: silence means "every op", so no undeclared model changed behaviour.
    assert.strictEqual(modelShowsBatch({ supportedOps: ['t2i'] }, 't2i'), true, 'no batchOps = batch everywhere');
    assert.strictEqual(modelShowsBatch(null, 't2i'), true, 'no model = no gate');
    // The model-wide switch still wins over the per-op list.
    assert.strictEqual(modelShowsBatch({ capabilities: { batch: false }, batchOps: ['t2i'] }, 't2i'), false,
        'capabilities.batch false overrides batchOps');
});

test('every declared batchOp is an op the model actually runs', async () => {
    const { MODELS } = await import('../js/data/modelConstants/models.js');
    let declared = 0;
    for (const m of MODELS) {
        if (!Array.isArray(m.batchOps)) continue;
        declared++;
        for (const op of m.batchOps) {
            assert.ok(m.supportedOps.includes(op), `${m.id}: batchOps names ${op}, which it does not support`);
        }
    }
    // Guards against the field being silently dropped in a refactor: 2 Chroma + 5 SDXL.
    assert.strictEqual(declared, 7, 'exactly the 7 models with partial batch support declare batchOps');
});

test('style strength defaults per model, without disturbing op defaults', async () => {
    const { getCommandDefault } = await import('../js/data/commandRegistry.js');
    const { getModelById } = await import('../js/data/modelRegistry.js');
    const { PROMPT_CONTROL_DEFAULTS } = await import('../js/data/promptControlDefaults.js');

    // Mirror of PromptBoxControls._resolveDefault (importing it pulls the app graph).
    // Three layers, most specific first: OP, then MODEL, then the global constant.
    const resolve = (controlId, model, opName) => {
        if (opName) {
            const opDefault = getCommandDefault(opName, controlId);
            if (opDefault !== undefined) return opDefault;
        }
        const modelDefault = model?.controlDefaults?.[controlId];
        if (modelDefault !== undefined) return modelDefault;
        return PROMPT_CONTROL_DEFAULTS[controlId];
    };

    // Both Chroma checkpoints are heavily distilled — the rack artefacts at 0.8/1.0 —
    // and 0.6 is what the graph's Input_Style_Selector.strength_model is baked to.
    for (const id of ['chroma-flash', 'chroma-hyper']) {
        const m = getModelById(id);
        assert.strictEqual(m.controlDefaults.stylization, 0.6, `${id} declares 0.6`);
        for (const op of m.styleOps) {
            assert.strictEqual(resolve('stylization', m, op), 0.6,
                `${id} ${op} must start at 0.6, not the global ${PROMPT_CONTROL_DEFAULTS.stylization}`);
        }
    }

    // The two negative controls that stop this becoming a global change.
    assert.strictEqual(resolve('stylization', getModelById('krea2'), 't2i'),
        PROMPT_CONTROL_DEFAULTS.stylization, 'a model declaring nothing keeps the global default');
    assert.strictEqual(resolve('stylization', getModelById('qwen-edit'), 'qwenEdit'), 0.8,
        'an OP default still outranks a model default — qwenEdit stays 0.8');
});
