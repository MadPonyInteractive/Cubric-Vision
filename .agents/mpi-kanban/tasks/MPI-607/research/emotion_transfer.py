"""MPI-607: does EMOTION transfer through Chatterbox cloning?

This decides the library's size. Chatterbox has no emotion prompt -- only an
`exaggeration` dial -- so if emotion must come from the reference, every voice needs one
clip per emotion (60 voices x 5 = 300, and 900 generations to audition). If Chatterbox
takes only identity and lets the target text + dial decide delivery, per-emotion variants
are wasted and the library stays at 60.

Design: ONE voice identity, five references differing ONLY in the `emotion:` /
`tone:` / `personality:` lines of the structured grammar, all speaking the SAME
emotionally-flexible sentence. Each is then cloned by Chatterbox saying a DIFFERENT,
deliberately NEUTRAL sentence. Any emotion heard in the clone can only have come from the
reference, because the words carry none.

Two dial controls are cloned from the neutral reference at exaggeration 0.5 and 1.3, to
show what the dial alone buys without any emotional reference.

Stage 1 (this script, in the transformers-4 venv) writes the references.
Stage 2 is chatterbox_clone_test.py, which runs against the bench.
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

# Emotionally flexible on purpose -- the same words work calm, angry, sad or bright,
# so the references differ in DELIVERY and not in content.
REF_TEXT = ("So this is how it ends. After everything we did, after all of it, this is "
            "what we are left with, and there is nothing more to say about it.")

# Identity held constant across all five. Only the last three lines vary.
IDENTITY = ("gender: Female.\n"
            "age: Adult.\n"
            "accent: Neutral.\n"
            "pitch: Mid-range.\n"
            "clarity: Clear articulation.\n"
            "fluency: Very fluent, no hesitations.\n"
            "texture: Smooth timbre.\n")

EMOTIONS = [
    ("e0_neutral",
     "speed: Moderate pace with even rhythm.\nvolume: Medium and consistent.\n"
     "emotion: Neutral and even.\ntone: Calm and matter-of-fact.\n"
     "personality: Composed.\nstyle note: Deliver plainly, without colour.\n"),
    ("e1_angry",
     "speed: Fast and clipped, with sudden emphasis.\nvolume: Loud and forceful.\n"
     "emotion: Angry.\ntone: Hard and accusing.\n"
     "personality: Confrontational.\nstyle note: Cold fury, hard consonants, no shouting.\n"),
    ("e2_sad",
     "speed: Slow, with longer pauses between phrases.\nvolume: Soft and receding.\n"
     "emotion: Sad.\ntone: Downcast, falling inflections.\n"
     "personality: Wounded.\nstyle note: Heavy and tired, close to tears, do not over-act.\n"),
    ("e3_cheerful",
     "speed: Brisk and lively, with light bounce.\nvolume: Medium-bright.\n"
     "emotion: Cheerful.\ntone: Warm and smiling.\n"
     "personality: Upbeat.\nstyle note: Light and buoyant throughout.\n"),
    ("e4_whisper",
     "speed: Slow, intimate pacing.\nvolume: Very soft, whispered.\n"
     "emotion: Tense.\ntone: Breathy and conspiratorial.\n"
     "personality: Guarded.\nstyle note: Barely above a whisper, close-mic.\n"),
]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = Qwen3TTSModel.from_pretrained(MODEL_DIR, device_map=device,
                                          dtype=torch.bfloat16)
    print(f"model loaded | device {device}")

    for i, (slug, style) in enumerate(EMOTIONS):
        instruct = IDENTITY + style
        seed = 4000 + i
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        np.random.seed(seed)

        t1 = time.time()
        try:
            wavs, sr = model.generate_voice_design(
                text=REF_TEXT, language="english", instruct=instruct, **GEN)
        except Exception as exc:
            print(f"FAIL {slug}: {type(exc).__name__}: {exc}")
            continue
        if not (isinstance(wavs, list) and wavs):
            print(f"FAIL {slug}: no audio")
            continue

        wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
        sf.write(os.path.join(out_dir, f"{slug}.wav"), wav, sr)
        with open(os.path.join(out_dir, f"{slug}.txt"), "w", encoding="utf-8") as fh:
            fh.write(f"SEED: {seed}\nDIRECTION:\n{instruct}\n")
        print(f"OK   {slug:14} {len(wav) / sr:5.2f}s  gen {time.time() - t1:5.1f}s")


if __name__ == "__main__":
    main()
