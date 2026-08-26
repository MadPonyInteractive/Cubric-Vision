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

const isRegister = r => Object.prototype.hasOwnProperty.call(REGISTERS, r);

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
export function createVoiceLibrary(manifest) {
    const voices = manifest?.voices ?? [];
    const clips = manifest?.performanceClips ?? [];

    for (const v of voices) {
        if (!isRegister(v.register)) {
            throw new Error(`voiceLibrary: voice "${v.id}" has unknown register "${v.register}"`);
        }
        if (!VOICE_KINDS.includes(v.kind)) {
            throw new Error(`voiceLibrary: voice "${v.id}" has unknown kind "${v.kind}"`);
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

    /** `kind: 'both'` ships two auditions and must answer to BOTH filters. */
    const isKind = (v, kind) => !kind || v.kind === kind || v.kind === 'both';

    return {
        listVoices(filter = {}) {
            const { kind, register, gender, age, accent, language } = filter;
            return voices.filter(v => isKind(v, kind)
                && (!register || v.register === register)
                && (!gender || v.gender === gender)
                && (!age || v.age === age)
                && (!accent || v.accent === accent)
                && (!language || v.language === language));
        },

        getVoice: id => byId.get(id) ?? null,

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
