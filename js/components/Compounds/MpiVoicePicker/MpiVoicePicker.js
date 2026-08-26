import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs, qsa, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';
import { createVoiceLibrary, EMOTIONS } from '../../../data/voiceLibrary.js';
import { clientLogger } from '../../../services/clientLogger.js';

/**
 * MpiVoicePicker — voice selection compound for the TTS/VC flows (MPI-622).
 *
 * Composes MpiButton + MpiRadioGroup over a voiceLibrary instance.
 *
 * THE LIST IS SECTIONS OF VARIATIONS, not a flat voice list. The shipped library is 15
 * sections holding 56 clips, and within a section they are one voice performed slightly
 * differently rather than distinct voices (Fabio's ear, 2026-08-26). A section of one
 * renders as a plain voice.
 *
 * THE SECTIONS ARE DIVIDED INTO DEMOGRAPHIC GROUPS and there are NO FILTERS (Fabio,
 * 2026-08-26 — "we don't have that many voices to even think of filters at this point").
 * The group is ordering only, never a second grouping level: two sections under one heading
 * are two different voices. Playback previews whichever route the mount declares.
 *
 * Props:
 * @param {object} manifest              - A plain voice manifest object (voices + performanceClips arrays).
 *                                          Pass your own fixture; the component never fetches.
 * @param {'narration'|'character'} [route='narration']
 *                                        - Which route this mount previews. 'narration' plays
 *                                          the generated TTS audition; 'character' (VC) plays the
 *                                          RAW SAMPLE, because that is the file handed to
 *                                          `target_voice` and no generated clip can preview a
 *                                          conversion whose source is the user's own recording.
 * @param {string} [selectedVoiceId]     - Pre-selected voice id.
 * @param {number|null} [userPitchHz]    - Median F0 of the user's own uploaded sample (Hz).
 *                                          When provided, pitch-distance warnings are shown.
 * @param {number} [warnSemitones=6]     - Semitone threshold above which the warning appears.
 *                                          Defaults to 6 (≈ a perfect fourth — audibly jarring).
 * @param {string} [kind]                - Narrow to one route's voices: 'narration' | 'character' |
 *                                          '' (all). No UI — inert against the shipped library,
 *                                          where every voice is `kind: 'both'`.
 * @param {boolean} [emotions=true]      - Render the emotion control. FALSE on the Voice Changer
 *                                          mount: that flow has no TTS stage, so the user's own
 *                                          recording already carries the delivery and the control
 *                                          would act on nothing. See `_showEmotions` below.
 *
 * Emits:
 * 'select' { voice, emotion? }   — user confirmed a voice (emotion only when the control showed)
 * 'audition-start' { voice }     — audition playback began
 * 'audition-stop'  {}            — audition playback stopped
 */
