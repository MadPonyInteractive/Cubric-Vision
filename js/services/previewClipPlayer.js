/**
 * previewClipPlayer.js — MPI-571
 *
 * THE one consumer of the MPI-269 latent-preview bus. Every surface that shows
 * live latents (gallery card, Flow result pane, Group History viewer, the
 * minimised float window) drives one of these instead of re-implementing the
 * ring. Four re-implementations produced three different wrong behaviours —
 * a fast replay per sampler step, a dead video branch, and a single frozen
 * frame — which is the bug this module exists to delete.
 *
 * `docs/preview-bus.md` describes what arrives; this describes what to do with it.
 *
 * TWO MODES, and the run picks which:
 * - STILL — most models send one evolving frame per sampler step. Each frame
 *   REPLACES the last; the previous URL is freed.
 * - CLIP — the burst previewers (KJNodes' LTX override, our MpiVideoSamplingPreview
 *   on H3) send a whole clip of frame POSITIONS per step. Those samplers are
 *   distilled, so after step 1 the latent barely changes: the value is the MOTION,
 *   not the refinement. Frames arrive as an instant burst, so painting on arrival
 *   flashes the clip at burst speed and then freezes. We accumulate them into a
 *   rolling ring and LOOP it at the rate the clip announced.
 *
 * CLIP META IS A MIRROR, NEVER A LATCH (MPI-535). The `VHS_latentpreview` marker
 * that declares a run "clip" fires ONCE per sampler run, so a consumer that latched
 * it could never recover from missing it — and a single-pass H3 run is one prompt,
 * i.e. exactly one marker for four minutes of sampling. `activeGenerations` owns
 * that state for the run's whole life and hands it over with every frame; `push`
 * just reflects the latest word, so a miss self-heals on the next frame.
 *
 * `rate` and `length` are the clip's own contract and both are USED, not
 * decoration: playback runs at `rate` (H3 announces 24, KJNodes' LTX override 16;
 * 8 is only the fallback) and the ring is sized by `length` (a ring shorter than
 * the clip silently replays the tail — 48 of H3's 56 frames).
 *
 * THE PLAYER OWNS ITS FRAMES' LIFETIME when `ownsFrames` is set, and one of them
 * has to (MPI-508, `docs/preview-bus.md` § Blob ownership). The retainer frees the
 * URL — the bus keeps only the newest. The window is retained for an UNBOUNDED
 * time: the loop replays until the surface tears down, which for a video is minutes
 * after the last frame while the output downloads and thumbnails. A bus-side
 * "retire the old ones" rule cannot be written — measured 1298 ERR_FILE_NOT_FOUND
 * at a flat 8/s on exactly 48 distinct URLs when the emitter retired frames this
 * loop was still painting.
 *
 * AT MOST ONE PLAYER PER GENERATION MAY SET `ownsFrames`. Two players holding the
 * same run would have one revoking frames the other is still looping — the same
 * ERR_FILE_NOT_FOUND storm, now self-inflicted. The three in-renderer surfaces are
 * mutually exclusive by scope and can each own their frames: a gallery placeholder
 * exists only for `scope: 'gallery'`, the History viewer only for `groupHistory`,
 * and a Flow run deliberately mounts NO gallery placeholder (MPI-306). The float
 * bridge is the exception — it forwards EVERY run regardless of scope, so it
 * overlaps all three and must not own. Its frames therefore live until the page
 * unloads, which `docs/preview-bus.md` already accepts as the cost of a
 * no-retainer consumer: bounded by one run, and cheaper than the alternative.
 *
 * `ownsFrames` DEFAULTS TO FALSE on purpose. A fifth consumer that should have
 * owned its frames leaks a bounded, documented amount; one that should not have
 * owned them silently breaks another surface. Leak over corrupt.
 *
 * ponytail: an array + cursor + interval. No <video> element, no decoder, no
 * requestAnimationFrame — the frames are already decoded JPEGs and the rate is
 * announced, so a timer is the whole job.
 */

/** Fallback playback rate, fps — used only when the clip announces none. */
const PREVIEW_FPS = 8;
/** Fallback ring size, frames — used only when the clip announces no length. */
const PREVIEW_CLIP_MAX = 48;

/**
 * @typedef {Object} PreviewClipMeta
 * @property {number|null} rate   Frames per second the clip announced.
 * @property {number|null} length Frames in the clip — the ring size.
 */

