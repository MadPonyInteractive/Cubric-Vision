// MPI-467/MPI-501 — a scoped smoke run must MERGE into dev_configs/smoke-evidence.json,
// never replace it.
//
// The file is what `npm run release:check` reads to allow a bumped engine to ship, and
// coverage is REPORTED there, never gated (release-health-check.mjs § checkSmokeEvidence).
// So a `--models minimax-h3` run that overwrote the file would leave "2 pass, 0 fail" —
// a file that PASSES the gate while the record of the other 33 proven ops is destroyed.
// That is worse than failing, which is why the merge exists.

const assert = require('node:assert');
const test = require('node:test');

const PRIOR_AT = '2026-08-09T03:31:15.243Z';
const FRESH_AT = '2026-08-09T05:00:00.000Z';

const prior = () => ({
    at: PRIOR_AT,
    engine: { want: '0.30.0', got: '0.30.0', proven: true },
    results: [
        { model: 'sdxl-nsfw', op: 't2i', status: 'PASS', secs: 8, media: 1 },
        { model: 'minimax-h3', op: 'i2v_ms', status: 'PASS', secs: 132, media: 1 },
        { model: 'minimax-h3', op: 't2v_ms', status: 'FAIL', why: 'prompt orphaned after 169s' },
    ],
    counts: { pass: 2, skip: 0, fail: 1, opsPlanned: 3 },
    scope: { requested: 'all', modelsRun: ['sdxl-nsfw', 'minimax-h3'], covers: ['sdxl-lustify'], unproven: [], modelsInRegistry: 20 },
    limits: ['Pod-green is not Windows-green: different OS, python, torch, CUDA.'],
    skippedWeights: ['flux-vae(0.3GB)', 'wan-lora(1.2GB)'],
});

const fresh = () => ({
    at: FRESH_AT,
    engine: { want: '0.30.0', got: '0.30.0', proven: true },
    results: [{ model: 'minimax-h3', op: 't2v_ms', status: 'PASS', secs: 171, media: 1 }],
    counts: { pass: 1, skip: 0, fail: 0, opsPlanned: 1 },
    scope: { requested: ['minimax-h3'], modelsRun: ['minimax-h3'], covers: [], unproven: ['sdxl-nsfw', 'sdxl-lustify'], modelsInRegistry: 20 },
    limits: [
        'Pod-green is not Windows-green: different OS, python, torch, CUDA.',
        'SCOPED RUN: 2 of 20 models are in no family this run touched — sdxl-nsfw, sdxl-lustify.',
    ],
    skippedWeights: ['flux-vae(0.3GB)', 'sdxl-base(6.9GB)'],
});

test('a scoped run merges into the recorded matrix instead of replacing it', async () => {
    const { mergeEvidence } = await import('../scripts/smoke-workflows.mjs');
    const m = mergeEvidence(prior(), fresh());

    // 1. Nothing is lost. Three ops in, three ops out.
    assert.strictEqual(m.results.length, 3, 'prior rows survive a scoped run');
    const row = (model, op) => m.results.find(r => r.model === model && r.op === op);
    assert.strictEqual(row('sdxl-nsfw', 't2i').status, 'PASS', 'an untouched prior row is kept verbatim');

    // 2. The retried op is REPLACED by the fresh result, not duplicated.
    assert.strictEqual(m.results.filter(r => r.op === 't2v_ms').length, 1, 'no duplicate rows for a retried op');
    assert.strictEqual(row('minimax-h3', 't2v_ms').status, 'PASS', 'the fresh result wins');
    assert.strictEqual(row('minimax-h3', 't2v_ms').secs, 171, 'and it is the fresh row, not a patched old one');

    // 3. Every row says which run produced it, so a merged file can never pass an old
    //    pass off as part of this run.
    assert.strictEqual(row('sdxl-nsfw', 't2i').run, PRIOR_AT, 'a retained row is stamped with the run it came from');
    assert.strictEqual(row('minimax-h3', 't2v_ms').run, FRESH_AT, 'a fresh row is stamped with this run');
    assert.deepStrictEqual(m.runs, [PRIOR_AT, FRESH_AT], 'the file lists the runs it is made of');

    // 4. Counts are recomputed off the merged rows — this is what release:check gates on.
    assert.deepStrictEqual(m.counts, { pass: 3, skip: 0, fail: 0, opsPlanned: 3 },
        'the merged counts describe the merged rows, not either run alone');

    // 5. `at` is the newest run, so the staleness anchor in release-health-check stays honest.
    assert.strictEqual(m.at, FRESH_AT, 'the merged file is dated by its newest run');

    // 6. Coverage is the UNION: a model is unproven only when NEITHER run touched its family.
    assert.deepStrictEqual(m.scope.unproven, [], 'the scoped run does not un-prove what the full run proved');
    assert.deepStrictEqual(m.scope.modelsRun.sort(), ['minimax-h3', 'sdxl-nsfw'], 'models run is the union');
    assert.deepStrictEqual(m.scope.covers, ['sdxl-lustify'], 'class_type coverage is the union');
    assert.ok(!m.limits.some(l => l.startsWith('SCOPED RUN:')),
        'a merged file with full coverage must not keep the scoped run’s warning');

    // 7. Weights are only "not loaded" when NEITHER run loaded them.
    assert.deepStrictEqual(m.skippedWeights, ['flux-vae(0.3GB)'], 'skipped weights intersect across runs');
});

test('a merge that still leaves a gap keeps saying so', async () => {
    const { mergeEvidence } = await import('../scripts/smoke-workflows.mjs');
    const p = prior();
    p.scope.unproven = ['sdxl-lustify', 'krea2'];        // the full run had a gap of its own
    const m = mergeEvidence(p, fresh());
    // krea2 is absent from the fresh run's unproven list, so that run covered it — the gap
    // closes. sdxl-lustify is in BOTH lists, so nothing has proven it and it must remain.
    assert.deepStrictEqual(m.scope.unproven, ['sdxl-lustify'],
        'a gap closes only when one of the two runs actually covered it');

    const p2 = prior();
    p2.scope.unproven = ['krea2'];
    const f2 = fresh();
    f2.scope.unproven = ['krea2', 'sdxl-nsfw', 'sdxl-lustify'];
    const m2 = mergeEvidence(p2, f2);
    assert.deepStrictEqual(m2.scope.unproven, ['krea2'], 'a model neither run touched stays unproven');
    assert.ok(m2.limits.some(l => l.startsWith('SCOPED RUN:') && l.includes('krea2')),
        'and the merged file says so out loud');
});

test('a prior file that cannot say what it left out may not narrow the claim', async () => {
    const { mergeEvidence } = await import('../scripts/smoke-workflows.mjs');
    const p = prior();
    delete p.scope;                                       // pre-scope evidence file
    const m = mergeEvidence(p, fresh());
    assert.deepStrictEqual(m.scope.unproven, ['sdxl-nsfw', 'sdxl-lustify'],
        'without a prior scope the merged file keeps the scoped run’s gap');
    assert.ok(m.limits.some(l => l.startsWith('SCOPED RUN:')), 'and keeps the warning with it');
});
