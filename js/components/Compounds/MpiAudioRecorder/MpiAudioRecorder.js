import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton, mountButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { Storage } from '../../../core/storage.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { encodeWav } from '../../../utils/wavEncoder.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';

/**
 * MpiAudioRecorder — record the user's microphone into a project audio file (Compound, MPI-573)
 *
 * Vision has always treated audio as first-class on the way IN — audio gallery cards,
 * audio media slots, an audio filter in the picker — but there was no way to CAPTURE
 * any. Every audio input had to come from a file the user made somewhere else. This is
 * that missing source, and it is the first half of the audio track: the music / TTS /
 * voice-clone Flows that follow all need reference audio, and a voice clone needs the
 * user's own voice specifically.
 *
 * Three states, one button changing meaning:
 *   idle      — a big mic. Click to arm the stream and start.
 *   recording — elapsed time + a live level meter. Click to stop.
 *   review    — playback, then Accept / Re-record / Discard.
 *
 * WHY IT ENCODES TO WAV. MediaRecorder on Chromium hands back a WebM container, and
 * `.webm` is classified as VIDEO by extension in five places on the server (the
 * reconciler at routes/projects.js:1008 and :2722 among them). The sidecar written at
 * upload time would say `audio`, and then the first project reload would silently
 * re-type the card to video. Ogg is not an option either — Chromium's MediaRecorder
 * cannot produce it. So the recorded blob is decoded and re-muxed as a 16-bit WAV,
 * which every one of those lists already knows is audio, and which ComfyUI's own audio
 * loaders take without a transcode.
 *
 * Usage — prefer the promise helper over mounting by hand:
 *   const file = await showAudioRecorder();   // File(.wav) | null
 *
 * Props: none.
 *
 * Emits:
 * 'accept' { file }  — Accept pressed; `file` is a WAV File
 * 'cancel' {}        — Discard, Escape or backdrop
 */
