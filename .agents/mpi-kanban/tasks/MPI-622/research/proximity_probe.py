"""Is 'down the street' LEVEL, or is it the model rendering a different room?

Fabio, 2026-08-26, on the R1 identity pair: "neutral is really close to the mic, and angry
feels like it's down the street. Probably because of volume changes or normalisation."

Two hypotheses, and they are separable:

  H1 LEVEL   - my norm pass left angry 2 dB quieter (peak ceiling clamped it before its RMS
               reached target). Fix: match rms_active EXACTLY, with headroom so nothing clips.
  H2 ROOM    - VoiceDesign actually rendered a more distant acoustic space for the angry
               direction. Distance is carried by HF rolloff and a flatter dynamic profile,
               not by loudness - so it SURVIVES level matching.

This script measures the H2 evidence objectively, then emits an exactly level-matched R1 set
so H1 is removed from the next listen. If 'down the street' persists on the matched pair,
it is H2 and the fix is a prompt change, not a gain change.
"""
import os
import sys

import numpy as np
import soundfile as sf

SRC = sys.argv[1]
OUT = sys.argv[2]
TARGET_RMS_DB = -20.0   # low enough that no clip needs peak limiting

os.makedirs(OUT, exist_ok=True)


def active(y, sr):
    """RMS over voiced/active frames only - silence must not drag the average."""
    win = int(0.02 * sr)
    frames = y[:len(y) // win * win].reshape(-1, win)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    gate = rms > (rms.max() * 0.1)
    return frames[gate].ravel() if gate.any() else y


def tilt(y, sr):
    """Proximity proxies. A DISTANT source loses highs and flattens its dynamics."""
    spec = np.abs(np.fft.rfft(y * np.hanning(len(y))))
    freqs = np.fft.rfftfreq(len(y), 1 / sr)
    band = lambda lo, hi: spec[(freqs >= lo) & (freqs < hi)].sum() + 1e-12
    low, high = band(100, 1000), band(4000, 11000)
    centroid = float((freqs * spec).sum() / (spec.sum() + 1e-12))
    peak, rms = np.abs(y).max(), np.sqrt((y ** 2).mean())
    crest = 20 * np.log10(peak / (rms + 1e-12) + 1e-12)
    return 10 * np.log10(high / low), centroid, crest


print(f"{'clip':22s} {'HF/LF dB':>9s} {'centroid':>9s} {'crest dB':>9s}  "
      f"{'rms_act':>8s} -> matched")
rows = []
for name in sorted(os.listdir(SRC)):
    if not name.endswith(".wav") or not name.startswith("perf_R1"):
        continue
    y, sr = sf.read(os.path.join(SRC, name), dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)

    hf_lf, centroid, crest = tilt(y, sr)
    a = active(y, sr)
    rms_db = 20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-12)

    gain = 10 ** ((TARGET_RMS_DB - rms_db) / 20)
    z = y * gain
    peak_db = 20 * np.log10(np.abs(z).max() + 1e-12)
    sf.write(os.path.join(OUT, name), z, sr)

    print(f"{name:22s} {hf_lf:9.1f} {centroid:9.0f} {crest:9.1f}  "
          f"{rms_db:8.1f} -> {TARGET_RMS_DB:.1f} (peak {peak_db:.1f})")
    rows.append((name, hf_lf, centroid))

ref = dict((n, (h, c)) for n, h, c in rows)
if "perf_R1_neutral.wav" in ref and "perf_R1_angry.wav" in ref:
    hn, cn = ref["perf_R1_neutral.wav"]
    ha, ca = ref["perf_R1_angry.wav"]
    print(f"\nangry vs neutral:  HF/LF {ha - hn:+.1f} dB   centroid {ca - cn:+.0f} Hz")
    print("A clearly NEGATIVE HF/LF delta and a lower centroid = the angry clip really is")
    print("duller, i.e. a more distant render (H2). Near-zero on both = it was only level (H1).")
