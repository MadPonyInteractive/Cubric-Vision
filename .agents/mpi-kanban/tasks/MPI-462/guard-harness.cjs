/**
 * MPI-462 Defect 2 — isolated harness over the REAL shared-dep guard.
 *
 * Points CUBRIC_MODELS_ROOT at a throwaway dir, fabricates the Boogu family's
 * weights at their real relative paths, and asks the real
 * `_localSharedDepsMap('boogu-edit-balanced')` what it would protect. No app,
 * no port 3000, no admin, the user's G:\CubricModels untouched.
 *
 * Question under test: is there a disk state in which uninstalling
 * boogu-edit-balanced leaves `boogu-qwen3vl-8b-clip` (10.59GB) on disk owned by
 * nothing — i.e. protected by a sibling that is not itself installed?
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(os.tmpdir(), 'mpi462-models-' + process.pid);
process.env.CUBRIC_MODELS_ROOT = ROOT;

// Mirror the forked server process: it logs unhandled rejections and stays up.
process.on('unhandledRejection', e => console.log('  [unhandledRejection]', e && e.message));

const REPO = 'C:/AI/Mpi/Cubric-Vision';
const { DEPS } = require(REPO + '/js/data/modelConstants/dependencies.js');

// Resolved lazily so CUBRIC_MODELS_ROOT is set before anything reads it.
let dm;

const FAMILY = {
    'boogu-edit-transformer-balanced': 'balanced transformer (exclusive)',
    'boogu-edit-transformer-high': 'high transformer (exclusive)',
    'boogu-qwen3vl-8b-clip': 'the 10.59GB clip (shared by both tiers)',
    'vae-flux-ae': 'flux VAE (shared widely)',
};

function depPath(depId) {
    const d = DEPS[depId];
    if (!d) throw new Error('unknown dep ' + depId);
    const rel = d.filename || d.dir;
    if (!rel) throw new Error('dep has no filename/dir: ' + depId);
    return path.join(ROOT, rel);
}

function reset() {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
}

function place(depIds) {
    for (const id of depIds) {
        const p = depPath(id);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        // Size must clear any completeness check that compares against the
        // declared size; write the declared byte count.
        const d = DEPS[id];
        const m = (d.size || '').match(/^([\d.]+)\s*(GB|MB|KB|B)$/i);
        const mult = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 };
        const want = m ? Math.round(parseFloat(m[1]) * mult[m[2].toUpperCase()]) : 1024;
        // Sparse file — instant, costs no disk, still stats at the right size.
        const fd = fs.openSync(p, 'w');
        fs.ftruncateSync(fd, want);
        fs.closeSync(fd);
    }
}

async function scenario(name, onDisk, expectation) {
    reset();
    place(onDisk);
    const map = await dm._localSharedDepsMap('boogu-edit-balanced');
    const clipGuards = map.get('boogu-qwen3vl-8b-clip');
    const protectedClip = !!(clipGuards && clipGuards.size);
    console.log('\n── ' + name);
    console.log('   on disk : ' + onDisk.join(', '));
    console.log('   clip protected by : ' + (protectedClip ? [...clipGuards].join(', ') : '(nothing)'));
    console.log('   => uninstalling balanced would ' + (protectedClip ? 'KEEP' : 'DELETE') + ' the clip');
    const verdict = protectedClip === expectation.protected ? 'as expected' : '*** UNEXPECTED ***';
    console.log('   expected: ' + (expectation.protected ? 'KEEP' : 'DELETE') + ' — ' + expectation.why);
    console.log('   ' + verdict);
    return { name, protectedClip, ok: protectedClip === expectation.protected };
}

(async () => {
    dm = require(REPO + '/routes/downloadManager.js');
    console.log('models root: ' + ROOT);
    for (const [id, what] of Object.entries(FAMILY)) {
        console.log('  ' + id.padEnd(34) + ' -> ' + (DEPS[id].filename || DEPS[id].dir) + '  [' + what + ']');
    }

    const results = [];

    results.push(await scenario(
        'A. both tiers fully installed',
        ['boogu-edit-transformer-balanced', 'boogu-edit-transformer-high', 'boogu-qwen3vl-8b-clip', 'vae-flux-ae'],
        { protected: true, why: 'high is genuinely installed and needs the clip' },
    ));

    results.push(await scenario(
        'B. only balanced installed (today\'s live state)',
        ['boogu-edit-transformer-balanced', 'boogu-qwen3vl-8b-clip', 'vae-flux-ae'],
        { protected: false, why: 'nothing else needs it — matches the live run that deleted it' },
    ));

    results.push(await scenario(
        'C. high transformer present but its clip/vae absent',
        ['boogu-edit-transformer-balanced', 'boogu-edit-transformer-high'],
        { protected: false, why: 'clip is not on disk, so there is nothing to protect' },
    ));

    results.push(await scenario(
        'D. LEAK CANDIDATE — high transformer on disk, high NOT usable',
        ['boogu-edit-transformer-balanced', 'boogu-edit-transformer-high', 'boogu-qwen3vl-8b-clip'],
        { protected: true, why: 'high has exclusive footprint; line 218 falls back to its FULL universe' },
    ));

    results.push(await scenario(
        'E. the orphan state itself — only the clip left',
        ['boogu-qwen3vl-8b-clip'],
        { protected: false, why: 'no exclusive footprint anywhere, nothing may protect it' },
    ));

    fs.rmSync(ROOT, { recursive: true, force: true });
    console.log('\n' + results.map(r => (r.ok ? 'ok   ' : 'FAIL ') + r.name).join('\n'));
    console.log('\ncleaned up ' + ROOT);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
