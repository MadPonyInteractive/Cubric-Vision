/**
 * voice-library.test.cjs — MPI-622 Phase 1.
 *
 * Drives the REAL module over a hand-written 4-voice fixture. `js/data/voiceLibrary.js` has no
 * imports at all, so it crosses no absolute-browser-path boundary and loads headlessly
 * (docs/testing-harnesses.md § "The import boundary is the GRAPH, not the folder").
 *
 * The things worth guarding, all of which fail silently if they regress:
 *   - every field round-trips, including `accent: null`, which is a DELIBERATE value and must
 *     not be coerced away;
 *   - an unknown register THROWS rather than being quietly accepted — a mistyped register
 *     makes a voice invisible to the picker while the manifest still looks fine;
 *   - `kind: 'both'` answers to BOTH the narration and character filters;
 *   - sections group their variations and a lone voice is NOT called a variation (Phase 3.5);
 *   - `assetUrl` prefixes manifest-relative paths — the picker played them bare and 404'd.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../js/data/voiceLibrary.js');

// SNAKE_CASE, because the shipped manifest is snake_case. This fixture used to be camelCase
// (`medianF0`, `auditionNarration`, `f0P10P90`, `sourceUrl`, `addedAt`) and passed anyway:
// `createVoiceLibrary` hands voice records through untouched and only reads register / kind /
// gender / age / accent / language, which are spelled the same either way. It was inert until
// something read a differing field — then every voice would have returned `undefined` while
// this suite stayed green. Keep it in the manifest's own spelling.
const FIXTURE = {
    voices: [
        {
            id: 'lib_m_midage_authoritative',
            display_name: 'Deep Male',
            gender: 'male',
            age: 'midage',
            accent: null, // never inferred from a prompt — MPI-622
            language: 'en',
            style: 'documentary narration',
            tags: ['deep_male'],
            kind: 'narration',
            section: 'deep_male',
            variation: 1,
            register: 'R1',
            median_f0: 118.4,
            f0_p10_p90: [96.1, 148.7],
            sample: 'lib_m_midage_authoritative.opus',
            audition_narration: 'audition/lib_m_midage_authoritative_narration.opus',
            licence: 'CC0-1.0',
            source_url: 'https://huggingface.co/kyutai/tts-voices',
            added_at: '2026-08-25',
        },
        // Two variations of ONE voice, which is what the shipped library actually is — the
        // section is the unit a user picks from, not the individual clip.
        {
            id: 'lib_f_young_bright',
            display_name: 'Young Female · Variation 1',
            gender: 'female',
            age: 'young',
            accent: 'us',
            language: 'en',
            style: 'lively',
            tags: ['young_female'],
            kind: 'both',
            section: 'young_female',
            variation: 1,
            register: 'R3',
            median_f0: 224.9,
            f0_p10_p90: [181.2, 297.5],
            sample: 'lib_f_young_bright.opus',
            audition_narration: 'audition/lib_f_young_bright_narration.opus',
            licence: 'CC0-1.0',
            source_url: 'https://huggingface.co/kyutai/tts-voices',
            added_at: '2026-08-25',
        },
        {
            id: 'lib_f_young_warm',
            display_name: 'Young Female · Variation 2',
            gender: 'female',
            age: 'young',
            accent: null,
            language: 'en',
            style: 'warm',
            tags: ['young_female'],
            kind: 'both',
            section: 'young_female',
            variation: 2,
            register: 'R3',
            median_f0: 218.6,
            f0_p10_p90: [176.4, 289.0],
            sample: 'lib_f_young_warm.opus',
            audition_narration: 'audition/lib_f_young_warm_narration.opus',
            licence: 'CC0-1.0',
            source_url: 'https://huggingface.co/kyutai/tts-voices',
            added_at: '2026-08-25',
        },
        {
            id: 'lib_critter_squeak',
            display_name: 'Cartoon Critter',
            gender: null,
            age: 'child',
            accent: null,
            language: 'en',
            style: 'cartoon critter',
            tags: ['cartoon_critter'],
            kind: 'character',
            section: 'cartoon_critter',
            variation: 1,
            register: 'R5',
            median_f0: 402.3,
            f0_p10_p90: [338.0, 486.6],
            sample: 'lib_critter_squeak.opus',
            // No `audition_character` field anywhere, deliberately: the character audition
            // was deleted in Phase 3.5 because VC takes its delivery from the user's own
            // recording, which does not exist at audition time. The VC route previews the
            // raw `sample` instead.
            audition_narration: null,
            licence: 'CC0-1.0',
            source_url: 'https://huggingface.co/kyutai/tts-voices',
            added_at: '2026-08-25',
        },
    ],
    performanceClips: [
        { id: 'perf_R1_angry', register: 'R1', emotion: 'angry', median_f0: 136.3, clip: 'performance/perf_R1_angry.opus' },
        { id: 'perf_R1_flat', register: 'R1', emotion: 'flat', median_f0: 101.5, clip: 'performance/perf_R1_flat.opus' },
        { id: 'perf_R3_angry', register: 'R3', emotion: 'angry', median_f0: 274.1, clip: 'performance/perf_R3_angry.opus' },
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
    assert.deepStrictEqual(m.f0_p10_p90, [96.1, 148.7]);

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
        ['lib_f_young_bright', 'lib_f_young_warm', 'lib_m_midage_authoritative'],
        "'both' must answer to the narration filter");
    assert.deepStrictEqual(ids({ kind: 'character' }).sort(),
        ['lib_critter_squeak', 'lib_f_young_bright', 'lib_f_young_warm'],
        "'both' must answer to the character filter");
    assert.strictEqual(lib.listVoices().length, 4, 'no filter returns everything');
});

test('filters narrow on the record fields and compose', async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    assert.deepStrictEqual(lib.listVoices({ register: 'R5' }).map(v => v.id), ['lib_critter_squeak']);
    assert.deepStrictEqual(lib.listVoices({ gender: 'female' }).map(v => v.id), ['lib_f_young_bright', 'lib_f_young_warm']);
    assert.deepStrictEqual(
        lib.listVoices({ kind: 'character', register: 'R3' }).map(v => v.id),
        ['lib_f_young_bright', 'lib_f_young_warm'],
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
    assert.ok(angry.median_f0 > REGISTERS.R1.max,
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

test('sections group their variations, and a lone voice is not called a variation', async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    const sections = lib.listSections();
    assert.deepStrictEqual(sections.map(s => s.section),
        ['deep_male', 'young_female', 'cartoon_critter'],
        'sections come back in manifest order, so the list is stable across imports');

    const young = sections.find(s => s.section === 'young_female');
    assert.strictEqual(young.label, 'Young Female', 'the slug is not a label');
    assert.strictEqual(young.isVariations, true);
    assert.deepStrictEqual(young.voices.map(v => v.variation), [1, 2], 'variations sort by number');

    // The whole point of the restructure: a section of one is a VOICE, and the UI branches on
    // this to avoid rendering "1 variation of one voice".
    const critter = sections.find(s => s.section === 'cartoon_critter');
    assert.strictEqual(critter.isVariations, false);
    assert.strictEqual(critter.voices.length, 1);

    // Filters narrow the sections, and an emptied section disappears rather than arriving empty.
    const r3 = lib.listSections({ register: 'R3' });
    assert.deepStrictEqual(r3.map(s => s.section), ['young_female']);
    assert.strictEqual(r3[0].voices.length, 2);
    assert.deepStrictEqual(lib.listSections({ register: 'R4' }), []);

    assert.deepStrictEqual(lib.listVoices({ section: 'young_female' }).map(v => v.id),
        ['lib_f_young_bright', 'lib_f_young_warm'], 'section is also a plain filter key');
});

test('assetUrl resolves manifest-relative paths against voices/', async () => {
    const { createVoiceLibrary } = await load();
    const lib = createVoiceLibrary(clone());

    // The picker passed these to `new Audio()` bare, which resolves against the PAGE and 404s.
    // The component-gallery fixture leaves auditions null, so nothing ever caught it.
    assert.strictEqual(lib.assetUrl('audition/x_narration.opus'), '/voices/audition/x_narration.opus');
    assert.strictEqual(lib.assetUrl('x.opus'), '/voices/x.opus');
    assert.strictEqual(lib.assetUrl(null), null, 'a null path stays null, never "/voices/null"');

    const custom = createVoiceLibrary(clone(), { baseUrl: '/user-voices/' });
    assert.strictEqual(custom.assetUrl('x.opus'), '/user-voices/x.opus');
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
