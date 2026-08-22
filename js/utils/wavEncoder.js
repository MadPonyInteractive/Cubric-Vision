/**
 * wavEncoder.js — AudioBuffer → 16-bit PCM WAV (MPI-573).
 *
 * Standalone and import-free on purpose: it is the only non-trivial logic behind
 * the mic recorder, and a bad RIFF header produces a file that saves cleanly and
 * plays as nothing. Keeping it out of the component is what lets it be tested in
 * bare Node against the real ffprobe (tests/audio-media-type.test.cjs).
 *
 * WHY WAV AT ALL. MediaRecorder on Chromium hands back a WebM container, and
 * `.webm` is classified as VIDEO by extension in five places on the server — so a
 * recording saved in its native container would come back as a video card on the
 * first project reload. Chromium's MediaRecorder cannot produce Ogg either, so the
 * clip is decoded and re-muxed here.
 */

/**
 * @param {{numberOfChannels:number, length:number, sampleRate:number,
 *          getChannelData:(c:number)=>Float32Array}} buf - an AudioBuffer, or
 *        anything with the same four members (which is what the test passes).
 * @returns {Blob} audio/wav
 */
export function encodeWav(buf) {
    const channels = buf.numberOfChannels;
    const frames = buf.length;
    const bytes = frames * channels * 2;
    const out = new DataView(new ArrayBuffer(44 + bytes));

    const str = (off, s) => { for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    out.setUint32(4, 36 + bytes, true);
    str(8, 'WAVEfmt ');
    out.setUint32(16, 16, true);            // fmt chunk size
    out.setUint16(20, 1, true);             // PCM
    out.setUint16(22, channels, true);
    out.setUint32(24, buf.sampleRate, true);
    out.setUint32(28, buf.sampleRate * channels * 2, true);   // byte rate
    out.setUint16(32, channels * 2, true);  // block align
    out.setUint16(34, 16, true);            // bits per sample
    str(36, 'data');
    out.setUint32(40, bytes, true);

    const src = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
    let off = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            // Clamp before scaling. A sample slightly over 1.0 is entirely possible
            // once input gain is applied, and left to overflow the int16 it wraps to
            // full-scale NEGATIVE — a loud take comes back as a burst of crackle
            // rather than as clipping.
            const s = Math.max(-1, Math.min(1, src[c][i]));
            out.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            off += 2;
        }
    }
    return new Blob([out.buffer], { type: 'audio/wav' });
}
