"""MPI-607: is a voice IDENTITY stable across emotion prompts? Blocks the library design.

If emotion has to come from the reference clip (which round 3 indicates), then a character
needs the SAME identity rendered in several emotions -- otherwise the character's voice
changes the moment they get angry. That is a continuity requirement, not a nicety.

But `emotion_transfer.py` gave each emotion its own seed (4000+i), and Qwen3-TTS
VoiceDesign is not deterministic -- so `e0`..`e4` are probably FIVE DIFFERENT WOMEN in one
mood each, not one woman in five moods. The emotion result stands; the identity assumption
underneath it was never checked.

Three questions here:
  1. Fixed seed, same identity block, only the emotion lines vary -- same person?
  2. Does greedy decoding (`do_sample=False`, as seen in Fabio's own bench workflow)
     hold identity tighter than sampling?
  3. Control: same prompt, different seed -- confirms seed really does move identity.

Run: venv/Scripts/python.exe identity_stability.py <out_dir>
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

REF_TEXT = ("So this is how it ends. After everything we did, after all of it, this is "
            "what we are left with, and there is nothing more to say about it.")

IDENTITY = ("gender: Female.\n"
            "age: Adult.\n"
            "accent: Neutral.\n"
            "pitch: Mid-range.\n"
            "clarity: Clear articulation.\n"
            "fluency: Very fluent, no hesitations.\n"
            "texture: Smooth timbre.\n")

STYLES = {
    "neutral": ("speed: Moderate pace with even rhythm.\nvolume: Medium and consistent.\n"
                "emotion: Neutral and even.\ntone: Calm and matter-of-fact.\n"
                "personality: Composed.\nstyle note: Deliver plainly, without colour.\n"),
    "angry": ("speed: Fast and clipped, with sudden emphasis.\nvolume: Loud and forceful.\n"
              "emotion: Angry.\ntone: Hard and accusing.\n"
              "personality: Confrontational.\nstyle note: Cold fury, hard consonants.\n"),
    "sad": ("speed: Slow, with longer pauses between phrases.\nvolume: Soft and receding.\n"
            "emotion: Sad.\ntone: Downcast, falling inflections.\n"
            "personality: Wounded.\nstyle note: Heavy and tired, do not over-act.\n"),
}

SAMPLED = dict(max_new_tokens=2048, top_p=0.80, top_k=20, temperature=1.0,
               repetition_penalty=1.05, do_sample=True)
GREEDY = dict(max_new_tokens=2048, repetition_penalty=1.05, do_sample=False)

# (slug, style, seed, gen_kwargs)
RUNS = [
    # 1. fixed seed, sampling -- the way the library would naively be authored
    ("s1_sampled_neutral", "neutral", 4000, SAMPLED),
    ("s2_sampled_angry", "angry", 4000, SAMPLED),
    ("s3_sampled_sad", "sad", 4000, SAMPLED),
    # 2. greedy -- does it pin identity harder?
    ("g1_greedy_neutral", "neutral", 4000, GREEDY),
    ("g2_greedy_angry", "angry", 4000, GREEDY),
    ("g3_greedy_sad", "sad", 4000, GREEDY),
    # 3. control -- same prompt, different seed
    ("c1_sampled_neutral_seed9999", "neutral", 9999, SAMPLED),
]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = Qwen3TTSModel.from_pretrained(MODEL_DIR, device_map=device,
                                          dtype=torch.bfloat16)
    print(f"model loaded | device {device}")

    for slug, style, seed, gen in RUNS:
        instruct = IDENTITY + STYLES[style]
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        np.random.seed(seed)

        t1 = time.time()
        try:
            wavs, sr = model.generate_voice_design(
                text=REF_TEXT, language="english", instruct=instruct, **gen)
        except Exception as exc:
            print(f"FAIL {slug}: {type(exc).__name__}: {exc}")
            continue
        if not (isinstance(wavs, list) and wavs):
            print(f"FAIL {slug}: no audio")
            continue

        wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
        sf.write(os.path.join(out_dir, f"{slug}.wav"), wav, sr)
        print(f"OK   {slug:28} {len(wav) / sr:5.2f}s  gen {time.time() - t1:5.1f}s")


if __name__ == "__main__":
    main()
