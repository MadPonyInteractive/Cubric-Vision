"""MPI-607 identity, round 2: the FAIR test.

Round 1 said "changing emotion changes the speaker" (cosine 0.41-0.55 within a fixed
seed). But its emotion blocks also rewrote `speed:` and `volume:` -- "Fast and clipped",
"Loud and forceful", "Soft and receding" -- which are acoustic identity properties. Of
course the speaker embedding moved. The test was confounded.

This round fixes two things:

  1. Emotion blocks vary ONLY `emotion:` / `tone:` / `personality:` / `style note:`.
     `speed`, `volume`, `pitch`, `texture`, `clarity` are frozen across all of them.
  2. The identity is DISTINCTIVE rather than generic. Round 1 used "Mid-range" pitch and
     "Smooth timbre", which describe half the human race; a strongly specified voice may
     dominate the prompt and hold across emotions where a bland one cannot.

Two identities are run so the conclusion is not one voice's accident.

Then: G:/ComfyUi/python_embeded/python.exe speaker_similarity.py <out_dir>
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

REF_TEXT = ("So this is how it ends. After everything we did, after all of it, this is "
            "what we are left with, and there is nothing more to say about it.")

# Distinctive on purpose. Every acoustic line here is FROZEN across the emotion variants.
IDENTITIES = {
    "vA": ("gender: Male.\n"
           "age: Senior.\n"
           "accent: Neutral.\n"
           "pitch: Very low bass register, unusually deep.\n"
           "speed: Slow and deliberate.\n"
           "volume: Medium.\n"
           "clarity: Slightly slurred consonants.\n"
           "fluency: Unhurried, with natural pauses.\n"
           "texture: Heavy vocal fry, gravelly and weathered.\n"),
    "vB": ("gender: Female.\n"
           "age: Young adult.\n"
           "accent: Neutral.\n"
           "pitch: High and light, bright register.\n"
           "speed: Moderate.\n"
           "volume: Medium.\n"
           "clarity: Crisp, precise consonants.\n"
           "fluency: Smooth and even.\n"
           "texture: Thin, slightly nasal, youthful timbre.\n"),
}

# ONLY these four lines change. No speed / volume / pitch / texture edits.
EMOTIONS = {
    "neutral": ("emotion: Neutral.\ntone: Matter-of-fact.\n"
                "personality: Composed.\nstyle note: Deliver plainly.\n"),
    "angry": ("emotion: Angry.\ntone: Hard and accusing.\n"
              "personality: Confrontational.\nstyle note: Cold fury beneath the words.\n"),
    "sad": ("emotion: Sad.\ntone: Downcast, falling inflections.\n"
            "personality: Wounded.\nstyle note: Grief held just under the surface.\n"),
    "cheerful": ("emotion: Cheerful.\ntone: Warm and smiling.\n"
                 "personality: Upbeat.\nstyle note: Light-hearted throughout.\n"),
}

SEED = 4000


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = Qwen3TTSModel.from_pretrained(MODEL_DIR, device_map=device,
                                          dtype=torch.bfloat16)
    print(f"model loaded | device {device}")

    for vid, identity in IDENTITIES.items():
        for emo, style in EMOTIONS.items():
            slug = f"{vid}_{emo}"
            torch.manual_seed(SEED)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(SEED)
            np.random.seed(SEED)

            t1 = time.time()
            try:
                wavs, sr = model.generate_voice_design(
                    text=REF_TEXT, language="english",
                    instruct=identity + style, **GEN)
            except Exception as exc:
                print(f"FAIL {slug}: {type(exc).__name__}: {exc}")
                continue
            if not (isinstance(wavs, list) and wavs):
                print(f"FAIL {slug}: no audio")
                continue

            wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
            sf.write(os.path.join(out_dir, f"{slug}.wav"), wav, sr)
            print(f"OK   {slug:16} {len(wav) / sr:5.2f}s  gen {time.time() - t1:5.1f}s")


if __name__ == "__main__":
    main()
