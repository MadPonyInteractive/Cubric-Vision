/**
 * voiceLibrary.js — the voice + performance-clip library the TTS/VC flows select from (MPI-622).
 *
 * Two kinds of voice, and a voice may be both:
 *
 *   narration  direct TTS (exaggeration 0.5 / cfg 0.3) — no emotion, lands ON the character.
 *   character  TTS(performance clip, exag 1.2 / cfg 0.3) → VC(character clip) — full emotion
 *              set, lands on a consistent OTHER voice.
 *
 * Emotion cannot come from the text (measured MPI-607: angry words read as disappointed), so
 * it comes from a PERFORMANCE CLIP — a shared grid of pitch register × emotion that every
 * character voice draws on. A new emotion costs one clip per register, not one per voice.
 *
 * `register` names the PERFORMER'S BASELINE, not the clip's measured pitch. Emotion moves
 * pitch — an angry take from a 101.5 Hz performer measured 136–274 Hz — so an (R1, Angry)
 * clip sits well above R1 and that is correct. `medianF0` carries the truth per clip.
 *
 * `accent` is NULLABLE ON PURPOSE and must never be inferred from a generation prompt or from
 * corpus metadata. A voice prompted as "refined British accent" was heard, cold, as a 1930s
 * New York gangster (MPI-622, and MPI-607 already closed accent-via-VoiceDesign as NEGATIVE:
 * an American prior that is not controllable). A wrong accent label is worse than a missing
 * one — the picker exists so a user need not audition sixty voices, and a wrong label spends
 * that trust. Leave it null until a human has listened.
 *
 * Fields per `.agents/mpi-kanban/tasks/MPI-622/brief.md` § 3.
 */

'use strict';

/** Pitch registers. Bands are Hz; R5 is open-ended. Mirrored in research/pitch_tools.py. */
export const REGISTERS = Object.freeze({
    R1: Object.freeze({ label: 'Low male', min: 70, max: 130 }),
    R2: Object.freeze({ label: 'High male / low female', min: 130, max: 190 }),
    R3: Object.freeze({ label: 'High female', min: 190, max: 260 }),
    R4: Object.freeze({ label: 'Child', min: 260, max: 340 }),
    R5: Object.freeze({ label: 'Cartoon / critter', min: 340, max: Infinity }),
});

/**
 * The emotion set, deliberately small and deliberately closed (Fabio, 2026-08-25: "we can't
 * realistically have a bunch of cover-all emotions, there are too many emotions to cover").
 * `Flat` is a CLIP, never a bypass — routing it through VC keeps the actor identical across
 * the transformation, which is the one beat where switching actor would hurt most.
 */
export const EMOTIONS = Object.freeze(['flat', 'neutral', 'angry', 'sad', 'cheerful', 'whisper']);

export const VOICE_KINDS = Object.freeze(['narration', 'character', 'both']);

/**
 * The order the user meets the library in, and the ONLY axis they see (Fabio, 2026-08-26).
 *
 * Filters are gone — "we don't have that many voices to even think of filters at this point.
 * I think if they're properly organised, that's more than enough." So the demographic is
 * ORDERING, not a second grouping level: a group is a divider holding whole SECTIONS, and the
 * section is still the voice. Flattening the sections into the group was considered and
 * rejected — Standard Female and Mature Female both land in "Mature female" and are NOT the
 * same voice, so one heading over both would re-make the claim his ear rejected in Phase 3.
 *
 * `Character` catches every section with no gender AND no age — Cartoon Critter,
 * Narrator / Trailer, Villain Monster. They are not a demographic and never will be.
 * A group with no sections is dropped, so this list may safely name more than ships.
 */