export const MpiAudioRecorder = ComponentFactory.create({
    name: 'MpiAudioRecorder',
    css: ['js/components/Compounds/MpiAudioRecorder/MpiAudioRecorder.css'],

    template: () => `
        <div class="mpi-audio-recorder" role="dialog" aria-modal="true" aria-label="Record audio">
            <div class="mpi-audio-recorder__title">Record audio</div>
            <div class="mpi-audio-recorder__stage">
                <div class="mpi-audio-recorder__mic" id="mic-slot"></div>
                <div class="mpi-audio-recorder__meter" id="meter-slot">
                    <div class="mpi-audio-recorder__meter-fill" id="meter-fill"></div>
                </div>
                <div class="mpi-audio-recorder__time" id="time-slot">0:00</div>
            </div>
            <div class="mpi-audio-recorder__playback" id="playback-slot"></div>
            <div class="mpi-audio-recorder__hint" id="hint-slot"></div>
            <div class="mpi-audio-recorder__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const _unsubs = [];

        // Live capture handles. All of them are torn down by _release(), which every
        // exit path calls — a mic left open keeps the OS recording indicator lit long
        // after the dialog is gone, which reads to the user as the app spying.
        let _stream = null;
        let _ctx = null;
        let _analyser = null;
        let _recorder = null;
        let _chunks = [];
        let _raf = 0;
        let _tick = 0;
        let _startedAt = 0;
        let _blob = null;
        let _audioEl = null;
        let _state = 'idle';   // idle | recording | review

        // backdropClose stays ON here (unlike the licence gate): a click outside a
        // recorder is unambiguously "not now", and _release() runs on teardown either
        // way, so the mic never survives the dismissal.
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(420px, 92vw)',
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        const meterFill = qs('#meter-fill', el);
        const timeSlot  = qs('#time-slot', el);
        const hintSlot  = qs('#hint-slot', el);
        const playSlot  = qs('#playback-slot', el);

        // ── The one big button. Its meaning follows the state ────────────────
        const micBtn = mountButton({
            icon: 'mic',
            size: 'lg',
            variant: 'secondary',
            extraClasses: 'mpi-audio-recorder__mic-btn',
        });
        micBtn.title = 'Start recording';
        _unsubs.push(on(micBtn, 'click', () => {
            if (_state === 'idle') _start();
            else if (_state === 'recording') _stop();
        }));
        qs('#mic-slot', el).appendChild(micBtn);

        // ── Actions ──────────────────────────────────────────────────────────
        const actions = qs('#actions-slot', el);

        const discardBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Discard', variant: 'secondary', size: 'md',
        });
        discardBtn.on('click', () => { emit('cancel', {}); el.hide(); });
        actions.appendChild(discardBtn.el);

        const redoBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Re-record', variant: 'secondary', size: 'md',
        });
        redoBtn.on('click', () => _reset());
        actions.appendChild(redoBtn.el);

        const acceptBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Accept', variant: 'primary', size: 'md', disabled: true,
        });
        acceptBtn.on('click', async () => {
            if (!_blob) return;
            acceptBtn.el.setDisabled(true);
            hintSlot.textContent = 'Encoding…';
            const file = await _toWavFile(_blob);
            if (!file) {
                hintSlot.textContent = 'That recording could not be encoded. Try again.';
                acceptBtn.el.setDisabled(false);
                return;
            }
            emit('accept', { file });
            el.hide();
        });
        actions.appendChild(acceptBtn.el);

        _render();

        // ── Capture ──────────────────────────────────────────────────────────

        /**
         * Arm the mic and start recording.
         *
         * The graph is source → gain → destination rather than recording the raw
         * track, so the input-gain setting is applied to what is actually written
         * rather than only to what the meter shows. The analyser hangs off the gain
         * node for the same reason: the meter has to report the recorded level, or a
         * user who turns the gain up sees no change and turns it up again.
         */
        async function _start() {
            const deviceId = Storage.getAudioInputDevice();
            const gain = Storage.getAudioInputGain();
            try {
                _stream = await navigator.mediaDevices.getUserMedia({
                    audio: deviceId ? { deviceId: { ideal: deviceId } } : true,
                });
            } catch (err) {
                // Two very different failures land here and the user can only fix one
                // of them from inside the app, so say which it is.
                const denied = err?.name === 'NotAllowedError';
                hintSlot.textContent = denied
                    ? 'Microphone access was refused. Allow it for Cubric Vision in your system privacy settings, then try again.'
                    : 'No microphone was found. Check it is plugged in and selected in Settings.';
                clientLogger.warn('audio-recorder', `getUserMedia failed: ${err?.name || err}`);
                return;
            }

            _ctx = new AudioContext();
            const source = _ctx.createMediaStreamSource(_stream);
            const gainNode = _ctx.createGain();
            gainNode.gain.value = gain;
            _analyser = _ctx.createAnalyser();
            _analyser.fftSize = 1024;
            const dest = _ctx.createMediaStreamDestination();
            source.connect(gainNode);
            gainNode.connect(_analyser);
            gainNode.connect(dest);

            _chunks = [];
            _recorder = new MediaRecorder(dest.stream);
            _recorder.ondataavailable = (e) => { if (e.data.size) _chunks.push(e.data); };
            _recorder.onstop = () => {
                _blob = new Blob(_chunks, { type: _recorder.mimeType || 'audio/webm' });
                // Release HERE, not in _stop(). MediaRecorder delivers its last chunk
                // and then onstop as queued tasks; tearing the graph down on a timer
                // beside them races that queue and can clip the tail off the take.
                _releaseCapture();
                _state = 'review';
                _buildPlayback();
                _render();
            };
            _recorder.start();

            _startedAt = Date.now();
            _state = 'recording';
            _render();
            _meterLoop();
            _tick = setInterval(_renderTime, 200);
        }

        function _stop() {
            if (_recorder?.state === 'recording') _recorder.stop();
            cancelAnimationFrame(_raf);
            clearInterval(_tick);
            meterFill.style.width = '0%';
        }

        function _meterLoop() {
            if (!_analyser) return;
            const buf = new Uint8Array(_analyser.fftSize);
            const step = () => {
                if (_state !== 'recording' || !_analyser) return;
                _analyser.getByteTimeDomainData(buf);
                // Peak, not RMS: the meter's job is to show the user they are being
                // heard and to warn about clipping, and RMS under-reads both on speech.
                let peak = 0;
                for (let i = 0; i < buf.length; i++) {
                    const v = Math.abs(buf[i] - 128) / 128;
                    if (v > peak) peak = v;
                }
                meterFill.style.width = `${Math.min(100, peak * 140).toFixed(1)}%`;
                meterFill.classList.toggle('mpi-audio-recorder__meter-fill--hot', peak > 0.92);
                _raf = requestAnimationFrame(step);
            };
            _raf = requestAnimationFrame(step);
        }

        function _renderTime() {
            const s = Math.floor((Date.now() - _startedAt) / 1000);
            timeSlot.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        }

        function _buildPlayback() {
            playSlot.textContent = '';
            if (_audioEl?.src) URL.revokeObjectURL(_audioEl.src);
            _audioEl = ce('audio', { src: URL.createObjectURL(_blob), controls: true });
            playSlot.appendChild(_audioEl);
        }

        function _reset() {
            _releaseCapture();
            if (_audioEl?.src) URL.revokeObjectURL(_audioEl.src);
            _audioEl = null;
            playSlot.textContent = '';
            _blob = null;
            _chunks = [];
            _state = 'idle';
            timeSlot.textContent = '0:00';
            meterFill.style.width = '0%';
            _render();
        }

        function _render() {
            const recording = _state === 'recording';
            const review = _state === 'review';

            el.classList.toggle('mpi-audio-recorder--recording', recording);
            el.classList.toggle('mpi-audio-recorder--review', review);

            micBtn.style.display = review ? 'none' : '';
            micBtn.title = recording ? 'Stop recording' : 'Start recording';
            micBtn.setIcon(recording ? 'stop' : 'mic');

            redoBtn.el.style.display = review ? '' : 'none';
            acceptBtn.el.setDisabled(!review);

            if (!review) {
                hintSlot.textContent = recording
                    ? 'Recording — click to stop'
                    : 'Click the microphone to start';
            } else {
                hintSlot.textContent = 'Accept saves the clip to this project.';
            }
        }

        /** Drop the mic. Idempotent — every exit path calls it. */
        function _releaseCapture() {
            cancelAnimationFrame(_raf);
            clearInterval(_tick);
            _stream?.getTracks().forEach(t => t.stop());
            _stream = null;
            _analyser = null;
            _ctx?.close().catch(() => {});
            _ctx = null;
            _recorder = null;
        }

        el.destroy = () => {
            _releaseCapture();
            if (_audioEl?.src) URL.revokeObjectURL(_audioEl.src);
            _audioEl = null;
            _unsubs.forEach(fn => fn());
            _unsubs.length = 0;
            discardBtn?.el?.destroy?.();
            redoBtn?.el?.destroy?.();
            acceptBtn?.el?.destroy?.();
            modal?.el?.destroy?.();
        };
    },
});

/**
 * Decode whatever MediaRecorder produced and re-mux it as a 16-bit WAV File.
 * See the component's header for why the container is changed rather than kept.
 * @param {Blob} blob
 * @returns {Promise<File|null>} null if the blob could not be decoded.
 */
async function _toWavFile(blob) {
    try {
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
        await ctx.close().catch(() => {});
        return new File([encodeWav(audio)], 'recording.wav', { type: 'audio/wav' });
    } catch (err) {
        clientLogger.warn('audio-recorder', `wav encode failed: ${err?.message || err}`);
        return null;
    }
}

/**
 * Show the recorder and resolve the recorded clip, or null if the user backed out.
 * A fresh instance per call — the dialog holds a live capture graph and one-shot state.
 * @returns {Promise<File|null>}
 */
export function showAudioRecorder() {
    return new Promise((resolve) => {
        const rec = MpiAudioRecorder.mount(document.createElement('div'), {});
        let settled = false;
        // Escape / ui:close-all-popups tear the modal down without emitting either.
        // Without this the caller's await never settles AND the mic is never released,
        // so the OS recording indicator stays lit — see MpiLicenceGate for the same
        // guard protecting the install chain.
        const observer = new MutationObserver(() => {
            if (!document.body.contains(rec.el)) finish(null);
        });
        const finish = (file) => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            rec.destroy();
            resolve(file);
        };
        rec.on('accept', ({ file }) => finish(file));
        rec.on('cancel', () => finish(null));
        rec.el.show();
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

/**
 * Record, and land the clip in the current project as a normal audio card.
 *
 * A recording is NOT an import: it exists nowhere else, so it takes the same route
 * a gallery drop takes — `uploadMediaFile` writes the file and its sidecar,
 * `media:imported` builds the card — rather than a Flow slot's place-and-hash path,
 * which would fill the slot and leave nothing behind.
 *
 * Both entry points (the gallery's Record button and the media picker's mic card)
 * go through here, so a recording is saved identically whichever surface reached it.
 *
 * @returns {Promise<{filePath:string, filename:string, itemId:string, duration:number|null}|null>}
 *          null if the user backed out, there is no open project, or the save failed.
 */
export async function recordAudioIntoProject() {
    const file = await showAudioRecorder();
    if (!file) return null;

    const project = state.currentProject;
    if (!project?.folderPath || !project?.id) {
        clientLogger.warn('audio-recorder', 'No current project — cannot save the recording');
        return null;
    }

    const uploaded = await uploadMediaFile(file, 'audio', project.folderPath, project.id, {
        filenamePrefix: 'recording', operation: 'recorded',
    });
    if (!uploaded) return null;

    Events.emit('media:imported', {
        url: uploaded.filePath,
        filename: uploaded.filename,
        itemId: uploaded.itemId,
        thumbPath: uploaded.thumbPath,
        pixelDimensions: uploaded.pixelDimensions,
        duration: uploaded.duration,
        mediaType: 'audio',
    });
    return uploaded;
}
