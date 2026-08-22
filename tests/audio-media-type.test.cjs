// MPI-573. Audio as a first-class media type: the mic recorder's WAV muxer, the
// server-side duration probe that feeds an audio card's length, and the enum +
// save-path wiring that lets an operation produce audio at all.
//
// The muxer is the part worth a test. A wrong RIFF header produces a file that
// saves without error, uploads without error, and plays as nothing — there is no
// failure to notice until a user clicks a silent card. So the header is asserted
// field by field AND the encoded bytes are handed to the real ffprobe, which is
// the same code path that stamps `duration` onto the sidecar.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { probeAudio } = require('../services/ffprobeVideo.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const SAMPLE_RATE = 48000;
const SECONDS = 0.5;

/** An AudioBuffer stand-in — the encoder only ever touches these four members. */
function fakeBuffer(channels, frames, fill) {
    const data = Array.from({ length: channels }, (_, c) =>
        Float32Array.from({ length: frames }, (_, i) => fill(i, c)));
    return {
        numberOfChannels: channels,
        length: frames,
        sampleRate: SAMPLE_RATE,
        getChannelData: (c) => data[c],
    };
}

async function encodeToBuffer(buf) {
    const { encodeWav } = await import('../js/utils/wavEncoder.js');
    return Buffer.from(await encodeWav(buf).arrayBuffer());
}

