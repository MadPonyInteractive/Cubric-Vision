"""MPI-622: re-roll the R1/R3 `flat` cells until they are actually flat.

WHY. Fabio, 2026-08-26, on the first grid: five of six emotions read correctly, but flat
drew "what is flat supposed to sound like?" - it did not read as anything. The measurement
agreed: flat's p10-p90 pitch span was 6.6 st against neutral's 5.8, i.e. it MOVED MORE than
the natural conversational read. Flat is the one emotion defined by the absence of movement,
so that is a failure of the cell, not a matter of taste.

The original direction already said "even monotone delivery" and "deliberately lifeless" and
VoiceDesign ignored both - consistent with the standing rule that its prompt label is not
trustworthy. So this does not just re-roll the same words with a new seed: it names the
constraint several different ways, because the only lever available is the wording.

THE GATE IS OBJECTIVE, NOT A LABEL. A candidate is accepted only if its p10-p90 span is the
NARROWEST of its register's six, and by a clear margin - the target is <= 3.5 st, against the
5.8 st that the neutral cell already achieves without trying. Judging this by ear alone is
what produced the bad take: "flat" and "a bit dull" sound alike in isolation and only separate
against the rest of the grid.

Usage (ALWAYS under the GPU lease, ALWAYS as a background Bash call):
    python <mpi-lib>/scripts/gpu_lease.py run -- \
        G:/ComfyUi/_qwen_tts_rt/venv/Scripts/python.exe phase2_reroll_flat.py <out_dir>
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

# Same line as the rest of the grid. Changing it would make the cell incomparable.
PERF_TEXT = ("I walked the whole street twice before I found the right door, then stood "
             "there watching the brass number, unsure whether to knock or just leave.")

REGISTERS = {
    "R1": "Adult male, thirties, low pitch",
    "R3": "Adult female, late twenties, high pitch",
}

# Four ways of saying the same thing. The first is the original, kept as the control so the
# re-roll can be shown to have beaten it rather than merely differed from it.
VARIANTS = {
    "v0_original": ("flat affect, no emotion, even monotone delivery, steady tempo, "
                    "clear diction, deliberately lifeless"),
    "v1_no_inflection": ("completely monotone, one single pitch from start to finish, no "
                         "inflection, no rise at the end of any phrase, no emphasis on any "
                         "word, even steady tempo, clear diction"),
    "v2_emotionless": ("emotionless and detached, dead affect, speaking without caring, "
                       "no melody in the voice, flat unchanging pitch, no stress, "
                       "measured even pace"),
    "v3_dictation": ("reading words aloud mechanically without understanding them, no "
                     "expression whatsoever, absolutely level pitch throughout, no phrasing, "
                     "no emotional colour, steady unvarying tempo"),
}

TARGET_SPAN_ST = 3.5      # accept at or under this
BASELINE_SPAN = {"R1": 5.8, "R3": None}   # what the NEUTRAL cell already reaches untried


def span_semitones(path):
    """p10-p90 pitch span in semitones. This is what 'flat' actually means."""
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
    print(f"device {device}")
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_DIR, device_map=device, dtype=torch.bfloat16)
    print(f"model loaded in {time.time() - t0:.1f}s\n")

    results = []
    for reg in ("R1", "R3"):
        for vi, (vname, delivery) in enumerate(VARIANTS.items()):
            slug = f"flat_{reg}_{vname}"
            instruct = f"{REGISTERS[reg]}, {delivery}."
            seed = 3000 + vi
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
                fh.write(f"REGISTER: {reg}\nVARIANT: {vname}\nTEXT: {PERF_TEXT}\n"
                         f"DIRECTION: {instruct}\nSEED: {seed}\n")

            sp, med = span_semitones(path)
            verdict = "ACCEPT" if (sp is not None and sp <= TARGET_SPAN_ST) else "reject"
            print(f"{verdict:7s} {slug:26s} span {sp:5.1f} st   median {med:6.1f} Hz")
            results.append((reg, vname, sp, med, path))

    print("\n--- ranked by span, narrowest first (narrowest IS flattest) ---")
    for reg in ("R1", "R3"):
        rows = sorted([r for r in results if r[0] == reg and r[2] is not None],
                      key=lambda r: r[2])
        base = BASELINE_SPAN.get(reg)
        print(f"\n{reg}   (neutral cell reaches {base} st untried)"
              if base else f"\n{reg}")
        for _reg, vname, sp, med, _p in rows:
            flag = " <= TARGET" if sp <= TARGET_SPAN_ST else ""
            beats = "" if base is None else (" beats neutral" if sp < base else
                                             " STILL LOOSER THAN NEUTRAL")
            print(f"   {vname:20s} {sp:5.1f} st  {med:6.1f} Hz{flag}{beats}")

    print("\nLevel-match before listening. Judge the winner AGAINST neutral, never alone -")
    print("'flat' and 'a bit dull' are indistinguishable in isolation, which is how the")
    print("first take passed generation and failed Fabio's ear.")


if __name__ == "__main__":
    main()
