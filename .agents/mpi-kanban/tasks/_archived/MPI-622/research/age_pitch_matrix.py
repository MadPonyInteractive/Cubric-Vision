"""MPI-622: does VoiceDesign condition on AGE and on TARGET PITCH at all?

Fabio on library v1 (2026-08-26): elderly_male "sounds 25", mature_female "sounds 30",
elderly_female "sounds about 50", and the child "hurts my ears... almost like a critter".

Measured behind those calls: jitter 2.6-4.0% and spectral flatness 0.044-0.054 across
prompts asking for seventies, forties and thirties - no meaningful spread. And child_1 has
0.0% of its energy below 300 Hz at a 509.8 Hz fundamental, roughly an octave above a real
eight-year-old, which is the harshness rather than any EQ boost.

WHY A MATRIX AND NOT A RE-ROLL. n=1 per category cannot tell "the prompt is not conditioning
the output" from "this seed was unlucky". Phase 2 of this card burned exactly that trap: the
hypothesis that VoiceDesign ignored the prompt content for `flat` was FALSIFIED by its own
control - the original wording at a new seed passed while three harder rewordings all did
worse. So both axes vary here: 3 wordings x 2 seeds per category, measured, before anything
is concluded.

The wording axis tests one specific hypothesis: **the model does not condition on an age
NUMBER, but may condition on the acoustic CORRELATES of age** - tremor, breathiness, creak,
unsteady pitch, weak breath support, slow halting delivery. v1 named the number only.

Usage (ALWAYS under the GPU lease, ALWAYS as a background Bash call):
    python <mpi-lib>/scripts/gpu_lease.py run -- \
        G:/ComfyUi/_qwen_tts_rt/venv/Scripts/python.exe age_pitch_matrix.py <out_dir>
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

GEN = dict(max_new_tokens=2048, top_p=0.80, top_k=20, temperature=1.0,
           repetition_penalty=1.05)
LANGUAGE = "english"

LIB_TEXT = ("The bridge crew traced a strange green glow drifting past the broken crane, "
            "but nothing they knew could explain it. Just write it in the printed chart "
            "and be sure of the time.")

# v1 = the wording that FAILED, kept as the control. Dropping it would make any improvement
# unattributable - the same control that saved Phase 2 from a wrong conclusion.
MATRIX = {
    "elderly_male": [
        ("v1_number",
         "Adult male, seventies, gravelly and weathered, low pitch, slow tempo, slight "
         "rasp, world-weary storyteller"),
        ("v2_correlates",
         "Elderly man, frail thin voice, audible vocal tremor, breathy and slightly "
         "creaky, unsteady wavering pitch, slow halting tempo with pauses between "
         "phrases, weak breath support"),
        ("v3_extreme",
         "Very old man in his eighties, shaky quavering voice, dry raspy throat, thin "
         "reedy timbre, low volume, speaks slowly and pauses to catch his breath"),
    ],
    "elderly_female": [
        ("v1_number",
         "Adult female, seventies, gentle and kindly, medium pitch, slow tempo, soft "
         "articulation, grandmotherly warmth"),
        ("v2_correlates",
         "Elderly woman, frail quavering voice, pronounced vocal tremor, breathy and "
         "soft, unsteady pitch, slow gentle tempo with pauses, thin fragile timbre"),
        ("v3_extreme",
         "Very old woman in her eighties, shaky wavering voice, soft and breathy, weak "
         "breath support, speaks slowly and deliberately, warm but visibly frail"),
    ],
    "mature_female": [
        ("v1_number",
         "Adult female, forties, low-mid pitch, unhurried tempo, rich timbre, calm "
         "composed narration, even emphasis"),
        ("v2_correlates",
         "Middle aged woman, low warm alto voice, full chest resonance, settled and "
         "unhurried, calm authority, no youthful brightness at all"),
        ("v3_extreme",
         "Woman in her late forties, deep resonant alto, smoky mature timbre, slow "
         "measured delivery, weight and gravity in the voice, clearly not young"),
    ],
    # The child needs PITCH steering, not age wording: 509.8 Hz is the whole defect.
    "child": [
        ("v1_number",
         "Young child, around eight years old, high pitch, light airy timbre, quick "
         "eager tempo, simple clear articulation, natural child voice and not cartoonish"),
        ("v2_lower",
         "Young child around eight years old, moderate pitch, soft light voice, relaxed "
         "natural tempo, gentle articulation, calm and not shrill, not squeaky"),
        ("v3_lower_still",
         "Child of about ten, medium pitch close to an adult woman but lighter, warm "
         "soft tone, unhurried conversational delivery, plain and natural, never "
         "cartoonish or squeaky"),
    ],
}

SEEDS = [0, 1]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    total = sum(len(v) for v in MATRIX.values()) * len(SEEDS)
    print(f"device {device} | {len(MATRIX)} categories x wordings x {len(SEEDS)} seeds "
          f"= {total} clips\n")

    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_DIR, device_map=device, dtype=torch.bfloat16)
    print(f"model loaded in {time.time() - t0:.1f}s\n")

    ok = 0
    for ci, (cat, variants) in enumerate(MATRIX.items()):
        for vi, (vlabel, direction) in enumerate(variants):
            for si, s in enumerate(SEEDS):
                name = f"{cat}__{vlabel}__s{s}"
                seed = 7000 + ci * 100 + vi * 10 + s
                torch.manual_seed(seed)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(seed)
                np.random.seed(seed)

                t1 = time.time()
                try:
                    wavs, sr = model.generate_voice_design(
                        text=LIB_TEXT, language=LANGUAGE, instruct=f"{direction}.", **GEN)
                except Exception as exc:
                    print(f"FAIL {name}: {type(exc).__name__}: {exc}")
                    continue
                if not (isinstance(wavs, list) and wavs):
                    print(f"FAIL {name}: no audio returned")
                    continue

                wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
                sf.write(os.path.join(out_dir, f"{name}.wav"), wav, sr)
                with open(os.path.join(out_dir, f"{name}.txt"), "w",
                          encoding="utf-8") as fh:
                    fh.write(f"CATEGORY: {cat}\nVARIANT: {vlabel}\nTEXT: {LIB_TEXT}\n"
                             f"DIRECTION: {direction}\nSEED: {seed}\n")
                print(f"OK   {name:<38} {len(wav)/sr:5.2f}s  gen {time.time()-t1:5.1f}s")
                ok += 1

    print(f"\n{ok}/{total} generated -> {out_dir}")
    print("\nREAD THE RESULT THIS WAY, and not any other way:")
    print("  v1 is the CONTROL - the wording Fabio already rejected. If v2/v3 beat it")
    print("  ACROSS BOTH SEEDS, the wording is doing the work. If the spread WITHIN a")
    print("  wording is as large as the spread between wordings, it is seed variance and")
    print("  the honest fix is generate-and-measure, not a better prompt.")


if __name__ == "__main__":
    main()
