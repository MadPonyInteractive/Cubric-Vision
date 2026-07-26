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

const KREA2 = { mediaType: 'image', supportedOps: ['t2i', 'i2i', 'poseReference', 'krea2Edit', 'upscale', 'detail'] };
const keys = list => list.map(c => c.key);

test('every strip-eligible op has a short, and every short is a known verb', async () => {
    const { commands, OP_ORDER } = await import('../js/data/commandRegistry.js');
    const stripOps = Object.entries(commands).filter(([, c]) => !c.stub && !c.universal && c.mediaType);
    assert.deepStrictEqual(stripOps.filter(([, c]) => !c.short).map(([k]) => k), [],
        'strip-eligible ops must declare a short label');
    assert.deepStrictEqual(stripOps.filter(([, c]) => !OP_ORDER.includes(c.short)).map(([k]) => k), [],
        'every short must appear in OP_ORDER or it sorts to the end of the strip');
});

test('results come back in canonical order, not registry or supportedOps order', async () => {
    const { getAvailableCommands } = await import('../js/data/commandRegistry.js');
    assert.deepStrictEqual(
        keys(getAvailableCommands('image', KREA2, { imageCount: 1 })),
        ['t2i', 'i2i', 'poseReference', 'krea2Edit', 'upscale', 'detail']);

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
