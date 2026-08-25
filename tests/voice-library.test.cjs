/**
 * voice-library.test.cjs — MPI-622 Phase 1.
 *
 * Drives the REAL module over a hand-written 3-voice fixture. `js/data/voiceLibrary.js` has no
 * imports at all, so it crosses no absolute-browser-path boundary and loads headlessly
 * (docs/testing-harnesses.md § "The import boundary is the GRAPH, not the folder").
 *
 * The three things worth guarding, all of which fail silently if they regress:
 *   - every field round-trips, including `accent: null`, which is a DELIBERATE value and must
 *     not be coerced away;
 *   - an unknown register THROWS rather than being quietly accepted — a mistyped register
 *     makes a voice invisible to the picker while the manifest still looks fine;
 *   - `kind: 'both'` answers to BOTH the narration and character filters.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../js/data/voiceLibrary.js');

const FIXTURE = {
    voices: [
        {
            id: 'lib_m_midage_authoritative',
            displayName: 'Marcus',
            gender: 'male',
            age: 'midage',
            accent: null, // never inferred from a prompt — MPI-622
            language: 'en',
            style: 'documentary narration',
            tags: ['calm', 'authority'],
            kind: 'narration',
            register: 'R1',
            medianF0: 118.4,
            f0P10P90: [96.1, 148.7],
            sample: 'voices/lib_m_midage_authoritative/sample.opus',
            auditionNarration: 'voices/lib_m_midage_authoritative/audition_narration.opus',
            auditionCharacter: null,
            licence: 'CC0-1.0',
            sourceUrl: 'https://huggingface.co/kyutai/tts-voices',
            addedAt: '2026-08-25',
        },
        {
            id: 'lib_f_young_bright',
            displayName: 'Nell',
            gender: 'female',
            age: 'young',
            accent: 'us',
            language: 'en',
            style: 'lively',
            tags: ['bright', 'crisp'],
            kind: 'both',
            register: 'R3',
            medianF0: 224.9,
            f0P10P90: [181.2, 297.5],
            sample: 'voices/lib_f_young_bright/sample.opus',
            auditionNarration: 'voices/lib_f_young_bright/audition_narration.opus',
            auditionCharacter: 'voices/lib_f_young_bright/audition_character.opus',
            licence: 'CC0-1.0',
            sourceUrl: 'https://huggingface.co/kyutai/tts-voices',
            addedAt: '2026-08-25',
        },
        {
            id: 'lib_critter_squeak',
            displayName: 'Pip',
            gender: 'neutral',
            age: 'child',
            accent: null,
            language: 'en',
            style: 'cartoon critter',
            tags: ['squeaky'],
            kind: 'character',
            register: 'R5',
            medianF0: 402.3,
            f0P10P90: [338.0, 486.6],
            sample: 'voices/lib_critter_squeak/sample.opus',
            auditionNarration: null,
            auditionCharacter: 'voices/lib_critter_squeak/audition_character.opus',
            licence: 'CC0-1.0',
            sourceUrl: 'https://huggingface.co/kyutai/tts-voices',
            addedAt: '2026-08-25',
        },
    ],
    performanceClips: [
        { id: 'perf_R1_angry', register: 'R1', emotion: 'angry', medianF0: 136.3, file: 'voices/_perf/R1_angry.opus' },
        { id: 'perf_R1_flat', register: 'R1', emotion: 'flat', medianF0: 101.5, file: 'voices/_perf/R1_flat.opus' },
        { id: 'perf_R3_angry', register: 'R3', emotion: 'angry', medianF0: 274.1, file: 'voices/_perf/R3_angry.opus' },
    ],
};

const clone = () => JSON.parse(JSON.stringify(FIXTURE));

test('every field round-trips, including a deliberate null accent', async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    const v = lib.getVoice('lib_f_young_bright');
    assert.deepStrictEqual(v, FIXTURE.voices[1], 'the voice record must come back unchanged');

    const m = lib.getVoice('lib_m_midage_authoritative');
    assert.strictEqual(m.accent, null,
        'accent null is a deliberate value (MPI-622) and must not be coerced to a string');
    assert.deepStrictEqual(m.f0P10P90, [96.1, 148.7]);

    assert.strictEqual(lib.getVoice('nope'), null, 'an unknown id returns null, never undefined');
});

test('an unknown register throws rather than being silently accepted', async () => {
    const { createVoiceLibrary } = await load();

    const bad = clone();
    bad.voices[0].register = 'R9';
    assert.throws(() => createVoiceLibrary(bad), /unknown register "R9"/,
        'a mistyped register would make the voice invisible to the picker in silence');

    const badClip = clone();
    badClip.performanceClips[0].register = 'r1';
    assert.throws(() => createVoiceLibrary(badClip), /unknown register "r1"/,
        'register keys are case-sensitive — "r1" is not "R1"');

    const badEmotion = clone();
    badEmotion.performanceClips[0].emotion = 'furious';
    assert.throws(() => createVoiceLibrary(badEmotion), /unknown emotion "furious"/,
        'the emotion set is closed on purpose');

    const badKind = clone();
    badKind.voices[0].kind = 'narrator';
    assert.throws(() => createVoiceLibrary(badKind), /unknown kind "narrator"/);
});

test("kind 'both' appears in BOTH the narration and character filters", async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    const ids = f => lib.listVoices(f).map(v => v.id);

    assert.deepStrictEqual(ids({ kind: 'narration' }).sort(),
        ['lib_f_young_bright', 'lib_m_midage_authoritative'],
        "'both' must answer to the narration filter");
    assert.deepStrictEqual(ids({ kind: 'character' }).sort(),
        ['lib_critter_squeak', 'lib_f_young_bright'],
        "'both' must answer to the character filter");
    assert.strictEqual(lib.listVoices().length, 3, 'no filter returns everything');
});

test('filters narrow on the record fields and compose', async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    assert.deepStrictEqual(lib.listVoices({ register: 'R5' }).map(v => v.id), ['lib_critter_squeak']);
    assert.deepStrictEqual(lib.listVoices({ gender: 'female' }).map(v => v.id), ['lib_f_young_bright']);
    assert.deepStrictEqual(
        lib.listVoices({ kind: 'character', register: 'R3' }).map(v => v.id),
        ['lib_f_young_bright'],
        'filters compose',
    );
    assert.deepStrictEqual(lib.listVoices({ accent: 'us' }).map(v => v.id), ['lib_f_young_bright']);
});

test('performance clips are shared across voices and looked up by register', async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    assert.deepStrictEqual(lib.listPerformanceClips('R1').map(c => c.emotion).sort(),
        ['angry', 'flat']);
    assert.deepStrictEqual(lib.listPerformanceClips('R3', 'angry').map(c => c.id), ['perf_R3_angry']);
    assert.deepStrictEqual(lib.listPerformanceClips('R4'), [], 'an empty register is empty, not an error');
    assert.strictEqual(lib.listPerformanceClips().length, 3, 'no register returns the whole grid');

    assert.throws(() => lib.listPerformanceClips('R9'), /unknown register "R9"/);
});

test('an (R1, Angry) clip is allowed to sit far above R1', async () => {
    const { createVoiceLibrary, REGISTERS } = await load();
    const lib = createVoiceLibrary(clone());

    // Emotion moves pitch: a 101.5 Hz performer's angry take measured 136.3 Hz (MPI-622).
    // `register` names the PERFORMER'S BASELINE, so the clip's own f0 leaving the band is
    // correct and must NOT be validated against it.
    const [angry] = lib.listPerformanceClips('R1', 'angry');
    assert.ok(angry.medianF0 > REGISTERS.R1.max,
        'the fixture must actually exercise this, or the test proves nothing');
});

test('pitch distance is signed semitones, and refuses nonsense', async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    assert.strictEqual(Math.round(lib.pitchDistance(100, 200)), 12, 'an octave up is +12');
    assert.strictEqual(Math.round(lib.pitchDistance(200, 100)), -12, 'and the sign carries');
    assert.strictEqual(lib.pitchDistance(0, 200), null);
    assert.strictEqual(lib.pitchDistance(200, 0), null);
});

test('an empty manifest is a working empty library, not a crash', async () => {
    const { createVoiceLibrary } = await load();

    for (const m of [{}, { voices: [] }, undefined]) {
        const lib = createVoiceLibrary(m);
        assert.deepStrictEqual(lib.listVoices(), []);
        assert.deepStrictEqual(lib.listPerformanceClips(), []);
        assert.strictEqual(lib.getVoice('anything'), null);
    }
});
