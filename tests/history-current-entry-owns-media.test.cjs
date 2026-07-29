'use strict';

// MPI-351 — the History workspace runs ONE op on the SELECTED entry, so that entry
// is the only image it may feed a graph. The old resolution treated "the PromptBox
// rail holds an image" as "the user supplied the input" and dropped the active
// entry, so one persisted chip (state.promptMedia[wsKey], re-injected on every
// mount) silently owned Input_Image for every later run — proven on real sidecars:
// upscale_002-005 and upscale_007 all recorded a two-hour-old kleinEdit output
// while a fresh crop was the active entry.
//
// Mirrored from source: js/components/Blocks/MpiGroupHistoryBlock/
// MpiGroupHistoryBlock.js  _generationFromPromptPayload.
//
// Video is NOT collapsed to the entry: i2v requires an IMAGE start frame, which a
// video entry can never fill. Its start/end frames come from the dedicated slots in
// MpiToolOptionsPrompt and the Extend/New-shot last-frame capture, so role-tagged
// frames (and audio) survive — untagged rail images do not.

const assert = require('node:assert/strict');
const test = require('node:test');

// --- op media-input contract stub (mirrors commandRegistry) ---
const SLOTS = {
    upscale:   [{ key: 'inputImage',  mediaType: 'image', required: true }],
    krea2Edit: [{ key: 'inputImage',  mediaType: 'image', required: true },
                { key: 'inputImage2', mediaType: 'image', required: false }],
    i2v:       [{ key: 'startFrame',  mediaType: 'image', required: true },
                { key: 'endFrame',    mediaType: 'image', required: false }],
    extend:    [{ key: 'inputVideo',  mediaType: 'video', required: true }],
};
const getCommandMediaInputs = (op) => SLOTS[op] || [];

// --- resolution under test ---
function resolveMedia({ operation, isVideo, currentItem, mediaItems = [] }) {
    const currentMediaType = isVideo ? 'video' : 'image';
    const mediaSlots = getCommandMediaInputs(operation);
    const wantsStartFrame = mediaSlots.some(slot => slot.key === 'startFrame');
    const wantsCurrentType = mediaSlots.some(slot => slot.mediaType === currentMediaType && slot.required !== false);
    const stagedMedia = isVideo
        ? mediaItems.filter(m => m.mediaType !== 'image' || m.role === 'startFrame' || m.role === 'endFrame')
        : [];
    const hasCurrentTypeMedia = stagedMedia.some(m => m.mediaType === currentMediaType);
    let resolvedMedia = stagedMedia;

    if (currentItem?.filePath) {
        const currentMedia = { url: currentItem.filePath, mediaType: currentMediaType, source: 'history' };
        if (!isVideo && wantsStartFrame) {
            resolvedMedia = [{ ...currentMedia, role: 'startFrame' }, ...stagedMedia];
        } else if (wantsCurrentType && !hasCurrentTypeMedia) {
            resolvedMedia = [currentMedia, ...stagedMedia];
        } else if (!mediaSlots.length && !hasCurrentTypeMedia) {
            resolvedMedia = [currentMedia, ...stagedMedia];
        }
    }
    return resolvedMedia;
}

const crop     = { filePath: 'Media/crop_011.png' };
const clip     = { filePath: 'Media/i2v_ms_024.mp4' };
// The real hijacker: a persisted rail chip pointing at an unrelated older entry.
const staleChip = { mediaType: 'image', role: 'inputImage', url: 'Media/.preview-assets/5b9ea765.png' };
const startFrame = { mediaType: 'image', role: 'startFrame', url: 'Media/frame-startFrame.png' };
const endFrame   = { mediaType: 'image', role: 'endFrame',   url: 'Media/frame-endFrame.png' };
const audioClip  = { mediaType: 'audio', role: 'inputAudio', url: 'Media/voice.wav' };

test('image history: a stale rail chip never displaces the selected entry', () => {
    const out = resolveMedia({ operation: 'upscale', isVideo: false, currentItem: crop, mediaItems: [staleChip] });
    assert.deepEqual(out.map(m => m.url), [crop.filePath]);
});

test('image history: a multi-image op still runs on the selected entry alone', () => {
    const out = resolveMedia({ operation: 'krea2Edit', isVideo: false, currentItem: crop, mediaItems: [staleChip] });
    assert.deepEqual(out.map(m => m.url), [crop.filePath]);
});

test('image history: no chip at all resolves the same way', () => {
    const out = resolveMedia({ operation: 'upscale', isVideo: false, currentItem: crop, mediaItems: [] });
    assert.deepEqual(out.map(m => m.url), [crop.filePath]);
});

test('video history: dedicated start/end frames and audio survive', () => {
    const out = resolveMedia({ operation: 'i2v', isVideo: true, currentItem: clip, mediaItems: [startFrame, endFrame, audioClip] });
    assert.deepEqual(out.map(m => m.url), [startFrame.url, endFrame.url, audioClip.url]);
});

test('video history: an untagged rail image is dropped, the clip still feeds a video op', () => {
    const out = resolveMedia({ operation: 'extend', isVideo: true, currentItem: clip, mediaItems: [staleChip] });
    assert.deepEqual(out.map(m => m.url), [clip.filePath]);
});
