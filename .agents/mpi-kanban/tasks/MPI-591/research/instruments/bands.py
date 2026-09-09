"""BRIGHTNESS continuity across the join - the thing level.py cannot see.

`level.py` reports one broadband RMS step. A continuation that is uniformly 6 dB
quieter and a continuation that has been low-pass filtered BOTH show up there as
"quieter", and nothing in that number separates them. Fabio's ear did, on arm A2
(2026-09-08): the horses' hooves came back soft, "like they had a low-pass filter
on them" - level was only half the story.

So split the same two steady windows `level.py` uses into bands and report the
step PER BAND, then subtract the MEDIAN step to get the SHAPE - what each band
did over and above the overall level change. A pure level change moves every
band together and the shape is flat. A filter shows up as a band that deviates.

The shape is the verdict, NOT a top-minus-bottom tilt. A tilt read that way was
tried first and is confounded: on this material the band that moves most is the
BOTTOM one, so a tilt anchored to it reports "brighter" for a clip whose bass
merely collapsed, and the spectral centroid rises for the same wrong reason.

Crest factor is printed alongside because a softened TRANSIENT - an attack that
smears rather than a band that vanishes - is audible as "softer" while leaving
every band level almost untouched. Neither this instrument nor `level.py` would
see that in the band table, and crest is the cheap tell.

H3 emits 32 kHz, so Nyquist is 16 kHz and the top band really is the top.

The source half of every arm is the same spliced-in footage, so the source-side
band levels are a free cross-arm sanity check: they must agree.

    python bands.py A2=joined.mp4 A2b=joined.mp4
    python bands.py --self-check
"""
import sys

import numpy as np

import level

# (label, lo Hz, hi Hz). The top band is the one Fabio's ear flagged.
BANDS = [('0-250', 0, 250), ('250-1k', 250, 1000), ('1k-2k', 1000, 2000),
         ('2k-4k', 2000, 4000), ('4k-8k', 4000, 8000), ('8k-16k', 8000, 16000)]


def band_db(x):
    """Per-band RMS in dB, plus the spectral centroid, for one stretch of audio."""
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    freq = np.fft.rfftfreq(len(x), 1.0 / level.SR)
    out = [level.db(np.sqrt(spec[(freq >= lo) & (freq < hi)].sum() / len(x)))
           for _, lo, hi in BANDS]
    centroid = (freq * spec).sum() / (spec.sum() + 1e-12)
    return out, centroid


def crest(x, win=0.05):
    """Peak-to-RMS in dB, averaged over short windows: how sharp the attacks are.

    A transient that smears loses crest while its band levels barely move, which
    is the one way "it sounds softer" can be true with a flat band table.
    """
    w = int(win * level.SR)
    n = len(x) // w
    f = x[:n * w].reshape(n, w)
    rms = np.sqrt((f ** 2).mean(axis=1)) + 1e-9
    return float(np.mean(level.db(np.abs(f).max(axis=1)) - level.db(rms)))


def report(name, path):
    a = level.load(path)
    # the same two steady windows level.py uses, so the numbers are comparable
    pre = a[int(1.0 * level.SR):int((level.JOIN - 0.5) * level.SR)]
    post = a[int((level.JOIN + 0.9) * level.SR):]
    pre_db, pre_c = band_db(pre)
    post_db, post_c = band_db(post)

    steps = [q - p for p, q in zip(pre_db, post_db)]
    overall = float(np.median(steps))

    print('%s   source-side %.2f s, extension %.2f s'
          % (name, len(pre) / level.SR, len(post) / level.SR))
    print('   band      source     ext      step     shape')
    for (label, _, _), p, q, s in zip(BANDS, pre_db, post_db, steps):
        print('  %-8s %7.2f %7.2f  %+7.2f  %+7.2f dB' % (label, p, q, s, s - overall))

    shape = [s - overall for s in steps]
    worst = max(range(len(shape)), key=lambda i: abs(shape[i]))
    print('  overall step (median across bands)  %+.2f dB' % overall)
    print('  crest factor  %.1f dB -> %.1f dB  (%+.1f dB)'
          % (crest(pre), crest(post), crest(post) - crest(pre)))
    print('  spectral centroid  %.0f Hz -> %.0f Hz  (%+.0f Hz)' % (pre_c, post_c, post_c - pre_c))
    print('  SHAPE: %s deviates most, %+.2f dB from the overall step -> %s'
          % (BANDS[worst][0], shape[worst],
             'NOT a plain level change' if abs(shape[worst]) >= 3.0 else
             'flat enough to call it a plain level change'))
    return shape


def self_check():
    """A level drop must read ~0 tilt; a low-pass must read clearly negative."""
    rng = np.random.default_rng(591)
    src = rng.standard_normal(int(4.0 * level.SR)).astype(np.float32) * 0.1

    quiet = src * 0.5                                     # -6 dB, spectrum untouched
    spec = np.fft.rfft(src)
    freq = np.fft.rfftfreq(len(src), 1.0 / level.SR)
    spec[freq > 3000] *= 0.05                             # -26 dB above 3 kHz
    dull = np.fft.irfft(spec, n=len(src)).astype(np.float32)

    def worst_shape(ext):
        p, _ = band_db(src)
        q, _ = band_db(ext)
        steps = [b - a for a, b in zip(p, q)]
        shape = [s - float(np.median(steps)) for s in steps]
        return max(shape, key=abs)

    s_quiet, s_dull = worst_shape(quiet), worst_shape(dull)
    print('self-check: uniform -6 dB   -> worst shape %+.2f dB (want ~0, it is a plain level drop)'
          % s_quiet)
    print('self-check: low-pass 3 kHz  -> worst shape %+.2f dB (want strongly negative)' % s_dull)
    ok = abs(s_quiet) < 1.0 and s_dull < -10.0
    print('self-check: %s' % ('PASS - the instrument separates a level drop from a filter'
                              if ok else 'FAIL'))
    return 0 if ok else 1


if __name__ == '__main__':
    if '--self-check' in sys.argv:
        sys.exit(self_check())
    for arg in sys.argv[1:]:
        name, path = arg.split('=', 1)
        report(name, path)
        print()