export const MpiVoicePicker = ComponentFactory.create({
    name: 'MpiVoicePicker',
    css: ['js/components/Compounds/MpiVoicePicker/MpiVoicePicker.css'],

    // NO FILTER ROW. Kind / register / gender / language were four dropdowns over 15
    // sections, and three of them could not narrow anything: every voice is `kind: 'both'`,
    // so the kind filter matched all 56 rows on every option, and register is the internal
    // pitch axis Fabio had already told us to drop as user-facing. Fabio, 2026-08-26: "we
    // don't have that many voices to even think of filters at this point. I think if they're
    // properly organised, that's more than enough." The organisation IS the navigation.
    // THE FOOTER IS ALWAYS PRESENT, and it is the only thing below the list. It used to be
    // a detail PANEL that appeared on selection, carrying the voice name and an actions row —
    // which meant the confirm button moved, appeared late, and pushed the list around
    // (Fabio, 2026-08-26: "the select voice area should just be a select voice button and
    // should always be visible at the bottom of the overlay because right now it looks bad").
    // The selected card is already highlighted, so repeating its name below it said nothing.
    template: () => `
        <div class="mpi-voice-picker">
            <div class="mpi-voice-picker__list" id="vp-list"></div>
            <div class="mpi-voice-picker__footer" id="vp-footer">
                <div class="mpi-voice-picker__emotion-row" id="vp-emotion-row" hidden></div>
                <div class="mpi-voice-picker__footer-actions" id="vp-footer-actions"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        // The detail panel re-renders per selection and remounts its components each time,
        // so its teardowns are collected and flushed on every re-render.
        const _detailUnsubs = [];

        // ── Library ───────────────────────────────────────────────────────────
        const manifest = props.manifest || { voices: [], performanceClips: [] };
        let lib;
        try {
            lib = createVoiceLibrary(manifest);
        } catch (err) {
            clientLogger.error('voice-picker', 'Bad manifest', err);
            qs('#vp-list', el).textContent = 'Voice library failed to load.';
            el.destroy = () => {};
            return;
        }

        // The only filter left, and it has no UI: a mount may narrow to one route's voices.
        // Inert against the shipped library (every voice is `kind: 'both'`), kept because the
        // TTS flow may ship narration-only voices later.
        const filter = { kind: props.kind || '' };

        // Which route this mount previews — decides what the play button plays.
        const _route = props.route === 'character' ? 'character' : 'narration';

        // WHETHER THE EMOTION CONTROL RENDERS AT ALL — settled with Fabio 2026-08-26.
        //
        // Emotion belongs to the TTS flow, where it is a real final-stage control: the
        // dropdown picks a PERFORMANCE CLIP, TTS speaks the user's text with that clip's
        // delivery, and VC then swaps the voice while carrying that delivery through.
        //
        // Voice Changer has no TTS stage. The user records themselves, so their own take
        // already carries the emotion and there is nothing for the control to act on — VC
        // does not ADD emotion, it preserves the source delivery and swaps timbre (measured,
        // MPI-607). So the VC mount passes `emotions: false` and gets no dead control.
        // Defaults true so the TTS flow gets it for free when it lands.
        const _showEmotions = props.emotions !== false;

        let _selectedId   = props.selectedVoiceId || null;
        let _selectedEmo  = 'neutral';
        let _audio        = null;     // current HTMLAudioElement
        let _playingId    = null;

        // ── Helpers ───────────────────────────────────────────────────────────

        function _stopAudio() {
            if (_audio) {
                _audio.pause();
                _audio.src = '';
                _audio = null;
                _playingId = null;
                emit('audition-stop', {});
            }
        }

        function _playAudition(voice) {
            _stopAudio();
            // WHAT PLAYS DEPENDS ON THE ROUTE THE PICKER WAS MOUNTED FOR.
            //
            // 'narration' (TTS) plays the generated narration audition — real output of the
            // route it previews.
            //
            // 'character' (VC) plays the RAW SAMPLE, and that reverses brief.md § 3's "never
            // play sample.opus". The old rule assumed a generated character audition was the
            // truer preview. It is not, and it cannot be: VC takes its delivery from the
            // SOURCE performance, which in the real flow is the user's own recording and does
            // not exist at audition time. Every character audition therefore previewed a
            // stand-in performer — all 60 were heard to merge into one voice per register
            // (Fabio, 2026-08-26) — and they were deleted. The sample IS the file handed to
            // `target_voice`, so it is the honest preview of a conversion target.
            const rel = _route === 'character'
                ? voice.sample
                : (voice.audition_narration || voice.sample);
            // Manifest paths are relative to voices/ — `new Audio('audition/x.opus')` would
            // resolve against the PAGE and 404. The gallery fixture leaves them null, so
            // playback never exercised this against a real manifest until now.
            const url = lib.assetUrl(rel);
            if (!url) {
                clientLogger.info('voice-picker', `No audition for voice ${voice.id}`);
                return;
            }
            _audio = new Audio(url);
            _audio.addEventListener('ended', () => {
                _playingId = null;
                _renderList();
            });
            _audio.addEventListener('error', () => {
                clientLogger.info('voice-picker', `Audition load failed for ${voice.id}`);
                _playingId = null;
                _renderList();
            });
            _playingId = voice.id;
            _audio.play().catch(() => {
                _playingId = null;
                _renderList();
            });
            emit('audition-start', { voice });
        }

        // ── Pitch-distance warning ────────────────────────────────────────────
        const WARN_SEMITONES = props.warnSemitones ?? 6;

        function _pitchWarning(voice) {
            const userHz = props.userPitchHz;
            if (!userHz || !voice.median_f0) return null;
            const dist = lib.pitchDistance(userHz, voice.median_f0);
            if (dist === null) return null;
            const absDist = Math.abs(dist);
            return absDist >= WARN_SEMITONES ? absDist : null;
        }

        // ── Voice card rendering ──────────────────────────────────────────────
        function _voiceCard(voice, inVariations = false) {
            const isSelected = voice.id === _selectedId;
            const isPlaying  = voice.id === _playingId;
            const warnSemi   = _pitchWarning(voice);

            // Inside a section the heading already carries the name, so the card shows only
            // "Variation N". A lone voice keeps its full label.
            const cardName = inVariations ? `Variation ${voice.variation}` : voice.display_name || voice.id;

            const warnHtml = warnSemi
                ? `<span class="mpi-voice-picker__warn" title="Pitch distance: ${warnSemi.toFixed(1)} semitones from your sample">
                       ${renderIcon('warning', 'sm')}${warnSemi.toFixed(0)} st off — still selectable
                   </span>`
                : '';

            return `
                <div class="mpi-voice-picker__card${isSelected ? ' mpi-voice-picker__card--selected' : ''}"
                     data-voice-id="${voice.id}" role="button" tabindex="0"
                     aria-pressed="${isSelected}">
                    <div class="mpi-voice-picker__card-main">
                        <div class="mpi-voice-picker__card-name">${_esc(cardName)}</div>
                        <div class="mpi-voice-picker__card-meta">
                            <!-- NO KIND BADGE. Every voice in the library has kind 'both', so
                                 it read "both" on all 56 rows and carried no information - Fabio
                                 did not recognise it when asked about it, which is the answer.
                                 NO REGISTER BADGE either: registers are an internal pitch fact
                                 used to pick performance clips, not a user-facing grouping - and
                                 inside a section the label actively lied (child_2 measures R5, so
                                 it rendered "Cartoon / Critter" under the "Child" heading).
                                 NO GENDER OR AGE BADGE: the GROUP HEADING above now says both,
                                 so a badge under every card repeats its own heading.
                                 The pitch warning below says the one thing a user needs, in
                                 semitones, and says it in plain language. -->
                            ${voice.language ? `<span class="mpi-voice-picker__badge">${_esc(voice.language)}</span>` : ''}
                        </div>
                        ${warnHtml}
                    </div>
                    <div class="mpi-voice-picker__card-actions">
                        <span class="mpi-voice-picker__audition-btn${isPlaying ? ' mpi-voice-picker__audition-btn--playing' : ''}"
                              data-audition="${voice.id}" role="button" tabindex="0"
                              aria-label="${isPlaying ? 'Stop' : 'Play'} audition">
                            ${renderIcon(isPlaying ? 'stop' : 'play', 'sm')}
                        </span>
                    </div>
                </div>
            `;
        }

        function _esc(str) {
            return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // ── Footer: emotion (when the mount wants it) + the one confirm button ─
        //
        // Both are mounted ONCE, at boot, and only ever updated afterwards. The old detail
        // panel re-mounted them on every card click and had to destroy the previous pair
        // first or leak one MpiButton per click; a footer that never re-renders cannot leak
        // and cannot move under the cursor.
        const _confirmBtn = MpiButton.mount(ce('div'), {
            variant: 'primary',
            text: 'Select voice',
            disabled: true,
        });
        qs('#vp-footer-actions', el).appendChild(_confirmBtn.el);
        _detailUnsubs.push(() => _confirmBtn.destroy?.());

        _confirmBtn.on('click', () => {
            const voice = _selectedId && lib.getVoice(_selectedId);
            if (!voice) return;
            // `_emotionShown()`, not the kind alone: a mount with no emotion control never
            // showed the user a choice, so reporting one would be inventing an answer.
            const payload = { voice };
            if (_emotionShown(voice)) payload.emotion = _selectedEmo;
            emit('select', payload);
        });

        /** Emotion belongs to character voices, and only where the mount asked for it. */
        function _emotionShown(voice) {
            return _showEmotions && !!voice
                && (voice.kind === 'character' || voice.kind === 'both');
        }

        const _emoRow = qs('#vp-emotion-row', el);
        let _emoGroup = null;
        if (_showEmotions) {
            _emoGroup = MpiRadioGroup.mount(ce('div'), {
                options: EMOTIONS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) })),
                value: _selectedEmo,
            });
            _emoGroup.on('change', ({ value }) => { _selectedEmo = value; });
            _emoRow.appendChild(_emoGroup.el);
            _detailUnsubs.push(() => _emoGroup.destroy?.());
        }

        /** Reflect the current selection in the footer. Never re-mounts anything. */
        function _syncFooter() {
            const voice = _selectedId ? lib.getVoice(_selectedId) : null;
            _confirmBtn.el.setDisabled(!voice);
            // Hidden rather than unmounted: the row's presence must not depend on which card
            // is selected, or the button jumps every time the user tries another voice.
            _emoRow.hidden = !_emotionShown(voice);
        }

        // ── List rendering ────────────────────────────────────────────────────
        function _renderList() {
            const listEl = qs('#vp-list', el);
            const groups = lib.listGroups(filter);

            if (!groups.length) {
                listEl.innerHTML = `<div class="mpi-voice-picker__empty">This library has no voices.</div>`;
                return;
            }

            // THREE LEVELS, and each one means something different:
            //
            //   GROUP    "Young male" — a demographic divider, and the whole of the
            //            navigation now that the filters are gone. Ordering only.
            //   SECTION  "Standard Male" — ONE VOICE. Two sections inside one group are two
            //            different voices, which is why the group does not flatten them.
            //   CARD     "Variation 3" — one clip of that voice. A section of one renders as
            //            a plain voice with no variation count (see `isVariations`).
            listEl.innerHTML = groups.map(grp => `
                <div class="mpi-voice-picker__group">
                    <div class="mpi-voice-picker__group-head">${_esc(grp.label)}</div>
                    ${grp.sections.map(g => `
                        <div class="mpi-voice-picker__section">
                            <div class="mpi-voice-picker__section-head">
                                <span class="mpi-voice-picker__section-name">${_esc(g.label)}</span>
                                ${g.isVariations
                                    ? `<span class="mpi-voice-picker__section-count">${g.voices.length} variations of one voice</span>`
                                    : ''}
                            </div>
                            ${g.voices.map(v => _voiceCard(v, g.isVariations)).join('')}
                        </div>
                    `).join('')}
                </div>
            `).join('');

            // CLICKING THE CARD SELECTS *AND* PLAYS. Auditioning used to require hitting the
            // small play icon, which Fabio called annoying (2026-08-26) — and it was the only
            // way to hear anything, so the primary action of the whole list was a 32px
            // target. Selecting without hearing is not a thing anyone wants here.
            //
            // Switching cards STOPS the previous one, which is `_playAudition`'s existing
            // first act (`_stopAudio`) — two voices talking over each other is the failure
            // this has to avoid, and one shared `_audio` handle is what guarantees it.
            const _activate = (id) => {
                const voice = lib.getVoice(id);
                if (!voice) return;
                if (_selectedId !== id) {
                    _selectedId = id;
                    _selectedEmo = 'neutral';
                }
                // Re-clicking the card that is playing stops it. Anything else plays.
                if (_playingId === id) _stopAudio();
                else _playAudition(voice);
                _renderList();
                _syncFooter();
            };

            qsa('.mpi-voice-picker__card', listEl).forEach(card => {
                on(card, 'click', () => _activate(card.dataset.voiceId));
                on(card, 'keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        _activate(card.dataset.voiceId);
                    }
                });
            });

            // The play icon is now a STATE INDICATOR that happens to be clickable. It no
            // longer needs its own handler — the click bubbles to the card, which does
            // exactly what a click on the icon should do. It keeps `role=button` and its
            // label so the state stays announced.
        }

        // ── Boot ──────────────────────────────────────────────────────────────
        _renderList();
        // Unconditional: the footer is always on screen, so it always has a state to show.
        _syncFooter();

        // ── Cleanup ───────────────────────────────────────────────────────────
        el.destroy = () => {
            _stopAudio();
            _detailUnsubs.splice(0).forEach(fn => fn?.());
        };
    },
});
