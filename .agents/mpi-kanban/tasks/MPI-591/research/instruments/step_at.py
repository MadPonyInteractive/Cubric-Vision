"""Is a named sample step ours, or the source's?

dropouts.py ranks each step against ITS OWN file's 99.99th percentile, and the
extension half is quieter than the source half - so the output's percentile sits
lower and an ordinary source-half event can surface as an outlier that the source
never reported. Compare the raw step values at the same timestamp instead.
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


def peak_step(path, t, halfwidth=0.02):
    a = load(path)
    d = np.abs(np.diff(a))
    lo, hi = int((t - halfwidth) * SR), int((t + halfwidth) * SR)
    seg = d[max(0, lo):min(len(d), hi)]
    p9999 = float(np.percentile(d, 99.99))
    return float(seg.max()), p9999


if __name__ == '__main__':
    t = float(sys.argv[1])
    for x in sys.argv[2:]:
        name, path = x.split('=', 1)
        step, p = peak_step(path, t)
        print('%-12s t=%.4f s  peak step %.5f   (that file 99.99pct %.5f -> x%.1f)'
              % (name, t, step, p, step / p))
