'use strict';

/**
 * A saved output must be named after the thing the user picked (MPI-660).
 *
 * Output media is filed as `<prefix>_NNN.<ext>`, and that stem IS the gallery card's
 * name. The prefix used to be the OP KEY, which is an internal id: the Flow titled
 * "Text to Speech" runs on `flowChatterBox`, so its card read `flowChatterBox_001`
 * under a chip saying FLOW: TEXT TO SPEECH — a Flow name the Library does not have.
 * The same held on the prompt box, where one visible "Edit" is four keys
 * (edit/krea2Edit/qwenEdit/kleinEdit), "Upscale" is also `pid`, and the video ops
 * carry an `_ms` suffix that means nothing outside the registry.
 *
 * `getFilePrefix` resolves it: explicit `filePrefix`, else the op strip's own `short`,
 * else the key. This pins the INVARIANT rather than the table — every file-producing
 * op's prefix must be a name the UI shows: its strip code, or its label spelled out
 * (`flowDrawItIn` ← "Draw It In") or as initials (`flowTTS` ← "Text to Speech"). A new
 * op named after its model or its graph fails here instead of shipping a card named
 * after something the user cannot find.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const read = p => require('node:fs').readFileSync(path.join(__dirname, '..', p), 'utf8');
const esm = p => import('file://' + path.join(__dirname, '..', p).replace(/\\/g, '/'));

// Ops that never reach save-generation, so they have no filename to get wrong:
// the two group actions are pure gallery restructuring, and `autoMaskImg` returns a
// mask into the canvas through its own executor path.
const SAVES_NOTHING = new Set(['createGroupFromSelection', 'promoteToNewGroup', 'autoMaskImg']);

const compact  = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const initials = s => s.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toLowerCase();
const deFlow   = s => compact(s).replace(/^flow/, '');

/** The prefix reads as this label if it spells it out or abbreviates it to its initials. */
function readsAs(prefix, label) {
    const clean = label.replace(/^Flow:\s*/, '');
    return deFlow(prefix) === compact(clean) || deFlow(prefix) === initials(clean);
}

test('every file-producing op is filed under a name the UI shows', async () => {
    const { commands, getFilePrefix } = await esm('js/data/commandRegistry.js');

    const offenders = [];
    for (const [key, cmd] of Object.entries(commands)) {
        if (SAVES_NOTHING.has(key) || cmd.outputKind === 'text') continue;
        const prefix = getFilePrefix(key);
        if (prefix === cmd.short || readsAs(prefix, cmd.label)) continue;
        offenders.push(`${cmd.label} → ${prefix}_001`);
    }

    assert.deepEqual(offenders, [],
        'give the op a `short`, or a `filePrefix`, that matches what the user picked it by');
});

test('every Flow files its output under its own title', async () => {
    const { FLOWS } = await esm('js/data/flowsRegistry.js');
    const { getCommand, getFilePrefix } = await esm('js/data/commandRegistry.js');

    // The one op a Flow borrows rather than owns: `ltxVideoUpscale` is ALSO the
    // `ltx-video-upscaler` plugin under the Upscale tool, where the run is not a Flow
    // at all — so it keeps its own key and a Flow-shaped prefix would lie there.
    const BORROWED = new Set(['ltxVideoUpscale']);

    const offenders = [];
    for (const flow of FLOWS) {
        if (BORROWED.has(flow.operation)) continue;
        assert.ok(getCommand(flow.operation),
            `Flow "${flow.title}" dispatches ${flow.operation}, which is not a command`);
        const prefix = getFilePrefix(flow.operation);
        // Against the FLOW's title, not the command's label: the Library is where the
        // user read the name, and the two are free to drift apart.
        if (!readsAs(prefix, flow.title)) offenders.push(`${flow.title} → ${prefix}_001`);
    }

    assert.deepEqual(offenders, [], 'set CommandDef.filePrefix so the file reads as the Flow');
});

// The tool routes (crop, composite, concat, reverse) name their own output with a
// literal rather than through a command, so the op test above cannot see them. They
// only have to agree with everything else: one camelCase word, no `video_crop`.
test('the tool routes name their output in the same convention as the ops', () => {
    const offenders = [];
    for (const file of ['projects.js', 'videoCrop.js', 'videoReverse.js', 'videoConcat.js']) {
        const src = read(`routes/${file}`);
        for (const [, prefix] of src.matchAll(/[nN]extSequence(?:dName)?\([^)]*?'([^']+)'\s*,\s*(?:'\w+'|\w+)\)/g)) {
            if (!/^[a-z][a-zA-Z0-9]*$/.test(prefix)) offenders.push(`routes/${file}: ${prefix}_001`);
        }
    }
    assert.deepEqual(offenders, [], 'sequenced output prefixes are camelCase, like every op key');
});

// The three hops that carry the prefix are wiring, and none of them can run headless
// (the save needs a live ComfyUI output to download). Dropped anywhere along the way it
// silently falls back to the op key — the exact bug this fixes, back again.
test('the prefix survives the trip from the registry to the sequence allocator', () => {
    const gen = read('js/services/generationService.js');
    // MPI-663 put a per-output label in FRONT of this as a `||` fallback (a multi-audio
    // run names each card for the stem the graph saved), so the op prefix is no longer
    // the whole expression — but it must stay the fallback, or every non-stems run loses
    // its name again.
    assert.match(gen, /filePrefix: (?:\w+\(url\) \|\| )?getFilePrefix\(operation\)/,
        'generationService must resolve the prefix for the op it is running');

    const svc = read('js/services/projectService.js');
    const call = svc.slice(svc.indexOf('export async function saveGeneration'));
    const body = call.slice(0, call.indexOf('});'));
    assert.ok((body.match(/filePrefix/g) || []).length >= 2,
        'saveGeneration must both accept filePrefix and put it in the POST body');

    const routes = read('routes/projects.js');
    assert.match(routes, /const prefix = String\(filePrefix \|\| operation\)/,
        'the server must prefer filePrefix and fall back to the op key');
    // `operation` is stamped in every sidecar and versioned in operationRegistry.js.
    // Renaming it instead of the filename would orphan Reuse on every existing card.
    assert.match(routes, /operation = 'generated', filePrefix = null/,
        'filePrefix must be a separate field, not a replacement for operation');
});
