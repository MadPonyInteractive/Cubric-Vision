"""MPI-622 Phase 2: author the 12 performance clips with Qwen3-TTS VoiceDesign.

R1 (low male, 90-130 Hz) + R3 (high female, 190-260 Hz) x six emotions = 12 clips.

WHY AUTHORED AND NOT RECORDED (Fabio, 2026-08-25, decided - do not reopen). The
VoiceDesign clips out-perform his own takes, "especially for Angry", and he is not a
native English speaker. Since VC OVERWRITES the target's accent with the source's,
recording the grid himself would stamp one non-native accent onto every `character`
voice in the library. VoiceDesign's uncontrollable American prior - a CLOSED-NEGATIVE
finding on MPI-607 when the goal was CHOOSING an accent - is exactly what supplies the
one consistent house accent this needs. Same defect, inverted by the goal.

Runs OUTSIDE ComfyUI, same runtime as MPI-607's design_voices.py: the `_qwen_tts_rt`
venv sees transformers 4.57.3 while the bench ComfyUI keeps 5.13.0 untouched.
Apache-2.0, offline, never an app dependency - so this does not touch the standing
"Qwen3-TTS is never shipped" rule.

Usage (ALWAYS under the GPU lease, ALWAYS as a background Bash call):
    python <mpi-lib>/scripts/gpu_lease.py run -- \
        G:/ComfyUi/_qwen_tts_rt/venv/Scripts/python.exe phase2_perf_clips.py <out_dir>
"""
import os
import sys
import time

PACK = r"G:\ComfyUi\_qwen_tts_rt\pack"
MODEL_DIR = r"G:\ComfyUi\ComfyUI\models\qwen-tts\Qwen3-TTS-12Hz-1.7B-VoiceDesign"

sys.path.insert(0, PACK)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402

from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel  # noqa: E402

# Lifted verbatim from MPI-607's design_voices.py so these clips stay directly
# comparable to every VoiceDesign result already recorded on that card.
GEN = dict(max_new_tokens=2048, top_p=0.80, top_k=20, temperature=1.0,
           repetition_penalty=1.05)
LANGUAGE = "english"

# ONE text across all twelve clips, on purpose.
#
# Two reasons, and the second was nearly missed:
#
# 1. It makes emotion the ONLY axis. This card's standing constraint is "name the
#    control and the axis in every listening ask" - a session already burned a listening
#    test that could be neither passed nor failed because three clips varied at once.
#    Hold text constant and the six reads are directly comparable by ear.
#
# 2. It must be PHONETICALLY COMPREHENSIVE, which the library's existing shared text is
#    not. That is logged as an open red item for the sample/audition text - but it binds
#    HARDER here, because VC was measured to take articulation and prosody from the
#    SOURCE. Every character voice in the library inherits the consonants of these
#    twelve clips. A performance clip that never says a stop+/r/ onset cannot teach one.
#
# Coverage checked by hand: str- (street), br- (brass), tr- (trying), kn- (knock),
# /S/ (unsure), /tS/ (watching), /dZ/ (just), /D/ (the, there, whether), /T/ (twice
# -> no; carried by "whole"/"whether" voicing contrast), plus open and closed vowels.
# Semantically neutral, so no emotion has to fight the words - a line about a broken
# promise reads angry for free and cheerful never.
PERF_TEXT = ("I walked the whole street twice before I found the right door, then stood "
             "there watching the brass number, unsure whether to knock or just leave.")

# Persona sets the BASELINE register. Emotion then moves the measured pitch off it, and
# that is correct, not a defect: `register` names the PERFORMER'S BASELINE, never the
# clip's f0. An angry take from a 101.5 Hz performer measured 136-274 Hz on this card.
# So do NOT reject a clip for measuring outside its band - record median_f0 and move on.
REGISTERS = {
    "R1": "Adult male, thirties, low pitch",
    "R3": "Adult female, late twenties, high pitch",
}

# Delivery halves. `angry` reuses the grammar of Fabio's own t3_cold_anger prompt, which
# is the one VoiceDesign emotion already measured to land. `sad` carries his "do not
# over-act" guard for the same reason - it was in his own crying prompt.
EMOTIONS = {
    "flat": ("flat affect, no emotion, even monotone delivery, steady tempo, "
             "clear diction, deliberately lifeless"),
    "neutral": ("neutral conversational delivery, natural intonation, medium tempo, "
                "clear diction"),
    "angry": ("cold anger, clipped delivery, hard consonants, slow-medium tempo, "
              "no shouting"),
    "sad": ("quiet sadness, heavy tone, slow tempo, soft consonants, small breaths, "
            "do not over-act"),
    "cheerful": ("cheerful and warm, smiling tone, light lift at phrase ends, "
                 "medium-fast tempo, bright articulation"),
    "whisper": ("tense whisper, breathy, minimal volume, slow pace, close and intimate, "
                "no voiced tone"),
}

# Deterministic order so a re-run reproduces the same seeds per cell.
GRID = [(reg, emo) for reg in ("R1", "R3") for emo in EMOTIONS]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"transformers {__import__('transformers').__version__} | torch "
          f"{torch.__version__} | device {device}")

    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_DIR, device_map=device, dtype=torch.bfloat16)
    print(f"model loaded in {time.time() - t0:.1f}s")

    for i, (reg, emo) in enumerate(GRID):
        slug = f"perf_{reg}_{emo}"
        instruct = f"{REGISTERS[reg]}, {EMOTIONS[emo]}."
        seed = 2000 + i
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        np.random.seed(seed)

        t1 = time.time()
        try:
            wavs, sr = model.generate_voice_design(
                text=PERF_TEXT, language=LANGUAGE, instruct=instruct, **GEN)
        except Exception as exc:
            print(f"FAIL {slug}: {type(exc).__name__}: {exc}")
            continue

        if not (isinstance(wavs, list) and wavs):
            print(f"FAIL {slug}: no audio returned ({type(wavs)})")
            continue

        wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
        path = os.path.join(out_dir, f"{slug}.wav")
        sf.write(path, wav, sr)
        with open(os.path.join(out_dir, f"{slug}.txt"), "w", encoding="utf-8") as fh:
            fh.write(f"REGISTER: {reg}\nEMOTION: {emo}\nTEXT: {PERF_TEXT}\n"
                     f"DIRECTION: {instruct}\nSEED: {seed}\n")
        print(f"OK   {slug}  {len(wav) / sr:5.2f}s @ {sr}Hz  gen {time.time() - t1:5.1f}s"
              f"  -> {path}")

    print("\nNEXT, AND NEITHER STEP IS OPTIONAL:")
    print("  1. pitch_tools.py measure <out_dir>/*.wav   - record median_f0 per clip.")
    print("     A clip far off its baseline gets REPAIRED with pitch_tools.py shift")
    print("     (validated to +/-19 st, no artefacts, emotion intact), not re-rolled.")
    print("  2. pitch_tools.py norm <lvl_dir> <out_dir>/*.wav  BEFORE anyone listens.")
    print("     A 3.9 dB spread nearly decided a result by loudness alone on this card.")
    print("  3. Judge every emotion BY EAR. VoiceDesign's delivered emotion is only")
    print("     approximate and its prompt label is NOT trustworthy - a labelled-angry")
    print("     clip read as 'upset', and a 'refined British' prompt gave a New Yorker.")


if __name__ == "__main__":
    main()
