import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs, qsa, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';
import { createVoiceLibrary, REGISTERS, EMOTIONS } from '../../../data/voiceLibrary.js';
import { clientLogger } from '../../../services/clientLogger.js';

/**
 * MpiVoicePicker — voice selection compound for the TTS/VC flows (MPI-622).
 *
 * Composes MpiDropdown + MpiButton + MpiRadioGroup over a voiceLibrary instance.
 * Two voice kinds (narration / character / both), filtering by register / gender /
 * age / language, audition playback (from audition.opus, never raw sample), and a
 * pitch-distance warning when the user's sample sits far from the performance clips.
 *
 * Props:
 * @param {object} manifest              - A plain voice manifest object (voices + performanceClips arrays).
 *                                          Pass your own fixture; the component never fetches.
 * @param {string} [selectedVoiceId]     - Pre-selected voice id.
 * @param {number|null} [userPitchHz]    - Median F0 of the user's own uploaded sample (Hz).
 *                                          When provided, pitch-distance warnings are shown.
 * @param {number} [warnSemitones=6]     - Semitone threshold above which the warning appears.
 *                                          Defaults to 6 (≈ a perfect fourth — audibly jarring).
 * @param {string} [kind]                - Initial kind filter: 'narration' | 'character' | '' (all).
 *
 * Emits:
 * 'select' { voice, emotion? }   — user confirmed a voice (emotion only set for character kind)
 * 'audition-start' { voice }     — audition playback began
 * 'audition-stop'  {}            — audition playback stopped
 */
