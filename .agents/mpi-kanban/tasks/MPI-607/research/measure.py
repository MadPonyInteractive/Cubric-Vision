"""MPI-607: measure the first two DramaBox outputs.

The check that matters is NOT that both produced audio -- a voice_ref that never
reaches the sampler still succeeds and still writes a file. A vs B must be
DISTINCT, and B's median f0 must track the reference it was given.
"""
import hashlib
import os

import librosa
import numpy as np
import soundfile as sf

FILES = {
    "A_promptonly": r"D:/WORK/Images/Outputs/mpi607_dramabox_A_promptonly_00001.wav",
    "B_voiceref": r"D:/WORK/Images/Outputs/mpi607_dramabox_B_voiceref_00001.wav",
    "REF_R1_deep_male_1": r"G:/ComfyUi/ComfyUI/input/mpi607_voices/R1_deep_male_1.wav",
}


def med_f0(y, sr):
    f0 = librosa.yin(y, fmin=60, fmax=400, sr=sr)
    f0 = f0[np.isfinite(f0)]
    return float(np.median(f0)) if f0.size else float("nan")


def envelope(y, sr, hop_ms=10):
    hop = max(1, int(sr * hop_ms / 1000))
    return librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]


rows = {}
for name, p in FILES.items():
    if not os.path.exists(p):
        print("MISSING", name, p)
        continue
    y, sr = sf.read(p, dtype="float32", always_2d=True)
    mono = y.mean(axis=1)
    sha = hashlib.sha256(open(p, "rb").read()).hexdigest()[:16]
    rms = float(np.sqrt((mono ** 2).mean()))
    rows[name] = dict(
        sha=sha, sr=sr, dur=len(mono) / sr, ch=y.shape[1],
        rms_db=20 * np.log10(rms + 1e-12),
        peak_db=20 * np.log10(float(np.abs(mono).max()) + 1e-12),
        f0=med_f0(mono, sr), env=envelope(mono, sr), size=os.path.getsize(p),
    )
    print("%-20s sha=%s  %5d Hz  %4.2fs  ch=%d  rms=%6.1f dBFS  peak=%5.1f dBFS  medianF0=%6.1f Hz"
          % (name, sha, sr, rows[name]["dur"], y.shape[1], rows[name]["rms_db"],
             rows[name]["peak_db"], rows[name]["f0"]))

print()
if "A_promptonly" in rows and "B_voiceref" in rows:
    a, b = rows["A_promptonly"], rows["B_voiceref"]
    print("A vs B distinct sha256 :", a["sha"] != b["sha"])
    n = min(len(a["env"]), len(b["env"]))
    r = float(np.corrcoef(a["env"][:n], b["env"][:n])[0, 1])
    print("A vs B envelope r      : %.3f  (low = genuinely different takes)" % r)

if "B_voiceref" in rows and "REF_R1_deep_male_1" in rows:
    b, ref = rows["B_voiceref"], rows["REF_R1_deep_male_1"]
    st = 12 * np.log2(b["f0"] / ref["f0"])
    print("B vs REF median f0     : %.1f Hz vs %.1f Hz  =  %+.2f semitones" % (b["f0"], ref["f0"], st))
    print("                         (the pitch half of the identity gate; |st| under ~1.5 is a match)")
if "A_promptonly" in rows and "REF_R1_deep_male_1" in rows:
    a, ref = rows["A_promptonly"], rows["REF_R1_deep_male_1"]
    st = 12 * np.log2(a["f0"] / ref["f0"])
    print("A vs REF median f0     : %+.2f semitones  (A had NO reference -- this is the control)" % st)
