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
    ("R1", 70, 130),
    ("R2", 130, 190),
    ("R3", 190, 260),
    ("R4", 260, 340),
    ("R5", 340, 100000),
]


def register_of(f0):
    for name, lo, hi in REGISTERS:
        if lo <= f0 < hi:
            return name
    return "below-R1" if f0 < REGISTERS[0][1] else "?"


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


def shift(src, dst, semitones, headroom_db=-6.0):
    """Formant-preserving pitch shift by `semitones`, duration unchanged.

    The input is attenuated to `headroom_db` peak FIRST. Change gender resynthesises, and
    the result routinely peaks above the source -- a clip already sitting on 0 dBFS (which
    a recording off a normalising mic chain usually is) then clips on save, and Praat only
    mentions it in a warning that is easy to scroll past. Final loudness is set later by
    `normalize`, so throwing away headroom here costs nothing.
    """
    y, sr = sf.read(src, always_2d=True)
    pk = max(float(np.max(np.abs(y))), 1e-9)
    y = y * (10 ** (headroom_db / 20.0) / pk)
    snd = parselmouth.Sound(y.mean(axis=1), sampling_frequency=sr)
    ratio = 2.0 ** (semitones / 12.0)
    m = measure(src)
    if m is None:
        raise SystemExit("no voiced frames in " + src)
    new_median = m["median_f0"] * ratio
    # Change gender: pitch floor, pitch ceiling, formant_shift_ratio,
    #                new_pitch_median, pitch_range_factor, duration_factor
    out = call(snd, "Change gender", 60, 500, 1.0, new_median, 1.0, 1.0)
    sf.write(dst, np.asarray(out.values).T, sr)
    return new_median


def level(path):
    """Peak and RMS in dBFS, plus RMS over active speech only.

    Silence between phrases drags a whole-file RMS down by a different amount per clip,
    so `rms_active` (frames above -40 dB of peak) is the number that tracks perceived
    loudness. EBU R128 is the usual tool and is unusable here -- its gating blocks report
    the -70 dB silence floor on anything under ~10s.
    """
    y, sr = sf.read(path, always_2d=True)
    y = y.mean(axis=1)
    a = np.abs(y)
    act = y[a > 10 ** (-40 / 20.0) * max(np.max(a), 1e-9)]
    db = lambda v: 20 * np.log10(max(float(v), 1e-9))
    return {
        "file": os.path.basename(path),
        "peak": round(db(np.max(a)), 1),
        "rms": round(db(np.sqrt(np.mean(y ** 2))), 1),
        "rms_active": round(db(np.sqrt(np.mean(act ** 2))) if act.size else -99, 1),
    }


def normalize(src, dst, target_rms_active=-16.0, ceiling=-1.0):
    """Match rms_active to `target_rms_active`, then back off to keep peak under `ceiling`.

    A listening test at mismatched loudness is decided by loudness -- the louder clip wins
    on almost any question a listener is asked. The library needs this for the same reason:
    auditions that jump in volume make the picker feel broken.
    """
    y, sr = sf.read(src, always_2d=True)
    mono = y.mean(axis=1)
    a = np.abs(mono)
    act = mono[a > 10 ** (-40 / 20.0) * max(np.max(a), 1e-9)]
    cur = float(np.sqrt(np.mean(act ** 2))) if act.size else 0.0
    if cur <= 0:
        raise SystemExit("silent: " + src)
    g = 10 ** (target_rms_active / 20.0) / cur
    peak = float(np.max(np.abs(y))) * g
    lim = 10 ** (ceiling / 20.0)
    if peak > lim:
        g *= lim / peak
    sf.write(dst, y * g, sr)
    return level(dst)


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
    elif cmd == "level":
        hdr = ["file", "peak", "rms", "rms_active"]
        print("\t".join(hdr))
        for p in expand(sys.argv[2:]):
            r = level(p)
            print("\t".join(str(r[h]) for h in hdr))
    elif cmd == "norm":
        # norm <out-dir> <file>...
        out = sys.argv[2]
        os.makedirs(out, exist_ok=True)
        for p in expand(sys.argv[3:]):
            print(normalize(p, os.path.join(out, os.path.basename(p))))
    else:
        raise SystemExit("measure | shift | level | norm")
