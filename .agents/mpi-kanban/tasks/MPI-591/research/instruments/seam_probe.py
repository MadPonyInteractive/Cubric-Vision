"""Is the extension CONTINUING the source's audio, or covering it?

The verdict metric this saga has never had. level.py says how LOUD the extension
is; this says whether it is the same performance at all. The pinned head of the
new clip is the model's own reconstruction of the source's last N frames, so it
can be cross-correlated against them directly: 0.95+ is a continuation, 0.45 is a
cover band playing something that merely sounds similar.

Ported from NikoDemon80/ComfyUI-H3-Motion-Context tests/seam_probe.py (the pack
itself never enters the engine - plan.md D6). Changed here: audio comes through
level.py's ffmpeg loader, so the inputs are the MP4s the bench already writes
rather than FLACs, at H3's 32 kHz.

Usage:
    python seam_probe.py SOURCE.mp4 EXTENSION_UNTRIMMED.mp4 [--frames 22]

EXTENSION_UNTRIMMED is the raw generation, BEFORE the 22-frame trim - the pinned
head is the whole measurement, so trimming it away destroys the probe.

    corr high (>0.6), lag ~0        continuation
    corr high, lag slides           phase drift; crossfade the join
    corr low from the start         imitation, not continuation - the pin is
                                    not reaching the model at all
"""
import argparse
import sys

import numpy as np

from level import SR, load


def norm_xcorr(win, ref):
    """Slide `win` across `ref`; return (offsets, ncc) indexed by the window's
    start position within ref."""
    win = win - win.mean()
    ref = ref - ref.mean()
    wn = np.sqrt((win ** 2).sum())
    if wn < 1e-12:
        return None, None
    corr = np.correlate(ref, win, mode='valid')
    csum = np.concatenate(([0.0], np.cumsum(ref ** 2)))
    seg = csum[len(win):] - csum[:-len(win)]
    return np.arange(len(corr)), corr / (wn * np.sqrt(np.maximum(seg, 1e-12)))


def tracked_peak(ncc, expect_idx):
    """Pick this window's alignment with period-ambiguity handling.

    Music is periodic - a 100 Hz bassline repeats every 10 ms - so the global
    argmax can hop a whole cycle between windows and fake a drift. Take every
    local maximum within 10% of the global peak and follow the one CLOSEST to
    the previous window's alignment; real drift moves far less than a period per
    25 ms hop, so continuity keeps the true peak and discards the aliases.
    """
    best = float(ncc.max())
    i = np.arange(1, len(ncc) - 1)
    peaks = i[(ncc[i] >= ncc[i - 1]) & (ncc[i] >= ncc[i + 1]) & (ncc[i] >= 0.9 * best)]
    if len(peaks) == 0:
        peaks = np.array([int(np.argmax(ncc))])
    pick = int(peaks[np.argmin(np.abs(peaks - expect_idx))])
    return pick, float(ncc[pick])