test('the WAV header describes the audio it actually carries', async () => {
    const frames = Math.round(SAMPLE_RATE * SECONDS);
    const wav = await encodeToBuffer(fakeBuffer(2, frames, (i) =>
        Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 0.5));

    const dataBytes = frames * 2 * 2;   // frames x channels x 16-bit
    assert.strictEqual(wav.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.strictEqual(wav.readUInt32LE(4), 36 + dataBytes, 'RIFF size excludes the first 8 bytes');
    assert.strictEqual(wav.subarray(8, 12).toString('ascii'), 'WAVE');
    assert.strictEqual(wav.subarray(12, 16).toString('ascii'), 'fmt ');
    assert.strictEqual(wav.readUInt32LE(16), 16, 'PCM fmt chunk is 16 bytes');
    assert.strictEqual(wav.readUInt16LE(20), 1, 'format 1 = PCM');
    assert.strictEqual(wav.readUInt16LE(22), 2, 'channel count');
    assert.strictEqual(wav.readUInt32LE(24), SAMPLE_RATE);
    // Byte rate and block align are derived, and a stereo file carrying mono's
    // numbers plays at half speed rather than failing — assert them explicitly.
    assert.strictEqual(wav.readUInt32LE(28), SAMPLE_RATE * 2 * 2, 'byte rate');
    assert.strictEqual(wav.readUInt16LE(32), 4, 'block align');
    assert.strictEqual(wav.readUInt16LE(34), 16, 'bits per sample');
    assert.strictEqual(wav.subarray(36, 40).toString('ascii'), 'data');
    assert.strictEqual(wav.readUInt32LE(40), dataBytes);
    assert.strictEqual(wav.length, 44 + dataBytes, 'no trailing slack');
});

test('samples past full scale clamp instead of wrapping to the opposite sign', async () => {
    // Input gain can push a take over 1.0. Unclamped, +1.2 overflows the int16 and
    // comes back as a large NEGATIVE sample — a loud recording that reads as crackle
    // rather than as clipping, which is the bug this clamp exists to prevent.
    const wav = await encodeToBuffer(fakeBuffer(1, 4, (i) => [1.2, -1.2, 0, 1][i]));
    assert.strictEqual(wav.readInt16LE(44), 0x7FFF, '+1.2 clamps to full-scale positive');
    assert.strictEqual(wav.readInt16LE(46), -0x8000, '-1.2 clamps to full-scale negative');
    assert.strictEqual(wav.readInt16LE(48), 0, 'silence stays silence');
    assert.strictEqual(wav.readInt16LE(50), 0x7FFF, 'exactly +1.0 is full scale, not an overflow');
});

test('probeAudio measures what the encoder wrote', async () => {
    const frames = Math.round(SAMPLE_RATE * SECONDS);
    const wav = await encodeToBuffer(fakeBuffer(2, frames, (i) =>
        Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 0.25));

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-audio-')), 'take.wav');
    fs.writeFileSync(file, wav);
    try {
        const info = await probeAudio(file);
        assert.ok(info, 'ffprobe returned nothing for a file it should read');
        // A raw WAV reports duration only at FORMAT level; a probe that reads the
        // stream field alone comes back 0 and every audio card shows 0:00.
        assert.ok(Math.abs(info.duration - SECONDS) < 0.02, `duration ${info.duration} != ~${SECONDS}`);
        assert.strictEqual(info.sampleRate, SAMPLE_RATE);
        assert.strictEqual(info.channels, 2);
    } finally {
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
});

test('probeAudio returns null rather than throwing on a file with no audio stream', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-audio-')), 'not-audio.wav');
    fs.writeFileSync(file, Buffer.from('this is not a RIFF file'));
    try {
        assert.strictEqual(await probeAudio(file), null);
    } finally {
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
});

test('MEDIA_TYPE admits audio as an output type', async () => {
    const { MEDIA_TYPE } = await import('../js/data/commandRegistry.js');
    assert.strictEqual(MEDIA_TYPE.AUDIO, 'audio');
    assert.ok(Object.isFrozen(MEDIA_TYPE));
});

// The save path is wiring, not maths — but every one of these branches is the
// difference between an audio card and a corrupt/mistyped one, and none of them
// can run headless (they need a live ComfyUI output to download).
test('save-generation keeps audio out of every image- and video-only branch', () => {
    const src = read('routes/projects.js');
    assert.match(src, /const isAudio = mediaType === 'audio';/, 'no audio branch in save-generation');
    // sharp would either throw on a WAV or rewrite it as an image.
    assert.match(src, /if \(!isVideo && !isAudio\) await stripImageMetadata/,
        'audio must skip the image metadata strip');
    assert.match(src, /type: isVideo \? 'video' : isAudio \? 'audio' : 'image'/,
        'the sidecar must record type audio');
    // The mux is the OTHER meaning of audio here — a video's soundtrack. It must
    // stay gated on isVideo, or an audio-primary save would try to mux into itself.
    assert.match(src, /if \(isVideo && audioViewUrl\)/, 'the mux stays video-only');
});

test('an audio-primary op promotes its Output_Audio to the primary output', () => {
    const src = read('js/services/generationService.js');
    assert.match(src, /model\.mediaType === 'audio' && !urls\.length && outputInfo\.audioUrl/,
        'the promotion must be gated on the OP declaring audio output');
    // Gated the other way round (empty + audio present), a video run that saved its
    // soundtrack and then failed would land as an audio card.
    const promo = src.slice(src.indexOf("model.mediaType === 'audio' && !urls.length"));
    assert.ok(promo.indexOf('urls = [outputInfo.audioUrl]') < promo.indexOf('if (!urls.length)'),
        'the promotion must run BEFORE the empty-output cancel guard');
});

test('a recording is saved as .wav, not in MediaRecorder native container', () => {
    // `.webm` is video by extension everywhere on the server, so a recording kept in
    // its native container would be re-typed to video on the first project reload.
    const src = read('js/components/Compounds/MpiAudioRecorder/MpiAudioRecorder.js');
    assert.match(src, /'recording\.wav'/, 'the File handed to the caller must be a .wav');
    assert.match(src, /type: 'audio\/wav'/);
    const routes = read('routes/projects.js');
    const audioExts = routes.match(/\['mp3', 'wav'[^\]]*\]/g) || [];
    assert.ok(audioExts.length, 'expected the server audio-extension lists to still exist');
    for (const list of audioExts) {
        assert.ok(list.includes("'wav'"), `wav missing from an audio extension list: ${list}`);
    }
});
