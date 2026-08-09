'use strict';
// MPI-483 — the volume's two accountings, compared from ONE /wrapper/ls response.
//
// The card's question is whether a partially downloaded aria2 `.part` inflates the
// volume usage the install pre-flight subtracts. /wrapper/disk answers with ALLOCATED
// BLOCKS (`du -s --block-size=1`); /wrapper/ls additionally reports APPARENT lengths
// (`os.path.getsize`) per file. Their gap is the phantom.
//
// Measuring it from the app side does not work and a live session on 2026-08-09 proved
// it: /wrapper/disk caches its `du` for 60s (invalidated only by an install completing
// or a delete) and the app's downloadedBytes lags the wrapper by seconds — gigabytes at
// the 250-460MB/s a Pod pulls from R2 — so two runs of the same experiment returned
// 13.61GB and 0.00GB for the same question. One response, one instant, no race.
const assert = require('assert');
const { compareVolumeAccounting } = require('../routes/remotePodLifecycle');

const ls = ({ top, modelsDir = '/workspace/models', total }) => ({
    success: true,
    mount: '/workspace',
    models_dir: modelsDir,
    models_total_bytes: total,
    top_level: top,
});

// 1. THE CASE THE CARD IS ABOUT: a sparse .part — apparent far exceeds blocks, so the
//    pre-fix `du -sb` would have over-counted the volume by the gap.
{
    const out = compareVolumeAccounting(ls({
        top: [{ name: 'models', path: '/workspace/models', size_bytes: 1_000_000_000, is_dir: true }],
        total: 14_000_000_000,
    }));
    assert.strictEqual(out.blockBytes, 1_000_000_000);
    assert.strictEqual(out.apparentBytes, 14_000_000_000);
    assert.strictEqual(out.phantomBytes, 13_000_000_000,
        'a sparse .part must surface as apparent-minus-blocks, the bytes the old gate invented');
    assert.strictEqual(out.approximate, false, 'top_level names MODELS_DIR itself — exact');
}

// 2. Fully-allocated partial: blocks match apparent, so the fix changes nothing here.
//    This is the outcome that would mean the card's premise does not hold on RunPod.
{
    const out = compareVolumeAccounting(ls({
        top: [{ name: 'models', path: '/workspace/models', size_bytes: 14_000_000_000, is_dir: true }],
        total: 14_000_000_000,
    }));
    assert.strictEqual(out.phantomBytes, 0, 'no sparseness ⇒ no phantom ⇒ nothing for the fix to remove');
}

// 3. MODELS_DIR nested under a top-level dir: attribute blocks to the ANCESTOR and say
//    so, rather than silently reporting a number that also counts its siblings.
{
    const out = compareVolumeAccounting(ls({
        modelsDir: '/workspace/ComfyUI/models',
        top: [
            { name: 'ComfyUI', path: '/workspace/ComfyUI', size_bytes: 5_000_000_000, is_dir: true },
            { name: 'other', path: '/workspace/other', size_bytes: 9_000_000_000, is_dir: true },
        ],
        total: 6_000_000_000,
    }));
    assert.strictEqual(out.countedDir, '/workspace/ComfyUI', 'must pick the ancestor, not the biggest dir');
    assert.strictEqual(out.blockBytes, 5_000_000_000);
    assert.strictEqual(out.approximate, true, 'ancestor holds more than models — flag it');
}

// 4. Longest match wins when both an ancestor and MODELS_DIR itself are listed.
{
    const out = compareVolumeAccounting(ls({
        modelsDir: '/workspace/ComfyUI/models',
        top: [
            { name: 'ComfyUI', path: '/workspace/ComfyUI', size_bytes: 5_000_000_000, is_dir: true },
            { name: 'models', path: '/workspace/ComfyUI/models', size_bytes: 3_000_000_000, is_dir: true },
        ],
        total: 4_000_000_000,
    }));
    assert.strictEqual(out.countedDir, '/workspace/ComfyUI/models');
    assert.strictEqual(out.approximate, false);
}

// 5. A sibling whose path is a string prefix must NOT match: `/workspace/model` is not
//    an ancestor of `/workspace/models`. Plain `startsWith(p)` takes it and then reports
//    the WRONG directory's blocks against the models total — a fabricated gap. This case
//    is the negative control for the separator in `startsWith(`${p}/`)`; it was first
//    written with the prefix the other way round, which the mutation proved was
//    guarding nothing.
{
    const out = compareVolumeAccounting(ls({
        top: [{ name: 'model', path: '/workspace/model', size_bytes: 7_000_000_000, is_dir: true }],
        total: 1_000_000_000,
    }));
    assert.strictEqual(out, null, 'a string-prefix sibling is not the owning directory');
}

// 6. Unusable answers degrade to null — never a fabricated gap. A `du` that failed
//    reports size_bytes: null, which must not be read as zero blocks (that would
//    invent a phantom equal to the entire apparent total).
{
    assert.strictEqual(compareVolumeAccounting(null), null);
    assert.strictEqual(compareVolumeAccounting({ success: false }), null);
    assert.strictEqual(compareVolumeAccounting(ls({ top: [], total: 5 })), null);
    assert.strictEqual(compareVolumeAccounting(ls({
        top: [{ name: 'models', path: '/workspace/models', size_bytes: null, is_dir: true }],
        total: 5_000_000_000,
    })), null, 'a failed du must not be counted as zero blocks');
}

console.log('volume-accounting-gap: all assertions passed');
