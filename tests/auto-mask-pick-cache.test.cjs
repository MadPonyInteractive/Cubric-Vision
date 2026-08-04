// MPI-421 (absorbed MPI-402) — a chip toggle must not cost a ComfyUI run.
//
// It used to. `ImpactSEGSPicker` trimmed the SEGS list to the chips selected AT
// DISPATCH, so the mask images only existed for those picks and selecting a
// different chip had to re-dispatch the whole graph. The picker is gone: one
// detect returns every object's mask, and the client composites locally.
//
// Everything below is a structural invariant of that. The expensive halves —
// "does the graph still run" and "does the toggle really skip the dispatch" —
// were verified live against the engine on 48188 (4 detections -> 4 thumbs ->
// 4 masks; the pre-change graph returned 1). What a test can hold is the wiring
// that makes the cache CORRECT, because every failure mode here is silent:
// a mask lands on the wrong object, or the cache is never filled.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const API = JSON.parse(fs.readFileSync(path.join(ROOT, 'comfy_workflows/img_auto_mask.json'), 'utf8'));
const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'comfy_workflows/raw/img_auto_mask.json'), 'utf8'));
const EXECUTOR = fs.readFileSync(path.join(ROOT, 'js/services/commandExecutor.js'), 'utf8');
const VIEWER = fs.readFileSync(
    path.join(ROOT, 'js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js'), 'utf8');

const byTitle = (t) => Object.entries(API).find(([, n]) => n._meta?.title === t);
/** Walk back one link: the node feeding `input` of `nodeId`. */
const upstream = (nodeId, input) => {
    const link = API[nodeId].inputs[input];
    assert.ok(Array.isArray(link), `${nodeId}.${input} is a widget value, expected a link`);
    return link[0];
};

test('the picker is gone from BOTH workflow twins', () => {
    // Both, or the next `sync-raw-workflows.mjs` run regenerates the API json from
    // a raw file that still has it and the re-dispatch quietly comes back.
    const apiPickers = Object.entries(API).filter(([, n]) => n.class_type === 'ImpactSEGSPicker');
    assert.deepStrictEqual(apiPickers.map(([id]) => id), [],
        'ImpactSEGSPicker is back in img_auto_mask.json — a chip toggle now costs a workflow run');
    const rawPickers = RAW.nodes.filter(n => n.type === 'ImpactSEGSPicker');
    assert.deepStrictEqual(rawPickers.map(n => n.id), [], 'ImpactSEGSPicker is back in the raw twin');

    // A LiteGraph link pointing at a node that no longer exists opens the file
    // broken in the ComfyUI editor.
    const ids = new Set(RAW.nodes.map(n => n.id));
    const orphans = RAW.links.filter(l => !ids.has(l[1]) || !ids.has(l[3]));
    assert.deepStrictEqual(orphans, [], 'raw twin has links to deleted nodes');
});

test('masks and thumbs come off the SAME SEGS list', () => {
    // This is the whole basis of the cache: `masks[i]` is the mask for thumb `i`
    // only because both branches iterate one SEGS list in one order. Feed them
    // from different nodes and every pick paints the wrong object — silently,
    // because the counts still match.
    const [outImage] = byTitle('Output_image');
    const toMaskList = upstream(upstream(outImage, 'images'), 'mask');
    assert.strictEqual(API[toMaskList].class_type, 'ImpactSEGSToMaskList');

    const [outDetected] = byTitle('Output_Detected');
    const preview = upstream(upstream(outDetected, 'images'), 'list_input');
    assert.strictEqual(API[preview].class_type, 'SEGSPreview');

    assert.strictEqual(
        upstream(toMaskList, 'segs'), upstream(preview, 'segs'),
        'the mask branch and the thumb branch read different SEGS — index alignment is a lie',
    );
});

test('a bare detect still fills the mask cache', () => {
    // The Output emit used to be suppressed when no chip was selected, which is
    // exactly the run that now has to seed the cache. (It suppressed a real image:
    // measured 2026-08-04, the old picker with an empty picks string emitted ONE
    // arbitrary mask, so the guard was load-bearing then and is wrong now.)
    const at = EXECUTOR.indexOf('const onMessage = (msg)');
    assert.ok(at > 0, 'the autoMask message handler moved — re-anchor this test');
    const handler = EXECUTOR.slice(at, EXECUTOR.indexOf('\n        try {', at));
    assert.ok(!/picks\?\.size/.test(handler),
        'the Output emit is gated on picks again — a bare detect leaves the cache empty and every chip re-dispatches');
    assert.ok(!EXECUTOR.includes('Input_Selected_Masks_Input'),
        'the picker param is back in runAutoMask — it targets a node that no longer exists');
});

test('the detect handle has a terminal, and the viewer ends the run on it', () => {
    // Without onDone there is no signal to clear the status bar or swap Stop back
    // to Detect — the state the card exists to fix.
    assert.ok(/onDone:\s*null/.test(EXECUTOR), 'runAutoMask no longer exposes onDone');
    assert.ok(EXECUTOR.includes('_fireDone()'), 'onDone is declared but never fired');
    assert.ok(VIEWER.includes('exec.onDone'), 'the viewer ignores the run terminal');
    for (const ender of ['_exitAutoMaskMode', 'el.cancelAutoMaskDetect', 'el.destroy']) {
        assert.ok(VIEWER.indexOf(ender) > 0, `${ender} is gone`);
    }
    // A run in flight owns the status bar; every path that abandons it must end it.
    const ends = VIEWER.match(/_endAutoMaskRun\(/g) || [];
    assert.ok(ends.length >= 4, `only ${ends.length} _endAutoMaskRun call sites — an abandoned run strands an active bar`);
});

test('picking a chip composites locally instead of re-running the graph', () => {
    const at = VIEWER.indexOf("autoMaskThumbs.on('change'");
    assert.ok(at > 0, "the thumbs 'change' handler moved — re-anchor this test");
    const handler = VIEWER.slice(at, VIEWER.indexOf('\n        });', at));
    assert.ok(handler.includes('_applyPicksFromCache'),
        'a chip toggle no longer goes through the cache');
    // The ONE surviving dispatch is the cold-rehydrate fallback, and it must stay
    // behind the empty-cache check — unguarded, this is the original bug.
    const dispatches = handler.match(/_runAutoMaskWorkflow\(/g) || [];
    assert.strictEqual(dispatches.length, 1,
        `the change handler dispatches ${dispatches.length} times; only the empty-cache fallback may`);
    assert.ok(/if \(!_autoMaskUrls\.length\)[\s\S]{0,80}_runAutoMaskWorkflow/.test(handler),
        'the surviving dispatch is not gated on an empty cache');
});
