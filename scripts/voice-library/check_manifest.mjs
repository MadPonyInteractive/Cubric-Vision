/**
 * check_manifest.mjs — contract checks for the shipped voices/manifest.json (MPI-622).
 *
 * The import pipeline is re-runnable by design, so the manifest changes whenever the
 * curated set changes. These checks run against the REAL loader (js/data/voiceLibrary.js),
 * not a re-implementation of it, so a drift between what the pipeline writes and what the
 * app reads fails here instead of silently emptying a filter in the picker.
 *
 * The two checks that exist because of a specific near-miss:
 *   - performanceClips survive an import. The pipeline used to write `performanceClips: []`
 *     on every run, which would have deleted the twelve authored Phase 2 clips while leaving
 *     a perfectly well-formed manifest behind.
 *   - no orphan opus. The curated set is a SUBSET of what was imported before, so a voice
 *     dropped by curation leaves its .opus on disk shipping dead weight in the bundle.
 *
 * Run:  node scripts/voice-library/check_manifest.mjs
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const VOICES = join(ROOT, 'voices');

const lib = await import(pathToFileURL(join(ROOT, 'js', 'data', 'voiceLibrary.js')).href);
const { createVoiceLibrary, REGISTERS, EMOTIONS, VOICE_KINDS } = lib;

const manifest = JSON.parse(readFileSync(join(VOICES, 'manifest.json'), 'utf8'));

let pass = 0;
const failures = [];
const check = (name, fn) => {
    try {
        const detail = fn();
        pass++;
        console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
    } catch (err) {
        failures.push(`${name}: ${err.message}`);
        console.log(`  FAIL  ${name} — ${err.message}`);
    }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/** Every file under dir, recursively — what the bundle actually ships. */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

// Brief.md § 3 field list. A missing field is a silent null in the picker.
const VOICE_FIELDS = ['id', 'display_name', 'gender', 'age', 'accent', 'language', 'style',
    'tags', 'kind', 'register', 'median_f0', 'f0_p10_p90', 'sample',
    'audition_narration', 'audition_character', 'licence', 'source_url', 'added_at'];

console.log(`\nvoices/manifest.json — ${manifest.voices.length} voices, ` +
    `${manifest.performanceClips.length} performance clips\n`);

let library;
check('1. the real loader accepts the manifest', () => {
    library = createVoiceLibrary(manifest);
    return `${library.listVoices().length} voices readable`;
});

check('2. every voice carries the full brief § 3 field set', () => {
    for (const v of manifest.voices) {
        const missing = VOICE_FIELDS.filter(f => !(f in v));
        assert(missing.length === 0, `${v.id} is missing ${missing.join(', ')}`);
    }
    return `${VOICE_FIELDS.length} fields x ${manifest.voices.length} voices`;
});

check('3. accent is null on every voice (never inferred)', () => {
    const labelled = manifest.voices.filter(v => v.accent !== null);
    assert(labelled.length === 0,
        `${labelled.length} voice(s) carry an accent label: ${labelled.slice(0, 3).map(v => v.id)}`);
    return 'null on all';
});

check('4. every median_f0 sits inside its own declared register band', () => {
    for (const v of manifest.voices) {
        const band = REGISTERS[v.register];
        assert(band, `${v.id} has unknown register ${v.register}`);
        assert(v.median_f0 >= band.min && v.median_f0 < band.max,
            `${v.id} ${v.median_f0} Hz is outside ${v.register} (${band.min}-${band.max})`);
    }
    return 'all in band';
});

check('5. every kind is a legal VOICE_KIND', () => {
    for (const v of manifest.voices) {
        assert(VOICE_KINDS.includes(v.kind), `${v.id} has kind "${v.kind}"`);
    }
    return [...new Set(manifest.voices.map(v => v.kind))].join(', ');
});

check('6. every sample opus exists on disk and is non-empty', () => {
    for (const v of manifest.voices) {
        const p = join(VOICES, v.sample);
        assert(existsSync(p), `${v.id}: ${v.sample} is missing`);
        assert(statSync(p).size > 0, `${v.id}: ${v.sample} is empty`);
    }
    return `${manifest.voices.length} files`;
});

check("7. kind:'both' answers to BOTH the narration and character filters", () => {
    const both = manifest.voices.filter(v => v.kind === 'both').map(v => v.id);
    if (!both.length) return 'no both-kind voices to check';
    const nar = new Set(library.listVoices({ kind: 'narration' }).map(v => v.id));
    const chr = new Set(library.listVoices({ kind: 'character' }).map(v => v.id));
    for (const id of both) {
        assert(nar.has(id) && chr.has(id), `${id} is missing from one of the two filters`);
    }
    return `${both.length} both-kind voices in both filters`;
});

