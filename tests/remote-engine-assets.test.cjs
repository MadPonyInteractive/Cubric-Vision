'use strict';
// MPI-380 — every engineAsset must have a route to a Pod.
//
// An `engineAsset` weight is universal: it belongs to no model, so it never appears
// in any model's dep list. The LOCAL engine heals that at boot (/engine/repair-deps
// unions missing+drifted straight from the live DEPS map). The REMOTE engine had NO
// equivalent — its only delivery mechanism was the hand-maintained `dl` block in the
// Pod Dockerfile, which lives in a DIFFERENT REPO (mpi-ci). So an engineAsset added
// after the last image build reached a Pod never, and the failure surfaced as a 503
// mid-generation on a billed Pod rather than at build time.
//
// Live case: sam3-multiplex (1.75GB) shipped with the SAM3 masking tools and was
// unreachable on every Pod — the dep entry landed, the Dockerfile never moved.
//
// The fix makes remote DERIVED like local: an engineAsset is volume-installed at
// connect unless it is flagged `bakedOnPod` (already in the image) or carries
// `targetPath` (baked inside a node folder). Unflagged is the SAFE default — it costs
// a volume download, never a broken engine.
const assert = require('assert');
const { _isImageResident } = require('../routes/remoteModels');
const { DEPS } = require('../js/data/modelConstants/dependencies.js');

// The same filter shell.js `_installRemoteEngineAssets` applies. Kept in lockstep
// here on purpose: if that predicate changes, this test should fail and be re-read.
const volumeEngineAssets = () => Object.values(DEPS)
    .filter(d => d && d.engineAsset === true && !d.bakedOnPod && !d.targetPath)
    .map(d => d.id);

// 1. THE BUG: sam3 must be in the volume-install set. Before the fix this set did not
//    exist and the weight reached a Pod by no path at all.
{
    assert.ok(volumeEngineAssets().includes('sam3-multiplex'),
        'sam3-multiplex must be volume-installed on remote — it is NOT in the Pod image');
}

// 2. A baked engineAsset reports image-resident, so it is never re-downloaded onto the
//    volume. Without this the 5 flagged weights cost ~950MB of duplicate bytes that
//    ComfyUI already scans from the image.
{
    assert.strictEqual(_isImageResident(DEPS['sam-vit-b']), true,
        'sam-vit-b is baked into the Pod image — must report image-resident');
    assert.strictEqual(_isImageResident(DEPS['birefnet']), true,
        'birefnet is baked into the Pod image — must report image-resident');
}

// 3. A NON-baked engineAsset must NOT report image-resident, or it silently never
//    installs — the exact shape of the original bug.
{
    assert.strictEqual(_isImageResident(DEPS['sam3-multiplex']), false,
        'sam3-multiplex is absent from the image — must route to the volume installer');
}

// 4. targetPath weights stay image-resident with no flag (RIFE lives inside a baked
//    node folder) and must stay OUT of the volume set — a bare filename has no type
//    prefix, so the wrapper would reject the install.
{
    assert.strictEqual(_isImageResident(DEPS['rife47']), true,
        'rife47 is baked inside the node folder — image-resident without a flag');
    assert.ok(!volumeEngineAssets().includes('rife47'),
        'a targetPath weight must never be sent to the volume installer');
}

// 5. Every flagged weight must really be engineAsset — bakedOnPod on a per-model
//    weight would silently skip its install and leave a model unrunnable on remote.
{
    for (const [id, dep] of Object.entries(DEPS)) {
        if (dep && dep.bakedOnPod) {
            assert.strictEqual(dep.engineAsset, true,
                `${id} carries bakedOnPod but is not an engineAsset — the flag only means "the Pod IMAGE has it"`);
        }
    }
}

// 6. LOCKSTEP GUARD (skips when the sibling repo is absent, e.g. CI).
//    The dangerous direction is a WRONG bakedOnPod: it makes a weight unreachable on
//    remote and the failure is a 503 mid-generation, not a build error. Read the
//    Dockerfile and assert the flag matches reality both ways.
{
    const fs = require('fs');
    const DOCKERFILE = 'c:/AI/Mpi/mpi-ci/cubric-vision-pod/Dockerfile';
    if (!fs.existsSync(DOCKERFILE)) {
        console.log('  (6) skipped — mpi-ci sibling repo not present');
    } else {
        const text = fs.readFileSync(DOCKERFILE, 'utf8');
        // The bake block downloads by BASENAME; match on that rather than the full
        // subdir path, which differs between the image layout and mpi_models/.
        const basename = (dep) => (dep.filename || '').split('/').pop();
        for (const [id, dep] of Object.entries(DEPS)) {
            if (!dep || dep.engineAsset !== true || dep.targetPath) continue;
            const inImage = text.includes(basename(dep));
            if (dep.bakedOnPod) {
                assert.ok(inImage,
                    `${id} is flagged bakedOnPod but ${basename(dep)} is NOT in the Pod Dockerfile — it would be unreachable on remote`);
            } else {
                assert.ok(!inImage,
                    `${id} IS in the Pod Dockerfile but carries no bakedOnPod flag — it would be re-downloaded onto the volume`);
            }
        }
    }
}

// 7. MPI-420 — the TAESD preview decoders, named rather than left to the generic
//    rules above. ComfyUI runs with `--preview-method taesd` and falls back to the
//    blocky latent2rgb previewer when the decoder is missing, so a wrong flag here
//    is invisible: previews still appear, they are just bad. taesdxl/taef1 come
//    free inside the Windows portable bundle AND are baked into the Pod image;
//    taef2 (FLUX.2 Klein) and lighttaew2_2 (Wan 2.2) are newer than both and must
//    reach a Pod over the volume.
{
    const volume = volumeEngineAssets();
    for (const id of ['taef2-decoder', 'lighttaew2-2']) {
        assert.ok(volume.includes(id),
            `${id} must be volume-installed on remote — it is NOT in the Pod image`);
    }
    for (const id of ['taesdxl-decoder', 'taef1-decoder']) {
        assert.strictEqual(_isImageResident(DEPS[id]), true,
            `${id} is baked into the Pod image — must report image-resident`);
    }
    // Every decoder is an engineAsset: it belongs to no model, so a model-keyed
    // install would never reach it, and a GC with its "owner" would delete it.
    for (const id of ['taesdxl-decoder', 'taef1-decoder', 'taef2-decoder', 'lighttaew2-2']) {
        const dep = DEPS[id];
        assert.ok(dep, `${id} missing from DEPS`);
        assert.strictEqual(dep.engineAsset, true, `${id} must be an engineAsset`);
        assert.ok(/^vae_approx\//.test(dep.filename),
            `${id} must live under vae_approx/ — ComfyUI looks nowhere else`);
        assert.ok(dep.sha256 && dep.sha256.length === 64, `${id} needs a real sha256`);
    }
}

console.log('remote-engine-assets: 7/7 OK');
