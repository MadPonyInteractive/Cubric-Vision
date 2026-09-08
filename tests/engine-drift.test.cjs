/**
 * The narrowed smoke-evidence staleness rule (MPI-709).
 *
 * The attestation cases are the ones that matter: it is the only thing that can talk the
 * release gate out of demanding a re-smoke, so it must apply to exactly one reviewed pin
 * hop and nothing else. A bug that let it match loosely would be a permanent, silent
 * `--allow-unproven-engine`.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const load = () => import(require('node:url').pathToFileURL(path.join(REPO, 'scripts/engine-drift.mjs')).href);

const FROM = '85057698ccb8cd62f53f484c3fae42326b0e8a06';
const TO = '287edb83f0de589984f59aa8fd4e92726087d7fb';

function tmpJson(name, body) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify(body));
    return p;
}

test('attestation applies only to the exact pin hop it names', async () => {
    const { attestedClasses } = await load();
    const doc = {
        pack: 'ComfyUI-MpiNodes',
        from: FROM,
        to: TO,
        classes: { MpiClearVram: { reason: 'pure refactor' } },
    };

    assert.deepStrictEqual([...attestedClasses(tmpJson('a.json', doc), FROM, TO)], ['MpiClearVram'],
        'the hop it was written for must be honoured');

    assert.strictEqual(attestedClasses(tmpJson('b.json', doc), FROM, 'deadbeefdeadbeef').size, 0,
        'the pin moved on again — the attestation must expire, not carry forward');
    assert.strictEqual(attestedClasses(tmpJson('c.json', doc), 'cafebabecafebabe', TO).size, 0,
        'a different starting pin is a different question');
    assert.strictEqual(attestedClasses(tmpJson('d.json', { ...doc, pack: 'SomeOtherPack' }), FROM, TO).size, 0,
        'an attestation for another pack must not apply');
    assert.strictEqual(attestedClasses(tmpJson('e.json', { ...doc, classes: { MpiClearVram: { reason: '  ' } } }), FROM, TO).size, 0,
        'a blank reason is a rubber stamp, not an attestation');
    assert.strictEqual(attestedClasses(path.join(os.tmpdir(), 'does-not-exist.json'), FROM, TO).size, 0,
        'a missing file attests nothing');
});

test('graphsLoading finds only graphs that name a changed class', async () => {
    const { graphsLoading } = await load();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
    fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify({
        1: { class_type: 'MpiSaveVideo' }, 2: { class_type: 'KSampler' },
    }));
    fs.writeFileSync(path.join(dir, 'image.json'), JSON.stringify({
        1: { class_type: 'MpiInt' }, 2: { class_type: 'KSampler' },
    }));

    const hits = graphsLoading(new Set(['MpiSaveVideo', 'MpiWindowedSampler']), dir);
    assert.deepStrictEqual([...hits.keys()], ['video.json']);
    assert.deepStrictEqual(hits.get('video.json'), ['MpiSaveVideo']);
    assert.strictEqual(graphsLoading(new Set(), dir).size, 0, 'nothing changed reaches nothing');
});

test('an unanswerable question is stale, never clean', async () => {
    const { changedClasses } = await load();
    assert.strictEqual(changedClasses(FROM, TO, path.join(os.tmpdir(), 'no-such-repo')), null,
        'a missing checkout must return null so callers fall back to the blunt refusal');
    assert.strictEqual(changedClasses(null, TO), null, 'an unresolvable pin is unanswerable');
    assert.deepStrictEqual(changedClasses(TO, TO), new Set(), 'an unmoved pin changed nothing');
});

// Integration: the real v1.2.11 hop this rule was built for. Skipped where the sibling
// checkout is absent (CI), because its absence is correctly reported as "unanswerable".
test('the real MpiNodes v1.2.11 hop resolves to exactly its four classes', async (t) => {
    const { changedClasses, MPINODES_REPO } = await load();
    if (!fs.existsSync(MPINODES_REPO)) return t.skip(`no MpiNodes checkout at ${MPINODES_REPO}`);
    const changed = changedClasses(FROM, TO);
    if (changed === null) return t.skip('checkout present but does not carry both commits');
    assert.deepStrictEqual([...changed].sort(),
        ['MpiClearVram', 'MpiClearVramEnd', 'MpiSaveVideo', 'MpiWindowedSampler'],
        'MpiClearVram is in because vram.py gained a module-level helper; ~120 other classes stay out');
});
