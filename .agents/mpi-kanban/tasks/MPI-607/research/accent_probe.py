"""MPI-607: can Qwen3-TTS VoiceDesign be made to produce a non-neutral ACCENT?

Six freeform-prose accent prompts all came back American. The pack's shipped prompt
vocabulary (`voice_instruct.json`) turns out to be a STRUCTURED grammar of
`key: value.` lines -- gender / age / pitch / speed / volume / clarity / fluency /
accent / texture / emotion / tone / personality / style note -- and every canned style
pins `accent: Neutral.`, with no non-neutral example anywhere in the pack.

So this probe asks one question: does the structured `accent:` key steer the model where
prose did not? British RP is the canary -- the most-represented non-American English
accent there is. If British will not land, no accent will, and the accent axis is dead.

Run: venv/Scripts/python.exe accent_probe.py <out_dir>
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


def structured(accent, gender="Male", age="Adult"):
    """The pack's own grammar, with only `accent` varying."""
    return (f"gender: {gender}.\n"
            f"age: {age}.\n"
            f"accent: {accent}\n"
            "pitch: Mid-range and stable.\n"
            "speed: Moderate pace with even rhythm.\n"
            "volume: Medium and consistent.\n"
            "clarity: Extremely clear articulation.\n"
            "fluency: Smooth and natural.\n"
            "tone: Calm and even.\n")


PROBES = [
    # control: what the grammar produces with the canned neutral value
    ("p0_ctl_neutral", structured("Neutral.")),
    # canary: British, three phrasings of increasing specificity
    ("p1_british_bare", structured("British.")),
    ("p2_british_rp", structured("British English, Received Pronunciation.")),
    ("p3_british_strong", structured("Strong British accent, London, non-rhotic.")),
    # prose control -- the phrasing that already failed, to confirm it is the phrasing
    ("p4_british_prose",
     "Adult male, speaking English with a strong British accent, Received Pronunciation, "
     "medium pitch, moderate tempo, clear articulation."),
    # non-native accents, structured
    ("p5_italian", structured("Italian. Non-native English speaker, Italian first "
                              "language, rolled r sounds and melodic intonation.")),
    ("p6_russian", structured("Russian. Non-native English speaker, Russian first "
                              "language, hard consonants and flat intonation.")),
]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = Qwen3TTSModel.from_pretrained(MODEL_DIR, device_map=device,
                                          dtype=torch.bfloat16)
    print(f"model loaded | device {device}")

    for i, (slug, instruct) in enumerate(PROBES):
        seed = 2000 + i
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
            fh.write(f"SEED: {seed}\nDIRECTION:\n{instruct}\n")
        print(f"OK   {slug:22} {len(wav) / sr:5.2f}s  gen {time.time() - t1:5.1f}s")


if __name__ == "__main__":
    main()
