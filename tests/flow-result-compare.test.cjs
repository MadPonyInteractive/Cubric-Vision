/**
 * flow-result-compare.test.cjs — MPI-585.
 *
 * `result: { compare: '<role>' }` is how a Flow asks for the shared before/after
 * surface instead of a plain result element. The role names which INPUT is the
 * "before", and MpiBaseFlow resolves it against the live media slots.
 *
 * The failure this pins is silent by construction: a role the flow does not
 * actually collect resolves to nothing, and the frame's own fallback then paints
 * the plain element — a working-looking result pane with no compare in it, and no
 * error anywhere. A typo'd or renamed role is exactly that bug, so the
 * declaration is checked against the flow's own inputSchema here.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

async function flows() {
    const mod = await esm('js/data/flowsRegistry.js');
    const list = mod.FLOWS || mod.flows || mod.default;
    assert.ok(Array.isArray(list), 'flowsRegistry must export an array of FlowDefs');
    return list;
}

test('every declared result.compare names a role the flow actually collects', async () => {
    for (const flow of await flows()) {
        const role = flow.result?.compare;
        if (!role) continue;
        const roles = (flow.inputSchema?.media || []).flatMap(g => g.roles || []);
        assert.ok(
            roles.includes(role),
            `flow "${flow.id}" declares result.compare "${role}" but collects only [${roles.join(', ')}] — ` +
            'the compare surface would silently fall back to a plain result',
        );
    }
});

test('result.compare is a string when present, and result carries nothing else', async () => {
    for (const flow of await flows()) {
        if (!flow.result) continue;
        assert.strictEqual(typeof flow.result, 'object', `flow "${flow.id}": result must be an object`);
        const keys = Object.keys(flow.result);
        assert.deepStrictEqual(
            keys, ['compare'],
            `flow "${flow.id}": result accepts only \`compare\` today — got [${keys.join(', ')}]`,
        );
        assert.strictEqual(
            typeof flow.result.compare, 'string',
            `flow "${flow.id}": result.compare must be a media role string`,
        );
    }
});

test('ltx-upscale compares against its source video', async () => {
    const upscale = (await flows()).find(f => f.id === 'ltx-upscale');
    assert.ok(upscale, 'ltx-upscale flow must exist');
    // The role bends to the shared op's mediaInputs key, not the `video1` its
    // sibling flows use — see the FlowDef comment.
    assert.strictEqual(upscale.result?.compare, 'inputVideo');
});

test('head-swap compares against the plate it KEEPS, not the head donor', async () => {
    const swap = (await flows()).find(f => f.id === 'head-swap');
    assert.ok(swap, 'head-swap flow must exist');
    // `image2` only donates a head and shares no framing with the output — comparing
    // against it would put two unrelated pictures either side of the bar.
    assert.strictEqual(swap.result?.compare, 'image1');
});

test('scribble-object compares against the photo, which is its ONLY slot (MPI-567)', async () => {
    const scribble = (await flows()).find(f => f.id === 'scribble-object');
    assert.ok(scribble, 'scribble-object flow must exist');
    // Passes the positive test in `04-overlay-and-shell.md` § result.compare: the output
    // IS the input with one region re-rendered, so the bar crosses a steady scene and
    // shows exactly what changed. The generic sweep above already rejects a role the flow
    // does not collect; what this pins is that the declaration EXISTS — with one slot,
    // deleting `result` entirely is the only failure the generic test cannot see.
    //
    // `image2` is not a candidate and never will be: the paint layer is derived by the
    // step, never uploaded, so it is deliberately absent from `inputSchema.media`.
    assert.strictEqual(scribble.result?.compare, 'image1');
});

// ── Option B: the result pane's video surface (MPI-585) ─────────────────────
// These pin WIRING, not behaviour — the surfaces are DOM-only and a node test
// cannot mount them (they were proven live instead, see the card's validation.md).
// What they catch is the silent revert: drop either import and the pane falls back
// to a bare `<video controls>` with no frame stepping, seek bar, loop or volume,
// and nothing anywhere says so.

const fs = require('node:fs');
const read = p => fs.readFileSync(repo(p), 'utf8');

test('the Flow result pane shows video on the REAL player, not a bare <video controls>', () => {
    const src = read('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
    assert.match(src, /import \{ MpiVideoViewer \}/,
        'MpiBaseFlow must mount MpiVideoViewer for a video result');
    assert.match(src, /import \{ MpiVideoControlBar \}/,
        'MpiBaseFlow must mount MpiVideoControlBar — the viewer deliberately does not own it');
    // The bar's seek track IS MpiTrimBar, so showTrim:false would remove the seek
    // bar along with the in/out handles.
    assert.match(src, /MpiVideoControlBar\.mount\([^)]*showTrim:\s*true/s,
        'the Flow player must keep showTrim:true — the seek bar is the trim bar');
});

test('a video control bar the user cannot see does not answer the keyboard', () => {
    const src = read('js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.js');
    // hotkeyManager buckets handlers by KEY, not by registry id, so every bar bound
    // to `space` fires at once. MpiOverlay stashes rather than destroys, so a Group
    // History bar survives under an open Flow: without this gate one space press
    // played the Flow's result AND a hidden History clip (reproduced live).
    assert.match(src, /const _canDrive = \(\) =>/,
        'MpiVideoControlBar must gate its hotkeys on being on screen');
    assert.match(src, /Hotkeys\.bind\(id, \(\) => \{ if \(_canDrive\(\)\)/,
        'every video hotkey must go through the _canDrive gate');
});

test('the flows that deliberately DECLINE a comparison still do', async () => {
    // Not bookkeeping: each is a case where a reveal bar actively misleads, so a
    // future "every flow should have one" sweep has to argue with this test first.
    // ltx-extend's output is LONGER than its source (the bar would compare two
    // different moments); ltx-foley returns the same pixels and only adds audio;
    // character-sheet takes a description and no input media at all, so the bar's
    // left half would be empty.
    //
    // Fabio's ruling, 2026-08-20, which supersedes the earlier "upscale, head swap
    // AND the character sheet get it": a comparison belongs to a flow that CHANGES
    // ITS INPUT, and to no other kind. That is the positive test — not "does this
    // flow have an input", but "does the output modify one".
    for (const id of ['ltx-extend', 'ltx-foley', 'character-sheet']) {
        const flow = (await flows()).find(f => f.id === id);
        assert.ok(flow, `${id} flow must exist`);
        assert.strictEqual(
            flow.result?.compare, undefined,
            `${id} must NOT declare a comparison — see docs/playbooks/add-flow/04 § The result pane`,
        );
    }
});
