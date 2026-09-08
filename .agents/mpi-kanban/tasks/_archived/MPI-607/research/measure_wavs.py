"""Report duration / sample rate / peak / RMS / silence ratio for wavs.

Silence ratio = fraction of 20ms frames whose peak is below -50 dBFS. This is the
numeric half of the Step 2b check; the timbre half is Fabio's ears.
"""
import glob
import sys

import numpy as np
import soundfile as sf

paths = []
for arg in sys.argv[1:]:
    paths.extend(sorted(glob.glob(arg)))

print(f"{'file':52} {'sr':>6} {'sec':>6} {'peak dB':>8} {'rms dB':>7} {'silent%':>8}")
for p in paths:
    x, sr = sf.read(p, always_2d=True)
    x = x.mean(axis=1)
    n = len(x)
    frame = max(1, int(sr * 0.02))
    trimmed = x[: n - (n % frame)].reshape(-1, frame)
    frame_peak = np.abs(trimmed).max(axis=1)
    silent = float((frame_peak < 10 ** (-50 / 20)).mean() * 100)
    peak = np.abs(x).max()
    rms = np.sqrt((x ** 2).mean())
    to_db = lambda v: 20 * np.log10(v) if v > 0 else -999.0
    name = p.replace("\\", "/").split("/")[-1]
    print(f"{name:52} {sr:6d} {n / sr:6.2f} {to_db(peak):8.1f} {to_db(rms):7.1f} {silent:8.1f}")