check('8. the register filter partitions the library exactly', () => {
    let total = 0;
    const parts = [];
    for (const r of Object.keys(REGISTERS)) {
        const n = library.listVoices({ register: r }).length;
        total += n;
        parts.push(`${r}:${n}`);
    }
    assert(total === manifest.voices.length,
        `register buckets sum to ${total}, manifest has ${manifest.voices.length}`);
    return parts.join(' ');
});

check('9. the performance grid survived the import intact', () => {
    assert(manifest.performanceClips.length > 0,
        'performanceClips is EMPTY — an import wiped the authored Phase 2 grid');
    const byRegister = {};
    for (const c of manifest.performanceClips) {
        (byRegister[c.register] ??= new Set()).add(c.emotion);
    }
    for (const [reg, emotions] of Object.entries(byRegister)) {
        const missing = EMOTIONS.filter(e => !emotions.has(e));
        assert(missing.length === 0, `${reg} grid is missing ${missing.join(', ')}`);
        assert(library.listPerformanceClips(reg).length === EMOTIONS.length,
            `${reg} does not return its six emotions through the loader`);
    }
    return `${Object.keys(byRegister).join(' + ')} x ${EMOTIONS.length} emotions`;
});

check('10. every performance clip exists on disk and is non-empty', () => {
    for (const c of manifest.performanceClips) {
        const p = join(VOICES, c.clip);
        assert(existsSync(p), `${c.id}: ${c.clip} is missing`);
        assert(statSync(p).size > 0, `${c.id}: ${c.clip} is empty`);
    }
    return `${manifest.performanceClips.length} clips`;
});

check('11. no orphan opus in voices/ (nothing ships unreferenced)', () => {
    // Every opus the bundle carries, at any depth, must be named by the manifest. Checking
    // only the top level would have let the whole audition/ directory accumulate dead files
    // — a curated-away voice leaves TWO auditions behind now, not just its sample.
    const referenced = new Set();
    for (const v of manifest.voices) {
        for (const rel of [v.sample, v.audition_narration, v.audition_character]) {
            if (rel) referenced.add(rel.split('/').pop());
        }
    }
    for (const c of manifest.performanceClips) referenced.add(c.clip.split('/').pop());
    const orphans = walk(VOICES)
        .filter(p => p.endsWith('.opus'))
        .map(p => p.split(/[\\/]/).pop())
        .filter(f => !referenced.has(f));
    assert(orphans.length === 0,
        `${orphans.length} unreferenced opus: ${orphans.slice(0, 6).join(', ')}`);
    return 'clean';
});

check('12. every shipped voice has BOTH auditions, generated and non-empty', () => {
    // Phase 3's verify step. An audition is not decoration: the picker plays it INSTEAD of
    // the raw sample, because a character voice never sounds exactly like its own clip.
    // A null here means the picker silently falls back to promising the wrong voice.
    const missing = [], empty = [];
    for (const v of manifest.voices) {
        for (const [field, rel] of [['narration', v.audition_narration],
                                    ['character', v.audition_character]]) {
            if (!rel) { missing.push(`${v.id}:${field}`); continue; }
            const p = join(VOICES, rel);
            if (!existsSync(p)) missing.push(`${v.id}:${field} (${rel} not on disk)`);
            else if (statSync(p).size === 0) empty.push(`${v.id}:${field}`);
        }
    }
    assert(missing.length === 0,
        `${missing.length} missing: ${missing.slice(0, 5).join(', ')}`);
    assert(empty.length === 0, `${empty.length} empty: ${empty.slice(0, 5).join(', ')}`);
    return `${manifest.voices.length * 2} auditions`;
});

check('13. the bundle stays within its stated budget', () => {
    // Walks EVERY subdirectory. The first version listed voices/ and performance/ by hand
    // and would have reported a bundle 2 MB lighter than the one that actually ships the
    // moment audition/ was added — a size gate that lies is worse than no size gate.
    const bytes = walk(VOICES).reduce((n, p) => n + statSync(p).size, 0);
    const mb = bytes / 1024 / 1024;
    // D1 estimated 5 MB for "~60 voices x (sample + up to 2 auditions) at ~24 KB each".
    // The clips came in at ~50 KB (samples, a long read) and ~17 KB (auditions, a short
    // one), so the real figure for the same content is ~7 MB. The budget is raised to 8
    // rather than to whatever is on disk today: it must still catch a regression, and the
    // gap is one more register grid's worth of headroom, not open-ended.
    assert(mb < 8, `voices/ is ${mb.toFixed(2)} MB, over the 8 MB budget`);
    return `${mb.toFixed(2)} MB`;
});

console.log(`\n${pass}/${pass + failures.length} checks passed`);
if (failures.length) {
    console.error(`\n${failures.length} FAILED:`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
}
