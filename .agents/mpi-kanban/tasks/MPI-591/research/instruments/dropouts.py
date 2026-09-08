"""Scan the WHOLE file for dropouts and steps, not just the join.

The 17 ms hole at the splice was real and is fixed, and Fabio still hears the
artefact - so either there is a second one somewhere else in the clip, or the
one he hears was never at the join. A scan that only looks where the bug is
expected cannot answer that, which is how the first one got mis-scoped.

Two detectors, both relative to the file's own statistics:

  * DROPOUT - a 5 ms window whose RMS is far below the median of the 100 ms
    either side of it. That is what a hole sounds like.
  * STEP    - a single-sample jump far above the file's 99.99th percentile.
    That is what a splice click sounds like.

Runs over the source clip too, so "the source already had it" is separable from
"we introduced it".
"""
import subprocess
import sys

import numpy as np

SR = 32000


def load(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-acodec', 'pcm_s16le',
         '-ac', '2', '-ar', str(SR), '-'],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype='<i2').astype(np.float32).reshape(-1, 2).mean(axis=1) / 32768.0


def report(name, path, top=8):
    a = load(path)
    w = SR // 200                      # 5 ms
    n = len(a) // w
    rms = np.sqrt((a[:n * w].reshape(n, w) ** 2).mean(axis=1)) + 1e-9
    ctx = 20                           # +-100 ms of context
    med = np.array([np.median(np.concatenate((rms[max(0, i - ctx):i], rms[i + 1:i + 1 + ctx])))
                    for i in range(n)])
    drop = 20 * np.log10(rms / med)    # dB below the local median
    d = np.abs(np.diff(a))
    p9999 = float(np.percentile(d, 99.99))

    print('%s  %.3f s   (99.99pct sample step %.5f)' % (name, len(a) / SR, p9999))
    order = np.argsort(drop)[:top]
    print('  deepest dropouts (5 ms window vs its local median):')
    for i in sorted(order):
        if drop[i] > -12:
            continue
        print('    %7.4f s  frame %6.1f   %6.1f dB below local   (abs %.1f dBFS)'
              % (i * w / SR, i * w / SR * 24, drop[i], 20 * np.log10(rms[i])))
    print('  biggest sample steps:')
    for k in np.argsort(d)[-4:][::-1]:
        print('    %7.4f s  frame %6.1f   step %.5f  (x%.1f the 99.99pct)'
              % (k / SR, k / SR * 24, d[k], d[k] / p9999))
    return a, drop


if __name__ == '__main__':
    for x in sys.argv[1:]:
        name, path = x.split('=', 1)
        report(name, path)
        print()