/**
 * @typedef {Object} PreviewClipPlayer
 * @property {(url: string, clip?: PreviewClipMeta|null) => void} push
 *   Feed one bus frame. `clip` is `activeGenerations.getPreviewClip(genId)`,
 *   re-read per frame — pass it EVERY time, never once.
 * @property {(clip?: PreviewClipMeta|null) => void} reset
 *   New sampler stage (MPI-167): drop the current window so stages don't
 *   concatenate into one growing loop. The timer keeps running and the next
 *   frames build the new window.
 * @property {() => void} stop
 *   Teardown. Frees every retained frame and kills the timer. MUST be called
 *   from the surface's `destroy()` — a detached surface whose timer still runs
 *   repaints blobs its own generation already revoked, forever.
 * @property {() => boolean} isClip Whether the run is currently in clip mode.
 */

/**
 * @param {Object} hooks
 * @param {(url: string) => void} hooks.paint
 *   Put this URL on screen (or forward it). Called on the timer in clip mode and
 *   on arrival in still mode.
 * @param {(url: string) => void} [hooks.onEvict]
 *   Called immediately BEFORE a URL is revoked, so a surface with an in-flight
 *   preload for that URL can abort it. Revoking a URL whose <img> load is still
 *   in flight kills that load (net::ERR_FILE_NOT_FOUND) — measured at 1ms
 *   between append and eviction on a burst previewer.
 * @param {() => boolean} [hooks.canPaint]
 *   Gate the timer, e.g. the card's `_generating`. Default: always paint.
 * @param {boolean} [hooks.ownsFrames=false]
 *   Free evicted and torn-down blob URLs. At most ONE player per generation may
 *   set this — see the header. Default false: leak over corrupt.
 * @returns {PreviewClipPlayer}
 */
export function createPreviewClipPlayer({ paint, onEvict, canPaint, ownsFrames = false } = {}) {
    /** @type {string[]} rolling buffer of frame URLs */
    let _clip = [];
    /** play head into `_clip` */
    let _cursor = 0;
    let _timer = null;
    /** rate the running timer was armed at — so an unchanged rate doesn't restart it */
    let _timerRate = 0;
    /** @type {PreviewClipMeta|null} null = still mode */
    let _meta = null;

    const _rate = () => (_meta?.rate > 0 ? _meta.rate : PREVIEW_FPS);
    const _max  = () => (_meta?.length > 0 ? _meta.length : PREVIEW_CLIP_MAX);

    function _revoke(url) {
        if (!url || !url.startsWith('blob:')) return;
        onEvict?.(url);
        if (!ownsFrames) return;
        try { URL.revokeObjectURL(url); } catch { /* already revoked */ }
    }

    function _drop() {
        for (const url of _clip) _revoke(url);
        _clip = [];
        _cursor = 0;
    }

    function _paintNext() {
        if (!_clip.length) return;
        if (canPaint && !canPaint()) return;
        if (_cursor >= _clip.length) _cursor = 0; // loop
        paint(_clip[_cursor++]);
    }

    /** Run the playback timer at the clip's announced rate, restarting it on a change. */
    function _armTimer() {
        const rate = _rate();
        if (_timer && _timerRate === rate) return;
        if (_timer) clearInterval(_timer);
        _timerRate = rate;
        _paintNext(); // first frame immediately, then pace
        _timer = setInterval(_paintNext, 1000 / rate);
    }

    return {
        push(url, clip = null) {
            if (!url) return;
            if (clip && !_meta) {
                // Entering clip playback: the buffer holds at most one still frame
                // from before, which would otherwise sit in the loop as frame 0.
                _drop();
            }
            if (clip) _meta = clip; // the run's own word, re-read every frame

            if (!_meta) {
                // STILL mode: each frame replaces the last. Free the old one so
                // blobs don't leak — nothing is replaying it.
                const prev = _clip[0];
                _clip = [url];
                if (prev && prev !== url) _revoke(prev);
                paint(url);
                return;
            }

            _clip.push(url);
            // Sized by the clip's announced length: a ring shorter than the clip
            // drops its head, so the loop replays only the tail.
            while (_clip.length > _max()) {
                _revoke(_clip.shift());
                if (_cursor > 0) _cursor--; // keep the cursor aligned after eviction
            }
            _armTimer();
        },

        reset(clip = null) {
            if (clip) _meta = clip;
            _drop();
        },

        stop() {
            _meta = null;
            if (_timer) { clearInterval(_timer); _timer = null; }
            _timerRate = 0;
            _drop();
        },

        isClip: () => _meta !== null,
    };
}
