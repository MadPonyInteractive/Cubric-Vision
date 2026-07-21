/**
 * frameSink.js — Frame-accurate decoded-frame source via mediabunny (WebCodecs).
 *
 * `<video>.currentTime` is not frame-accurate by spec (Chromium drives it off the
 * audio clock + float→int PTS truncation → ~0.5% drift). For paused / frame-step /
 * trim-playhead display we decode the EXACT frame with mediabunny and paint it on a
 * canvas overlay instead. Native `<video>` still handles PLAY.
 *
 * Color contract (MPI-283): we do the YUV→RGB conversion OURSELVES from the raw
 * I420 planes, because Chromium's canvas decode path mis-converts our clips — it
 * mis-tags the matrix (reports bt709 even for BT.601 SD content) and renders more
 * vivid than the `<video>` element (crbug 40539111 / 343011434). The `<video>`
 * element (and DaVinci, and our ffmpeg export) are the color reference. We match it
 * by picking the matrix the same way libx264 / Chromium's <video> do: frame
 * height ≥ 720 → BT.709, else BT.601, limited range. Verified exact (Δ≈0) against
 * <video> on both an SD (601) and an HD (709) clip. Cost is per-displayed-frame
 * only (paused/step), so clip length is irrelevant.
 *
 * Cross-platform contract: WebCodecs decode support varies by OS/Electron build.
 * Every sink is gated on `track.canDecode()`. If a clip can't be decoded, or any
 * step throws, `getFrameCanvas` returns null and the caller keeps native <video>.
 * Never worse than today (Mac/Linux/Windows).
 *
 * Usage:
 *   import { frameSink } from './frameSink.js';
 *   const canvas = await frameSink.getFrameCanvas(url, frameIndex, fps); // HTMLCanvasElement | null
 *   frameSink.dispose(url);        // on video change
 *   await frameSink.canDecode(url); // optional pre-check (bool)
 */

'use strict';

import {
    Input, ALL_FORMATS, UrlSource, VideoSampleSink,
} from '/node_modules/mediabunny/dist/bundles/mediabunny.mjs';
import { clientLogger } from './clientLogger.js';

// One live sink per URL. decodable=false → callers fall back to native <video>.
const _sinks = new Map();

async function _ensure(url) {
    let entry = _sinks.get(url);
    if (entry) return entry;

    try {
        const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) {
            entry = { input, track, sink: null, canvas: null, decodable: false };
        } else {
            entry = {
                input, track,
                sink: new VideoSampleSink(track),
                canvas: null, // reused output canvas
                decodable: true,
            };
        }
    } catch (err) {
        clientLogger.warn('frameSink', `decode setup failed for ${url}; native fallback`);
        entry = { input: null, track: null, sink: null, canvas: null, decodable: false };
    }
    _sinks.set(url, entry);
    return entry;
}

// Limited-range YUV→RGB. Matrix chosen by height, matching libx264's tagging and
// Chromium's <video> compositor (SD < 720 → BT.601, HD ≥ 720 → BT.709). Coeffs are
// the standard limited-range forms; Y scaled by 255/219, chroma centred at 128.
function _paintI420({ data, layout, width, height }, canvas) {
    const [yL, uL, vL] = layout;
    const cStride = uL.stride;
    const hd = height >= 720;
    // Cr/Cb → R/G/B coefficients (limited range)
    const kr = hd ? 1.7927 : 1.5960;   // V→R
    const kgu = hd ? 0.2132 : 0.3917;  // U→G
    const kgv = hd ? 0.5329 : 0.8129;  // V→G
    const kb = hd ? 2.1124 : 2.0172;   // U→B

    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(width, height);
    const px = out.data;
    for (let y = 0; y < height; y++) {
        const yRow = yL.offset + y * yL.stride;
        const cRow = (y >> 1);
        for (let x = 0; x < width; x++) {
            const Y = 1.1643 * (data[yRow + x] - 16);
            const cx = x >> 1;
            const U = data[uL.offset + cRow * cStride + cx] - 128;
            const V = data[vL.offset + cRow * cStride + cx] - 128;
            const o = (y * width + x) * 4;
            px[o]     = Y + kr * V;
            px[o + 1] = Y - kgu * U - kgv * V;
            px[o + 2] = Y + kb * U;
            px[o + 3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);
}

/**
 * Exact decoded frame at frameIndex, color-matched to <video>, as a canvas. null →
 * not decodable on this platform (or a non-I420 frame we don't hand-convert);
 * caller must fall back to native <video>.
 * @returns {Promise<HTMLCanvasElement|null>}
 */
async function getFrameCanvas(url, frameIndex, fps) {
    if (!url || !fps) return null;
    const entry = await _ensure(url);
    if (!entry.decodable) return null;
    let sample = null;
    let vf = null;
    try {
        sample = await entry.sink.getSample(frameIndex / fps);
        if (!sample) return null;
        vf = sample.toVideoFrame();
        // We only hand-convert planar 4:2:0 (our libx264 output). Anything else →
        // fall back to native <video> rather than paint wrong colors.
        if (!vf || (vf.format !== 'I420' && vf.format !== 'I420A')) return null;

        const width = vf.displayWidth;
        const height = vf.displayHeight;
        const buf = new Uint8Array(vf.allocationSize());
        const layout = await vf.copyTo(buf);

        if (!entry.canvas) entry.canvas = document.createElement('canvas');
        const canvas = entry.canvas;
        canvas.width = width;
        canvas.height = height;
        _paintI420({ data: buf, layout, width, height }, canvas);
        return canvas;
    } catch (err) {
        clientLogger.warn('frameSink', `getFrameCanvas failed (frame ${frameIndex}); native fallback`);
        return null;
    } finally {
        try { vf?.close(); } catch (_) { /* noop */ }
        try { sample?.close(); } catch (_) { /* noop */ }
    }
}

/** True if this clip can be frame-decoded on this platform. */
async function canDecode(url) {
    if (!url) return false;
    return (await _ensure(url)).decodable;
}

/** Release the sink for a URL (call on video change). */
function dispose(url) {
    _sinks.delete(url); // Sink/Input hold no manual GPU handles; GC reclaims.
}

/** Release everything (call on viewer teardown). */
function disposeAll() {
    _sinks.clear();
}

export const frameSink = { getFrameCanvas, canDecode, dispose, disposeAll };