export const MpiVoicePicker = ComponentFactory.create({
    name: 'MpiVoicePicker',
    css: ['js/components/Compounds/MpiVoicePicker/MpiVoicePicker.css'],

    template: () => `
        <div class="mpi-voice-picker">
            <div class="mpi-voice-picker__filters" id="vp-filters">
                <div class="mpi-voice-picker__filter-row">
                    <div class="mpi-voice-picker__filter-slot" id="vp-filter-kind"></div>
                    <div class="mpi-voice-picker__filter-slot" id="vp-filter-register"></div>
                    <div class="mpi-voice-picker__filter-slot" id="vp-filter-gender"></div>
                    <div class="mpi-voice-picker__filter-slot" id="vp-filter-language"></div>
                </div>
            </div>
            <div class="mpi-voice-picker__list" id="vp-list"></div>
            <div class="mpi-voice-picker__detail" id="vp-detail" hidden></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const _unsubs = [];
        // Filter dropdowns mount once and live for the component. The detail panel
        // re-renders per selection, so its mounts are tracked separately.
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

        // ── Filter state ──────────────────────────────────────────────────────
        const filter = {
            kind:     props.kind || '',
            register: '',
            gender:   '',
            language: '',
        };

        let _selectedId   = props.selectedVoiceId || null;
        let _selectedEmo  = 'neutral';
        let _audio        = null;     // current HTMLAudioElement
        let _playingId    = null;

        // ── Helpers ───────────────────────────────────────────────────────────
        const KIND_LABELS = { '': 'All voices', narration: 'Narration', character: 'Character', both: 'Both' };

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
            // Prefer audition clips over the raw sample. Never play sample.opus —
            // a character voice never sounds exactly like its own sample, so playing
            // it would promise a voice the product cannot deliver (brief.md § 3).
            const url = voice.kind === 'character'
                ? (voice.audition_character || voice.audition_narration)
                : (voice.audition_narration || voice.audition_character);
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
        function _voiceCard(voice) {
            const isSelected = voice.id === _selectedId;
            const isPlaying  = voice.id === _playingId;
            const warnSemi   = _pitchWarning(voice);

            const regInfo = REGISTERS[voice.register] || {};
            const kindBadgeMap = { narration: 'narration', character: 'character', both: 'both' };
            const kindBadge = kindBadgeMap[voice.kind] || voice.kind;

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
                        <div class="mpi-voice-picker__card-name">${_esc(voice.display_name || voice.id)}</div>
                        <div class="mpi-voice-picker__card-meta">
                            <span class="mpi-voice-picker__badge mpi-voice-picker__badge--${kindBadge}">${kindBadge}</span>
                            <span class="mpi-voice-picker__badge">${_esc(regInfo.label || voice.register)}</span>
                            ${voice.gender ? `<span class="mpi-voice-picker__badge">${_esc(voice.gender)}</span>` : ''}
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

        // ── Detail panel ──────────────────────────────────────────────────────
        function _renderDetail() {
            // The panel owns its own lifecycle. `detailEl.innerHTML = ...` below WIPES the
            // MpiRadioGroup and MpiButton this function mounted last time, so they must be
            // destroyed first — clearing a mounted component's DOM without calling its
            // destroy() leaks the instance and its detached subtree, once per voice click.
            // Flushed before the early returns on purpose: hiding the panel is a teardown too.
            _detailUnsubs.splice(0).forEach(fn => fn?.());

            const detailEl = qs('#vp-detail', el);
            if (!_selectedId) { detailEl.hidden = true; return; }

            const voice = lib.getVoice(_selectedId);
            if (!voice) { detailEl.hidden = true; return; }

            // Emotion row: character kind only
            const showEmo = voice.kind === 'character' || voice.kind === 'both';
            // Accent is meaningless for character voices (brief.md § "Design facts")
            const showAccent = (voice.kind === 'narration') && voice.accent;

            detailEl.hidden = false;
            detailEl.innerHTML = `
                <div class="mpi-voice-picker__detail-name">${_esc(voice.display_name || voice.id)}</div>
                ${showAccent ? `<div class="mpi-voice-picker__detail-row"><span class="mpi-voice-picker__detail-label">Accent</span><span>${_esc(voice.accent)}</span></div>` : ''}
                ${showEmo ? `<div class="mpi-voice-picker__emotion-row" id="vp-emotion-row"></div>` : ''}
                <div class="mpi-voice-picker__detail-actions" id="vp-detail-actions"></div>
            `;

            if (showEmo) {
                const emoRow = qs('#vp-emotion-row', el);
                const emoOptions = EMOTIONS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }));
                const radioWrap = ce('div');
                const radioGroup = MpiRadioGroup.mount(radioWrap, {
                    options: emoOptions,
                    value: _selectedEmo,
                });
                radioGroup.on('change', ({ value }) => { _selectedEmo = value; });
                emoRow.appendChild(radioWrap);
                _detailUnsubs.push(() => radioGroup.destroy?.());
            }

            // Confirm button
            const actionsEl = qs('#vp-detail-actions', el);
            const confirmWrap = ce('div');
            const confirmBtn = MpiButton.mount(confirmWrap, {
                variant: 'primary',
                text: 'Select voice',
            });
            confirmBtn.on('click', () => {
                const payload = { voice };
                if (voice.kind === 'character' || voice.kind === 'both') {
                    payload.emotion = _selectedEmo;
                }
                emit('select', payload);
            });
            actionsEl.appendChild(confirmWrap);
            _detailUnsubs.push(() => confirmBtn.destroy?.());
        }

        // ── List rendering ────────────────────────────────────────────────────
        function _renderList() {
            const listEl = qs('#vp-list', el);
            const voices = lib.listVoices(filter);

            if (!voices.length) {
                listEl.innerHTML = `<div class="mpi-voice-picker__empty">No voices match these filters.</div>`;
                return;
            }

            listEl.innerHTML = voices.map(_voiceCard).join('');

            // Click: select a card
            qsa('.mpi-voice-picker__card', listEl).forEach(card => {
                on(card, 'click', (e) => {
                    const audBtn = e.target.closest('[data-audition]');
                    if (audBtn) return;  // handled below
                    _selectedId = card.dataset.voiceId;
                    _selectedEmo = 'neutral';
                    _renderList();
                    _renderDetail();
                });
                on(card, 'keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        card.click();
                    }
                });
            });

            // Audition spans (role=button — need both click and keyboard activation)
            qsa('[data-audition]', listEl).forEach(btn => {
                const _toggleAudition = (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.audition;
                    if (_playingId === id) {
                        _stopAudio();
                        _renderList();
                    } else {
                        const voice = lib.getVoice(id);
                        if (voice) _playAudition(voice);
                        _renderList();
                    }
                };
                on(btn, 'click', _toggleAudition);
                on(btn, 'keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggleAudition(e); }
                });
            });
        }

        // ── Filter dropdowns ──────────────────────────────────────────────────
        function _buildFilters() {
            const allVoices = lib.listVoices({});

            // Kind filter
            const kindSlot = qs('#vp-filter-kind', el);
            const kindOptions = [
                { value: '', label: 'All voices' },
                { value: 'narration', label: 'Narration' },
                { value: 'character', label: 'Character' },
            ];
            const kindDd = MpiDropdown.mount(kindSlot, {
                options: kindOptions,
                value: filter.kind,
                placeholder: 'Kind',
            });
            kindDd.on('change', ({ value }) => {
                filter.kind = value;
                // Accent is meaningless for character — handled in _renderDetail
                _renderList();
                _renderDetail();
            });
            _unsubs.push(() => kindDd.destroy?.());

            // Register filter
            const regSlot = qs('#vp-filter-register', el);
            const regOptions = [
                { value: '', label: 'All registers' },
                ...Object.entries(REGISTERS).map(([k, v]) => ({ value: k, label: v.label })),
            ];
            const regDd = MpiDropdown.mount(regSlot, {
                options: regOptions,
                value: filter.register,
                placeholder: 'Register',
            });
            regDd.on('change', ({ value }) => { filter.register = value; _renderList(); });
            _unsubs.push(() => regDd.destroy?.());

            // Gender filter
            const genders = [...new Set(allVoices.map(v => v.gender).filter(Boolean))];
            const genderSlot = qs('#vp-filter-gender', el);
            if (genders.length) {
                const genderOptions = [{ value: '', label: 'All genders' }, ...genders.map(g => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) }))];
                const genderDd = MpiDropdown.mount(genderSlot, {
                    options: genderOptions,
                    value: filter.gender,
                    placeholder: 'Gender',
                });
                genderDd.on('change', ({ value }) => { filter.gender = value; _renderList(); });
                _unsubs.push(() => genderDd.destroy?.());
            }

            // Language filter
            const langs = [...new Set(allVoices.map(v => v.language).filter(Boolean))];
            const langSlot = qs('#vp-filter-language', el);
            if (langs.length) {
                const langOptions = [{ value: '', label: 'All languages' }, ...langs.map(l => ({ value: l, label: l }))];
                const langDd = MpiDropdown.mount(langSlot, {
                    options: langOptions,
                    value: filter.language,
                    placeholder: 'Language',
                });
                langDd.on('change', ({ value }) => { filter.language = value; _renderList(); });
                _unsubs.push(() => langDd.destroy?.());
            }
        }

        // ── Boot ──────────────────────────────────────────────────────────────
        _buildFilters();
        _renderList();
        if (_selectedId) _renderDetail();

        // ── Cleanup ───────────────────────────────────────────────────────────
        el.destroy = () => {
            _stopAudio();
            _detailUnsubs.splice(0).forEach(fn => fn?.());
            _unsubs.forEach(fn => fn?.());
        };
    },
});
