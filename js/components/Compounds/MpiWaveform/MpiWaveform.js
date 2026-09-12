/**
 * MpiWaveform — a baked audio waveform that fills as it plays (Compound).
 *
 * Paints the `showwavespic` derivative an audio item carries at its sidecar
 * `thumbPath` (see `services/ffmpegThumb.js` → `extractAudioWaveform`). That file
 * is an alpha MASK — white-on-transparent — not a picture, so this component
 * colours it with tokens and themes come for free.
 *
 * Two full-bleed layers stack: an unplayed one and a played one revealed by a
 * single `clip-path` boundary. Each layer paints a BACKGROUND fill as well as
 * the wave, so the surface reads as a progress bar with the wave sitting inside
 * it rather than as strokes that change colour.
 *
 * The mask is ONE 21:9 rendition on purpose (MPI-730). It is stretched to
 * whatever box mounts it — a square-ish gallery card or a short wide transport
 * strip are both the right wave — so do not bake a second rendition.
 *
 * Consumers own playback. This component never touches an <audio> element: it
 * is told where the playhead is and reports where a click landed, which is what
 * lets a gallery card and the audio player (MPI-731) mount the same thing.
 *
 * Props:
 *   mask:     string — URL of the baked mask (the item's `thumbPath`). Optional;
 *                      without it the layers paint their fills and no wave.
 *   progress: number — initial playhead as a fraction 0..1 (default 0)
 *   duration: number — clip length in seconds, used to turn a click into a time
 *
 * Instance API (on el):
 *   setMask(url)        — swap the mask (a re-selected history entry)
 *   setProgress(f)      — move the playhead; clamped to 0..1
 *   setDuration(s)      — clip length in seconds
 *   getProgress()       — current fraction
 *   destroy()
 *
 * Emits (component-local):
 *   'seek' { fraction, time } — the user clicked at `fraction` across the box.
 *                               `time` is seconds, or null when no duration is known.
 */

import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';

const _clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const MpiWaveform = ComponentFactory.create({
    name: 'MpiWaveform',
    css: ['js/components/Compounds/MpiWaveform/MpiWaveform.css'],

    template: () => `
        <div class="mpi-waveform">
            <div class="mpi-waveform__layer mpi-waveform__layer--rest"></div>
            <div class="mpi-waveform__layer mpi-waveform__layer--played" id="played"></div>
            <div class="mpi-waveform__rule mpi-waveform__rule--playhead" id="playhead"></div>
            <div class="mpi-waveform__rule mpi-waveform__rule--cursor" id="cursor"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const playedEl   = qs('#played', el);
        const playheadEl = qs('#playhead', el);
        const cursorEl   = qs('#cursor', el);
        const _unsubs = [];

        let _progress = _clamp01(props.progress);
        let _duration = Number(props.duration) > 0 ? Number(props.duration) : 0;

        // Both layers read the mask off one custom property on the root, so a
        // swap is a single write rather than one per layer.
        const _applyMask = (url) => {
            el.style.setProperty('--mpi-waveform-mask', url ? `url("${url}")` : 'none');
        };

        const _applyProgress = () => {
            const pct = _progress * 100;
            playedEl.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
            playheadEl.style.left = `${pct}%`;
            // At 0 the playhead would sit on the left edge of an untouched card
            // and read as a border. It appears once there is something behind it.
            playheadEl.style.opacity = _progress > 0 ? '1' : '0';
        };

        const _fractionAt = (clientX) => {
            const rect = el.getBoundingClientRect();
            if (!rect.width) return 0;
            return _clamp01((clientX - rect.left) / rect.width);
        };

        // The cursor rule shows where a click would land. Dimmer than the
        // playhead on purpose — it is a proposal, not a position.
        _unsubs.push(on(el, 'pointermove', (e) => {
            cursorEl.style.left = `${_fractionAt(e.clientX) * 100}%`;
            cursorEl.style.opacity = '1';
        }));
        _unsubs.push(on(el, 'pointerleave', () => { cursorEl.style.opacity = '0'; }));

        _unsubs.push(on(el, 'click', (e) => {
            const fraction = _fractionAt(e.clientX);
            emit('seek', { fraction, time: _duration > 0 ? fraction * _duration : null });
        }));

        el.setMask = (url) => _applyMask(url);
        el.setProgress = (f) => { _progress = _clamp01(f); _applyProgress(); };
        el.setDuration = (s) => { _duration = Number(s) > 0 ? Number(s) : 0; };
        el.getProgress = () => _progress;

        el.destroy = () => { _unsubs.forEach(fn => fn?.()); };

        _applyMask(props.mask);
        _applyProgress();
    },
});