def probe(src_path, ext_path, frames=22, fps=24.0, win_ms=50.0, hop_ms=25.0, search_ms=40.0):
    a = load(src_path).astype(np.float64)
    b = load(ext_path).astype(np.float64)

    span_s = frames / fps
    span = int(round(span_s * SR))
    if len(b) < span:
        sys.exit('extension shorter than the pinned span - is this the UNTRIMMED file?')
    if len(a) < span:
        sys.exit('source shorter than the pinned span')

    a_tail_start = len(a) - span          # b[0:span] should reconstruct a[-span:]
    win = int(round(win_ms / 1000.0 * SR))
    hop = int(round(hop_ms / 1000.0 * SR))
    search = int(round(search_ms / 1000.0 * SR))

    print('source %.3fs   extension (untrimmed) %.3fs   sr %d' % (len(a) / SR, len(b) / SR, SR))
    print('pinned span: %d frames = %.4fs = %d samples' % (frames, span_s, span))
    print('window %.0fms, hop %.0fms, search +/-%.0fms' % (win_ms, hop_ms, search_ms))
    print('\n%8s  %9s  %6s   region' % ('t_ext(s)', 'lag (ms)', 'corr'))

    lags, corrs = [], []
    t = 0
    prev_lag = None
    # run a little past the seam: alignment against the source's (nonexistent)
    # continuation should collapse there, and it is a check on the method
    while t + win <= span + int(0.2 * SR) and t + win <= len(b):
        centre = a_tail_start + t
        lo = max(0, centre - search)
        hi = min(len(a), centre + win + search)
        ref = a[lo:hi]
        if len(ref) <= win:
            break
        _, ncc = norm_xcorr(b[t:t + win], ref)
        if ncc is None:
            t += hop
            continue
        if prev_lag is None:
            # take the GLOBAL peak, not zero lag. Seeding at zero assumes the
            # first window is already aligned, and a whole-step offset then
            # reads as the nearest cycle alias - the exact failure this exists
            # to find.
            pick = int(np.argmax(ncc))
            corr = float(ncc[pick])
        else:
            pick, corr = tracked_peak(ncc, (centre - prev_lag) - lo)
        lag = centre - (lo + pick)        # positive = extension runs LATE
        in_span = t + win <= span
        print('%8.3f  %9.2f  %6.3f   %s' % (
            t / SR, lag / SR * 1000.0, corr, 'reconstruction' if in_span else 'past seam'))
        if in_span:
            lags.append(lag / SR * 1000.0)
            corrs.append(corr)
            if corr > 0.6:
                prev_lag = lag            # only track a credible match
        t += hop

    if not corrs:
        sys.exit('no windows analysed')
    corrs, lags = np.array(corrs), np.array(lags)
    strong = corrs > 0.6
    at_edge = np.abs(lags) >= (search_ms - 1.0)
    print('\nsummary over the reconstruction span:')
    print('  MEAN CORR %.3f   corr>0.6: %d/%d   lags pinned at search edge: %d' % (
        corrs.mean(), int(strong.sum()), len(corrs), int(at_edge.sum())))

    usable = strong & ~at_edge
    if usable.sum() >= 5 and corrs.mean() > 0.55:
        idx = np.nonzero(usable)[0].astype(np.float64)
        slope, intercept = np.polyfit(idx, lags[usable], 1)
        rms = float(np.sqrt(((lags[usable] - (slope * idx + intercept)) ** 2).mean()))
        total = slope * (len(corrs) - 1)
        print('  lag trend: %.2fms across the span, residual rms %.2fms' % (total, rms))
        if rms < 2.0 and corrs.mean() > 0.75 and abs(total) > 2.0:
            print('  -> DRIFT: tracks the source with a coherent %.1fms slide.' % total)
        elif rms < 2.0 and corrs.mean() > 0.75:
            print('  -> CONTINUATION: tracks the source with stable phase.')
        else:
            print('  -> PARTIAL RESEMBLANCE: resembles the tail but does not phase-lock '
                  '(mean corr %.2f, lag rms %.1fms). Imitation, not continuation.'
                  % (corrs.mean(), rms))
    else:
        print('  -> LOW/INCOHERENT CORRELATION: the regenerated head does not phase-track '
              'the source tail. The pin is not reaching the model; no window length fixes it.')
    return float(corrs.mean())


def _self_check():
    """The metric must separate a continuation from a cover band. Build both."""
    rng = np.random.default_rng(0)
    span = int(round(22 / 24.0 * SR))
    src = rng.standard_normal(SR * 5) * 0.1

    # a real continuation: the head IS the source's tail (plus a little noise)
    cont = np.concatenate([src[-span:] + rng.standard_normal(span) * 0.01,
                           rng.standard_normal(SR) * 0.1])
    # a cover band: same statistics, unrelated content
    cover = rng.standard_normal(len(cont)) * 0.1

    def mean_corr(b):
        win, hop = int(0.05 * SR), int(0.025 * SR)
        out = []
        for t in range(0, span - win, hop):
            _, ncc = norm_xcorr(b[t:t + win], src[len(src) - span + t - 1280:
                                                  len(src) - span + t + win + 1280])
            out.append(float(ncc.max()))
        return float(np.mean(out))

    good, bad = mean_corr(cont), mean_corr(cover)
    assert good > 0.9, 'continuation should score high, got %.3f' % good
    assert bad < 0.6, 'unrelated audio should score low, got %.3f' % bad
    print('self-check OK: continuation %.3f, cover band %.3f' % (good, bad))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('source', nargs='?')
    ap.add_argument('extension_untrimmed', nargs='?')
    ap.add_argument('--frames', type=int, default=22, help='pinned video frames')
    ap.add_argument('--fps', type=float, default=24.0)
    ap.add_argument('--win-ms', type=float, default=50.0)
    ap.add_argument('--hop-ms', type=float, default=25.0, help='25ms = one audio latent step')
    ap.add_argument('--search-ms', type=float, default=40.0)
    ap.add_argument('--self-check', action='store_true')
    a = ap.parse_args()
    if a.self_check:
        _self_check()
    else:
        if not a.source or not a.extension_untrimmed:
            ap.error('need SOURCE and EXTENSION_UNTRIMMED (or --self-check)')
        probe(a.source, a.extension_untrimmed, a.frames, a.fps, a.win_ms, a.hop_ms, a.search_ms)
