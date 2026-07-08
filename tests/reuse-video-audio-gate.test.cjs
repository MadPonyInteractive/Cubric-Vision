'use strict';

// MPI-227 Phase 4 — the reuse payload op-gates saved media by type (image/video/
// audio), and payloadHasReusable{Images,Videos,Audio} report what a source can
// reuse. Mirrors js/utils/promptReuse.js: the buildPromptReusePayload gate + the
// _payloadHasReusableType predicates. Slot data mirrors the real commandRegistry
// (verified: t2i=[], i2v_ms=[image,image,audio], t2v_ms=[audio], extend/
// interpolate/videoUpscale/resizeVideo=[video]).

const assert = require('node:assert/strict');
const test = require('node:test');

const SLOTS = {
    t2i:          [],
    i2v_ms:       [{ mediaType: 'image' }, { mediaType: 'image' }, { mediaType: 'audio' }],
    t2v_ms:       [{ mediaType: 'audio' }],
    extend:       [{ mediaType: 'video' }],
    interpolate:  [{ mediaType: 'video' }],
    videoUpscale: [{ mediaType: 'video' }],
    resizeVideo:  [{ mediaType: 'video' }],
};
const getCommandMediaInputs = (op) => SLOTS[op] || [];
const accepts = (op, type) => getCommandMediaInputs(op).some(s => s.mediaType === type);

// --- gate (buildPromptReusePayload savedMediaItems filter) ---
function opGateSavedMedia(op, saved) {
    const acceptsImage = accepts(op, 'image');
    const acceptsVideo = accepts(op, 'video');
    const acceptsAudio = accepts(op, 'audio');
    return saved.filter(m => {
        const type = m.mediaType ?? m.type;
        if (type === 'image') return acceptsImage;
        if (type === 'video') return acceptsVideo;
        if (type === 'audio') return acceptsAudio;
        return true;
    });
}

// --- predicates (_payloadHasReusableType) ---
const hasType = (items, t) => items.some(m => m && (m.url || m.filePath) && (m.mediaType === t || m.type === t));

const img = { mediaType: 'image', url: 'a.png' };
const vid = { mediaType: 'video', url: 'a.mp4' };
const aud = { mediaType: 'audio', url: 'a.mp3' };

test('extend op-gates to video only; hasReusableVideo true, others false', () => {
    const gated = opGateSavedMedia('extend', [img, vid, aud]);
    assert.deepEqual(gated, [vid]);
    assert.equal(hasType(gated, 'video'), true);
    assert.equal(hasType(gated, 'image'), false);
    assert.equal(hasType(gated, 'audio'), false);
});

test('interpolate keeps video', () => {
    assert.deepEqual(opGateSavedMedia('interpolate', [vid, aud]), [vid]);
});

test('LTX i2v_ms keeps image + audio; hasReusableAudio true', () => {
    const gated = opGateSavedMedia('i2v_ms', [img, vid, aud]);
    assert.deepEqual(gated, [img, aud], 'video dropped (no video slot), image+audio kept');
    assert.equal(hasType(gated, 'audio'), true);
    assert.equal(hasType(gated, 'image'), true);
    assert.equal(hasType(gated, 'video'), false);
});

test('t2v_ms keeps audio only', () => {
    assert.deepEqual(opGateSavedMedia('t2v_ms', [img, vid, aud]), [aud]);
});

test('t2i drops all three (no media inputs)', () => {
    const gated = opGateSavedMedia('t2i', [img, vid, aud]);
    assert.deepEqual(gated, []);
    assert.equal(hasType(gated, 'image'), false);
    assert.equal(hasType(gated, 'video'), false);
    assert.equal(hasType(gated, 'audio'), false);
});
