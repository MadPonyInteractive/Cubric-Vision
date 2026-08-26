"""MPI-622: sweep SEEDS for the flat cell. The wording was never the problem.

WHAT THIS CORRECTS. `phase2_reroll_flat.py` tested the hypothesis that VoiceDesign was not
honouring the words "even monotone delivery" and that naming the constraint harder would fix
it. That hypothesis is DEAD, and it died on its own control:

    v0_original (the SAME wording as the rejected take)   2.9 st   ACCEPT
    v1_no_inflection                                      6.0 st
    v2_emotionless                                        6.3 st
    v3_dictation                                          7.0 st

The rejected first take used v0's exact wording at seed 2002 and measured 6.6 st. v0 at seed
3000 measured 2.9 st. Same words, less than half the pitch movement. **Seed variance dominates
this cell, and all three rewordings made it worse than the natural conversational read.**

So the lever is the seed, not the prompt. This sweeps seeds on the ORIGINAL wording and keeps
the narrowest span per register. It is the cheap, boring answer, and it is the one the
evidence points at.

Two things it must also respect, learned on this card:

  * `flat` is LOW-AROUSAL, so unlike angry/cheerful it SHOULD sit near the performer's
    baseline. A candidate that drifts out of its register band is a wrong BASELINE (the one
    case the Phase 0 shifter legitimately repairs) rather than correct emotion-driven lift.
    Both numbers are reported so that call can be made on evidence.
  * Narrowest span is necessary, not sufficient. The winner still gets heard AGAINST neutral,
    because "flat" and "a bit dull" are indistinguishable in isolation.

Usage (ALWAYS under the GPU lease, ALWAYS as a background Bash call):
    python <mpi-lib>/scripts/gpu_lease.py run -- \
        G:/ComfyUi/_qwen_tts_rt/venv/Scripts/python.exe phase2_flat_seedsweep.py <out_dir>
"""
import os
import sys
import time

PACK = r"G:\ComfyUi\_qwen_tts_rt\pack"
MODEL_DIR = r"G:\ComfyUi\ComfyUI\models\qwen-tts\Qwen3-TTS-12Hz-1.7B-VoiceDesign"

sys.path.insert(0, PACK)

import numpy as np  # noqa: E402
import librosa  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402

from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel  # noqa: E402

GEN = dict(max_new_tokens=2048, top_p=0.80, top_k=20, temperature=1.0,
           repetition_penalty=1.05)
LANGUAGE = "english"

PERF_TEXT = ("I walked the whole street twice before I found the right door, then stood "
             "there watching the brass number, unsure whether to knock or just leave.")

# The winning wording. Unchanged from the original grid - that is the whole point.
FLAT_DELIVERY = ("flat affect, no emotion, even monotone delivery, steady tempo, "
                 "clear diction, deliberately lifeless")

REGISTERS = {
    "R1": ("Adult male, thirties, low pitch", 90, 130),
    "R3": ("Adult female, late twenties, high pitch", 190, 260),
}

SEEDS = [3000, 3100, 3200, 3300, 3400, 3500, 3600, 3700]
TARGET_SPAN_ST = 3.5


def analyse(path):
    y, sr = librosa.load(str(path), sr=None, mono=True)
    f0, _v, _p = librosa.pyin(y, fmin=60, fmax=500, sr=sr)
    voiced = f0[~np.isnan(f0)]
    if voiced.size == 0:
        return None, None
    p10, p90 = np.percentile(voiced, [10, 90])
    return 12 * float(np.log2(p90 / p10)), float(np.median(voiced))


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_DIR, device_map=device, dtype=torch.bfloat16)
    print(f"device {device} | model loaded in {time.time() - t0:.1f}s\n")

    results = {}
    for reg, (persona, lo, hi) in REGISTERS.items():
        instruct = f"{persona}, {FLAT_DELIVERY}."
        rows = []
        for seed in SEEDS:
            slug = f"flat_{reg}_s{seed}"
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)
            np.random.seed(seed)
            try:
                wavs, sr = model.generate_voice_design(
                    text=PERF_TEXT, language=LANGUAGE, instruct=instruct, **GEN)
            except Exception as exc:
                print(f"FAIL {slug}: {type(exc).__name__}: {exc}")
                continue
            if not (isinstance(wavs, list) and wavs):
                print(f"FAIL {slug}: no audio")
                continue

            wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
            path = os.path.join(out_dir, f"{slug}.wav")
            sf.write(path, wav, sr)
            with open(os.path.join(out_dir, f"{slug}.txt"), "w", encoding="utf-8") as fh:
                fh.write(f"REGISTER: {reg}\nEMOTION: flat\nTEXT: {PERF_TEXT}\n"
                         f"DIRECTION: {instruct}\nSEED: {seed}\n")

            span, med = analyse(path)
            in_band = lo <= med < hi
            mark = "ACCEPT" if (span is not None and span <= TARGET_SPAN_ST) else "      "
            band = "in band" if in_band else f"OUT OF BAND ({lo}-{hi})"
            print(f"{mark} {slug:20s} span {span:5.1f} st   median {med:6.1f} Hz   {band}")
            rows.append((span, med, in_band, seed, path))
        results[reg] = rows

    print("\n=== best per register (narrowest span; in-band preferred) ===")
    for reg, rows in results.items():
        if not rows:
            print(f"{reg}: nothing generated")
            continue
        passing = [r for r in rows if r[0] <= TARGET_SPAN_ST]
        pool = passing or rows
        in_band = [r for r in pool if r[2]] or pool
        span, med, ib, seed, path = min(in_band, key=lambda r: r[0])
        verdict = "PASSES the <=3.5 st gate" if span <= TARGET_SPAN_ST else \
                  f"NO CANDIDATE PASSES - best is {span:.1f} st"
        print(f"{reg}: seed {seed}  span {span:.1f} st  median {med:.1f} Hz  "
              f"{'in band' if ib else 'OUT OF BAND -> shift, do not re-roll'}  |  {verdict}")

    print("\nLevel-match, then hear the winner AGAINST neutral before accepting it.")


if __name__ == "__main__":
    main()