export const VOICE_GROUPS = Object.freeze([
    Object.freeze({ id: 'young_male',    label: 'Young male',    gender: 'male',   ages: ['young'] }),
    Object.freeze({ id: 'young_female',  label: 'Young female',  gender: 'female', ages: ['young'] }),
    // `adult` and `mature` are one group. They are two manifest values for the same place in
    // a user's head, and splitting them would put Standard Male and Deep Male under different
    // headings for a distinction nobody outside the manifest can hear.
    Object.freeze({ id: 'mature_male',   label: 'Mature male',   gender: 'male',   ages: ['adult', 'mature'] }),
    Object.freeze({ id: 'mature_female', label: 'Mature female', gender: 'female', ages: ['adult', 'mature'] }),
    Object.freeze({ id: 'old_male',      label: 'Old male',      gender: 'male',   ages: ['elderly'] }),
    Object.freeze({ id: 'old_female',    label: 'Old female',    gender: 'female', ages: ['elderly'] }),
    // No sex split for children — the library has none, and inventing one would be a label
    // no listener could verify.
    Object.freeze({ id: 'child',         label: 'Child',         gender: null,     ages: ['child'] }),
    Object.freeze({ id: 'character',     label: 'Character',     gender: null,     ages: [] }),
]);

const isRegister = r => Object.prototype.hasOwnProperty.call(REGISTERS, r);

/**
 * Every age `VOICE_GROUPS` can place, plus `null`.
 *
 * `null` is legitimate and must stay legal — Cartoon Critter, Narrator / Trailer and Villain
 * Monster have no age and belong in `Character` by design. But an age that is merely
 * MISSPELLED matches no group and falls into `Character` too, which puts a deep male voice
 * under "Character" where nobody will look for it. Same failure the register throw exists to
 * prevent: the manifest still reads correctly while the picker quietly shows the wrong thing.
 */
const KNOWN_AGES = new Set(VOICE_GROUPS.flatMap(g => g.ages));

/**
 * Build a library over an already-parsed manifest.
 *
 * Kept separate from `loadVoiceLibrary` so a test can drive it with a fixture object and no
 * fetch stub — the manifest is the only input this needs.
 *
 * Throws on an unknown `register`, `kind` or `emotion`. Silence would be worse than a throw:
 * a mistyped register makes a voice invisible to the picker's filter while the manifest still
 * looks correct, and the import pipeline that writes this file is re-runnable, so a loud
 * failure is cheap to fix.
 */
