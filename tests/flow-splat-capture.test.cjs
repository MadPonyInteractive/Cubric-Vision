/**
 * flow-splat-capture.test.cjs — MPI-623. The `Output_Splat` capture.
 *
 * A splat has no save node to collect from. `MpiBrushTrain` shells out to the Brush
 * binary, which writes the `.ply` itself and returns an ABSOLUTE path on the ENGINE's
 * disk (ComfyUi-MpiNodes splat.py, `return (ply_path,)`). That path reaches the app as
 * text through a `PreviewAny` titled `Output_Splat` — the same contract `Output_prompt`
 * uses, deliberately, rather than a second copy of the image path.
 *
 * The title tap is load-bearing twice over: `MpiBrushTrain` is not an `output_node`, so
 * a graph ending at it is refused (`prompt_no_outputs`) and a graph with other outputs
 * silently PRUNES it — a three-hour bake reporting success and producing nothing.
 *
 * The path is unreadable AS a path: in remote mode the engine is a Pod and its disk is
 * not ours. But the node writes under `<comfy_output>/splats/…`, so `/view` serves it
 * over the same authed proxy as every other output. `splatViewFileInfo` is that
 * derivation and is imported and EXECUTED here. The executor's wiring around it is
 * asserted against the source: `commandExecutor.js` is DOM/engine-bound and does not
 * import under Node, exactly like the gate predicates in output-prompt-capture.test.cjs.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const EXECUTOR = path.join(__dirname, '..', 'js/services/commandExecutor.js');

test('splatViewFileInfo turns the trainer path into a /view file dict', async () => {
    const { splatViewFileInfo } = await import('../js/utils/comfyOutputUrls.js');

    // The authoring bench is Windows; this is the real shape MpiBrushTrain returned on
    // the 2026-09-01 run (tempfile.mkdtemp under `<output>/splats/`).
    assert.deepStrictEqual(
        splatViewFileInfo('D:\\WORK\\Images\\Outputs\\splats\\mpi623_flowtest_a7f3\\export_5000.ply'),
        { filename: 'export_5000.ply', subfolder: 'splats/mpi623_flowtest_a7f3', type: 'output' },
        'a Windows bench path must yield the subfolder relative to the output dir',
    );

    // The Pod is Linux and runs the SAME graph. Both separators, one derivation.
    assert.deepStrictEqual(
        splatViewFileInfo('/workspace/ComfyUI/output/splats/scene_9b21/export_30000.ply'),
        { filename: 'export_30000.ply', subfolder: 'splats/scene_9b21', type: 'output' },
        'a Linux Pod path must yield the same shape — the app never learns the output dir',
    );

    // `subfolder` is everything from the `splats` segment down, not just one level: the
    // node uses mkdtemp today, but /view addresses whatever depth it writes.
    assert.deepStrictEqual(
        splatViewFileInfo('/out/splats/a/b/c/export_5000.ply').subfolder, 'splats/a/b/c',
        'nested output must keep its whole subfolder path');

    // LAST `splats` wins. A project or user folder called `splats` further up would
    // otherwise capture the split and address a directory ComfyUI cannot serve.
    assert.deepStrictEqual(
        splatViewFileInfo('D:\\splats\\archive\\output\\splats\\run_1\\export_5000.ply').subfolder,
        'splats/run_1',
        'the trainer-owned segment is the LAST one, not the first');

    // Separator runs and a trailing-slash-free tail: UNC and doubled separators are real
    // on Windows, and a half-parsed path must not become a half-built URL.
    assert.deepStrictEqual(
        splatViewFileInfo('D:\\\\out\\\\splats\\\\r\\\\export_5000.ply').filename, 'export_5000.ply');
});

test('an unrecognised path is dropped, never half-built into a URL', async () => {
    const { splatViewFileInfo } = await import('../js/utils/comfyOutputUrls.js');

    // A URL missing its subfolder 404s at save time and turns a three-hour bake into a
    // card with a dead `splatPath`. Null is what the executor branches on to drop it.
    assert.strictEqual(splatViewFileInfo('D:\\WORK\\Outputs\\export_5000.ply'), null,
        'no `splats` segment => null, not a bare filename');
    assert.strictEqual(splatViewFileInfo('/out/splats'), null,
        'the segment with nothing after it is a directory, not a file');
    assert.strictEqual(splatViewFileInfo('/out/splats/'), null,
        'a trailing separator must not read as a filename');
    assert.strictEqual(splatViewFileInfo(''), null, 'empty => null');
    assert.strictEqual(splatViewFileInfo(null), null, 'null => null');
    assert.strictEqual(splatViewFileInfo(undefined), null, 'undefined => null');

    // `readComfyOutputText` already returns null for an absent/blank payload; composing
    // the two must stay null rather than throw on the way through.
    const { readComfyOutputText } = await import('../js/utils/comfyOutputUrls.js');
    assert.strictEqual(splatViewFileInfo(readComfyOutputText({ text: ['   '] })), null,
        'a blank PreviewAny payload must not produce a file dict');
});

test('the derived dict builds the /view URL the save path will fetch', async () => {
    const { splatViewFileInfo, buildComfyViewUrl, readComfyOutputText, collectComfyOutputUrls }
        = await import('../js/utils/comfyOutputUrls.js');

    // End to end through the REAL builder, from the payload shape PreviewAny emits
    // (`{"ui": {"text": (value,)}}` → `text: [str]` on the `executed` message).
    const payload = { text: ['D:\\WORK\\Images\\Outputs\\splats\\scene_a7f3\\export_5000.ply'] };
    const url = buildComfyViewUrl('http://127.0.0.1:48188', splatViewFileInfo(readComfyOutputText(payload)));
    assert.strictEqual(
        url,
        'http://127.0.0.1:48188/view?filename=export_5000.ply&type=output&subfolder=splats%2Fscene_a7f3',
        'the URL must carry filename + type=output + the encoded subfolder',
    );

    // The inverse guard, same as the Output_prompt contract: a text payload must never
    // enter the media URL array. A bare path there would reach the gallery and the
    // sidecar as if it were an image.
    const urls = [];
    collectComfyOutputUrls(() => 'URL', payload, urls);
    assert.deepStrictEqual(urls, [], 'an Output_Splat payload contributes no media URLs');
});

test('commandExecutor wires the capture — title set, branch, and forward', () => {
    // STRUCTURAL. commandExecutor.js is DOM/engine-bound and does not import under Node,
    // so these three anchors stand in for execution. Each one is a place where a silent
    // half-wiring is possible: a title that never matches, a branch that never runs, or
    // a value collected and then not forwarded.
    const src = fs.readFileSync(EXECUTOR, 'utf8');

    // Exact title, lowercased — matching `output_prompt` and NOT the numbered
    // image/video sets. A run produces one scene; a numbered sibling would be a second
    // bake nothing downstream is built to receive.
    assert.match(src, /outputSplatNodeIds[\s\S]{0,200}?title\?\.toLowerCase\(\) === 'output_splat'/,
        'the node set must match the title exactly and case-insensitively');

    // The branch must sit in the `executed` handler beside the other collectors, and
    // must go through splatViewFileInfo rather than forwarding the raw path.
    assert.match(src, /outputSplatNodeIds\.has\(nodeId\)[\s\S]{0,400}?splatViewFileInfo\(readComfyOutputText\(nodeOutput\)\)/,
        'the executed branch must derive the file dict from the PreviewAny text');

    // Collected and NOT forwarded is the failure this pins: the capture would work,
    // every test above would pass, and generationService would never see a splat.
    assert.match(src, /onComplete\?\.\(outputUrls, \{[^}]*splatUrl: splatOutputUrl/,
        'splatUrl must ride out on the onComplete side-outputs');

    // The import has to be real — a missing named import is a runtime ReferenceError
    // that only fires on a graph nobody has yet, i.e. months from now.
    assert.match(src, /import \{[^}]*splatViewFileInfo[^}]*\} from '\.\.\/utils\/comfyOutputUrls\.js'/,
        'splatViewFileInfo must be imported from the single-source module');
});
