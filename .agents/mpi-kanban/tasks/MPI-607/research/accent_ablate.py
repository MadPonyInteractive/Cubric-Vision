"""MPI-607: ablate the ONE accent prompt that worked.

Of seven probes, only `accent: Strong British accent, London, non-rhotic.` produced a
non-American accent. It is the only one carrying all three of:
  (a) the literal phrase "Strong <X> accent"
  (b) a city / region
  (c) a phonetic trait ("non-rhotic")

`p5`/`p6` had (c) but led with a bare nationality; `p1`/`p2`/`p4` had neither (a) nor (b).

Two questions, in priority order:
  1. REPRODUCIBILITY -- was p3 seed luck? The model is not deterministic, so the winning
     prompt is re-run at three seeds. If it lands 1-in-3, the library plan's "3 samples,
     keep the best" already absorbs it -- but we must know the rate.
  2. WHICH COMPONENT carries the accent -- drop the city+trait, drop "Strong", and try
     the full formula on four other accents.

Run: venv/Scripts/python.exe accent_ablate.py <out_dir>
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

TEXT = ("The old lighthouse had stood at the edge of the cliff for nearly two hundred "
        "years, and every sailor who passed it knew the story by heart.")

WINNER = "Strong British accent, London, non-rhotic."


def structured(accent, gender="Male", age="Adult"):
    return (f"gender: {gender}.\n"
            f"age: {age}.\n"
            f"accent: {accent}\n"
            "pitch: Mid-range and stable.\n"
            "speed: Moderate pace with even rhythm.\n"
            "volume: Medium and consistent.\n"
            "clarity: Extremely clear articulation.\n"
            "fluency: Smooth and natural.\n"
            "tone: Calm and even.\n")


# (slug, accent_value, seed)
PROBES = [
    # 1. reproducibility of the exact winner, three fresh seeds
    ("r1_winner_seedA", WINNER, 3001),
    ("r2_winner_seedB", WINNER, 3002),
    ("r3_winner_seedC", WINNER, 3003),
    # 2. ablations -- which component carries it
    ("a1_no_city_no_trait", "Strong British accent.", 3004),
    ("a2_no_strong", "British accent, London, non-rhotic.", 3005),
    # 3. does the winning formula generalise to other accents
    ("g1_italian", "Strong Italian accent, Rome, rolled r sounds.", 3006),
    ("g2_russian", "Strong Russian accent, Moscow, hard consonants.", 3007),
    ("g3_french", "Strong French accent, Paris, nasal vowels.", 3008),
    ("g4_german", "Strong German accent, Berlin, clipped precise consonants.", 3009),
]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = Qwen3TTSModel.from_pretrained(MODEL_DIR, device_map=device,
                                          dtype=torch.bfloat16)
    print(f"model loaded | device {device}")

    for slug, accent, seed in PROBES:
        instruct = structured(accent)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        np.random.seed(seed)

        t1 = time.time()
        try:
            wavs, sr = model.generate_voice_design(
                text=TEXT, language="english", instruct=instruct, **GEN)
        except Exception as exc:
            print(f"FAIL {slug}: {type(exc).__name__}: {exc}")
            continue
        if not (isinstance(wavs, list) and wavs):
            print(f"FAIL {slug}: no audio")
            continue

        wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
        sf.write(os.path.join(out_dir, f"{slug}.wav"), wav, sr)
        with open(os.path.join(out_dir, f"{slug}.txt"), "w", encoding="utf-8") as fh:
            fh.write(f"SEED: {seed}\nACCENT VALUE: {accent}\n")
        print(f"OK   {slug:22} {len(wav) / sr:5.2f}s  gen {time.time() - t1:5.1f}s")


if __name__ == "__main__":
    main()