/** Human label for a section slug: 'villain_monster' → 'Villain Monster'. */
export function sectionLabel(section) {
    return String(section ?? '').split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function createVoiceLibrary(manifest, { baseUrl = '/voices/' } = {}) {
    const voices = manifest?.voices ?? [];
    const clips = manifest?.performanceClips ?? [];

    for (const v of voices) {
        if (!isRegister(v.register)) {
            throw new Error(`voiceLibrary: voice "${v.id}" has unknown register "${v.register}"`);
        }
        if (!VOICE_KINDS.includes(v.kind)) {
            throw new Error(`voiceLibrary: voice "${v.id}" has unknown kind "${v.kind}"`);
        }
        // `null`/absent is fine — see KNOWN_AGES. A non-empty unknown value is not.
        if (v.age != null && !KNOWN_AGES.has(v.age)) {
            throw new Error(`voiceLibrary: voice "${v.id}" has unknown age "${v.age}"`);
        }
    }
    for (const c of clips) {
        if (!isRegister(c.register)) {
            throw new Error(`voiceLibrary: clip "${c.id}" has unknown register "${c.register}"`);
        }
        if (!EMOTIONS.includes(c.emotion)) {
            throw new Error(`voiceLibrary: clip "${c.id}" has unknown emotion "${c.emotion}"`);
        }
    }

    const byId = new Map(voices.map(v => [v.id, v]));

    /** `kind: 'both'` serves both routes and must answer to BOTH filters. */
    const isKind = (v, kind) => !kind || v.kind === kind || v.kind === 'both';

    const filterVoices = (filter = {}) => {
        const { kind, register, gender, age, accent, language, section } = filter;
        return voices.filter(v => isKind(v, kind)
            && (!register || v.register === register)
            && (!gender || v.gender === gender)
            && (!age || v.age === age)
            && (!accent || v.accent === accent)
            && (!language || v.language === language)
            && (!section || v.section === section));
    };

    /**
     * The library grouped the way the user meets it: SECTIONS, each holding its
     * variations in `variation` order.
     *
     * This is the primary list, not a convenience over `listVoices`. The library is not
     * N distinct voices and never was — Fabio's ear, 2026-08-26, on headphones and on
     * raw samples: "every single section of 5 samples is like the same person just
     * talking slightly differently". Presenting 56 flat rows would promise 56 voices and
     * deliver 15. A section of one is a voice; `isVariations` is what the UI branches on
     * so a singleton is never labelled "Variation 1 of 1".
     *
     * Sections come back in manifest order, which is the import's sorted order, so the
     * list is stable across runs.
     */
    function listSections(filter = {}) {
        const groups = new Map();
        for (const v of filterVoices(filter)) {
            if (!groups.has(v.section)) {
                groups.set(v.section, { section: v.section, label: sectionLabel(v.section), voices: [] });
            }
            groups.get(v.section).voices.push(v);
        }
        for (const g of groups.values()) {
            g.voices.sort((a, b) => a.variation - b.variation);
            g.isVariations = g.voices.length > 1;
        }
        return [...groups.values()];
    }

    return {
        listVoices: filterVoices,

        listSections,

        /**
         * The sections again, but divided into `VOICE_GROUPS` order — the list the picker
         * actually renders.
         *
         * The group is derived from the section's FIRST voice, because a section is one
         * performer and its gender/age are declared per voice from the same source. A section
         * whose gender/age match no group (both null) falls to `character`.
         *
         * Empty groups are dropped rather than rendered as a heading over nothing.
         */
        listGroups(filter = {}) {
            const bucket = new Map(VOICE_GROUPS.map(g => [g.id, []]));
            for (const s of listSections(filter)) {
                const { gender, age } = s.voices[0] ?? {};
                const g = VOICE_GROUPS.find(grp => grp.ages.includes(age)
                    && (grp.gender === null || grp.gender === gender));
                bucket.get(g ? g.id : 'character').push(s);
            }
            return VOICE_GROUPS
                .map(g => ({ id: g.id, label: g.label, sections: bucket.get(g.id) }))
                .filter(g => g.sections.length > 0);
        },

        getVoice: id => byId.get(id) ?? null,

        /**
         * Absolute URL for a manifest-relative asset path.
         *
         * Manifest paths are relative to `voices/` ("audition/x.opus", "x.opus"), so passing
         * one straight to `new Audio()` resolves it against the PAGE and 404s. That bug
         * shipped in the picker and went unseen because the component-gallery fixture leaves
         * every audition path null, so playback was never exercised against a real manifest.
         */
        assetUrl: rel => (rel ? baseUrl + rel : null),

        /** The shared emotion grid for one register. Optionally narrowed to one emotion. */
        listPerformanceClips(register, emotion) {
            if (register && !isRegister(register)) {
                throw new Error(`voiceLibrary: unknown register "${register}"`);
            }
            return clips.filter(c => (!register || c.register === register)
                && (!emotion || c.emotion === emotion));
        },

        /**
         * How far a user's own recording sits from a performance clip, in semitones.
         *
         * This is the one number that predicts whether a pairing lands or sounds like a
         * costume, and no user will guess it. The picker WARNS on a large value and never
         * blocks — see brief.md § 4.
         */
        pitchDistance: (hzA, hzB) => (hzA > 0 && hzB > 0 ? 12 * Math.log2(hzB / hzA) : null),
    };
}

/**
 * Fetch the shipped manifest and build the library.
 *
 * `voices/` is in-repo beside `comfy_workflows/display/` (decision D1) — `copyAppTree` in
 * scripts/build-portable.mjs copies the app tree wholesale, so it ships on all three
 * platforms for free. User-supplied voices live in `userData` and never enter this bundle.
 */
export async function loadVoiceLibrary(url = '/voices/manifest.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`voiceLibrary: ${url} → HTTP ${res.status}`);
    return createVoiceLibrary(await res.json());
}
