"""Measure median f0 / register, and pitch-shift formant-preserving.

Run under the bench python:
  G:/ComfyUi/python_embeded/python.exe pitch_tools.py measure <file-or-dir>...
  G:/ComfyUi/python_embeded/python.exe pitch_tools.py shift <in.wav> <out.wav> <semitones>

`measure` is the QA gate's pitch half (brief.md section 5) -- cosine alone is
disqualified, so median f0 is always reported beside it.

`shift` uses Praat's "Change gender" with formant_shift_ratio 1.0: the pitch
median moves, the formants do NOT. That is the whole point -- a plain
resample-based shift (librosa/torchaudio pitch_shift) drags the formants along
and produces the chipmunk artefact this test exists to rule out.
"""
import sys
import os
import glob

import numpy as np
import librosa
import soundfile as sf
import parselmouth
from parselmouth.praat import call

REGISTERS = [
    ("R1", 90, 130),
    ("R2", 130, 190),
    ("R3", 190, 260),
    ("R4", 260, 340),
    ("R5", 340, 100000),
]


def register_of(f0):
    for name, lo, hi in REGISTERS:
        if lo <= f0 < hi:
            return name
    return "below-R1" if f0 < 90 else "?"


def measure(path):
    y, sr = librosa.load(path, sr=None, mono=True)
    f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=500, sr=sr)
    v = f0[~np.isnan(f0)]
    if v.size == 0:
        return None
    med = float(np.median(v))
    p10, p90 = (float(x) for x in np.percentile(v, [10, 90]))
    return {
        "file": os.path.basename(path),
        "dur": round(len(y) / sr, 2),
        "median_f0": round(med, 1),
        "p10": round(p10, 1),
        "p90": round(p90, 1),
        "voiced_pct": round(100.0 * v.size / f0.size, 1),
        "register": register_of(med),
    }


def shift(src, dst, semitones):
    """Formant-preserving pitch shift by `semitones`, duration unchanged."""
    snd = parselmouth.Sound(src)
    ratio = 2.0 ** (semitones / 12.0)
    m = measure(src)
    if m is None:
        raise SystemExit("no voiced frames in " + src)
    new_median = m["median_f0"] * ratio
    # Change gender: pitch floor, pitch ceiling, formant_shift_ratio,
    #                new_pitch_median, pitch_range_factor, duration_factor
    out = call(snd, "Change gender", 60, 500, 1.0, new_median, 1.0, 1.0)
    out.save(dst, parselmouth.SoundFileFormat.WAV)
    return new_median


def expand(args):
    out = []
    for a in args:
        if os.path.isdir(a):
            for ext in ("wav", "flac", "mp3", "opus"):
                out += sorted(glob.glob(os.path.join(a, "*." + ext)))
        else:
            out.append(a)
    return out


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "measure":
        rows = [measure(p) for p in expand(sys.argv[2:])]
        hdr = ["file", "dur", "median_f0", "p10", "p90", "voiced_pct", "register"]
        print("\t".join(hdr))
        for r in rows:
            if r:
                print("\t".join(str(r[h]) for h in hdr))
    elif cmd == "shift":
        src, dst, st = sys.argv[2], sys.argv[3], float(sys.argv[4])
        nm = shift(src, dst, st)
        print("wrote %s  target median %.1f Hz" % (dst, nm))
        print(measure(dst))
    else:
        raise SystemExit("measure | shift")
