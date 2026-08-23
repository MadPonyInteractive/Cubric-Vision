"""MPI-607: run Qwen3-TTS VoiceDesign locally, inside the transformers-4 runtime.

Runs OUTSIDE ComfyUI. The bench ComfyUI keeps transformers 5.13.0 untouched; this
process sees 4.57.3 from the venv and inherits torch 2.12.0+cu130 from the bench.

Inference code is flybirdxx/ComfyUI-Qwen-TTS's bundled `qwen_tts` (Apache-2.0) -- the
same code path the tutorial's results came from, minus the ComfyUI node wrapper.

Prompt set + generation settings are lifted verbatim from Fabio's tutorial screenshots
so the output is directly comparable to the video.

Usage: venv/Scripts/python.exe design_voices.py <out_dir> [set]
       set = "tutorial" (default) | "library"
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

# Settings read off the tutorial screenshots.
GEN = dict(max_new_tokens=2048, top_p=0.80, top_k=20, temperature=1.0,
           repetition_penalty=1.05)
LANGUAGE = "english"

# Fabio's five prompts, verbatim from the screenshots.
TUTORIAL = [
    ("t1_playful_chuckle",
     "I am sorry, that was funnier than it should be.",
     "Adult female, playful, smiling tone, light chuckle on funnier, medium pitch, "
     "medium tempo, clear diction."),
    ("t2_soft_crying",
     "I thought I was ready, but I was wrong.",
     "Adult female, soft crying, shaky breath, slow tempo, voice tremble, small sniff, "
     "do not over-act."),
    ("t3_cold_anger",
     "You promised. You lied. You mother Beeeep...",
     "Adult female, cold anger, low pitch, clipped delivery, slow-medium tempo, hard "
     "consonants, no shouting."),
    ("t4_tense_whisper",
     "Do you hear that, behind us?",
     "Adult female, tense whisper, breathy, slow pace, rising intonation at the end, "
     "minimal volume."),
    ("t5_trailer_voice",
     "In a world where nothing makes sense, one choice changes everything.",
     "Adult male, deep trailer voice, low pitch, slow pace, dramatic pauses, heavy "
     "emphasis, cinematic gravitas."),
]

# Library seeds, written in the same grammar as Fabio's prompts (persona, delivery,
# pitch, tempo, articulation) -- these are neutral character beds meant to be CLONED
# by Chatterbox, so the text is long enough to be a ~10s reference.
LIB_TEXT = ("The old lighthouse had stood at the edge of the cliff for nearly two "
            "hundred years, and every sailor who passed it knew the story by heart. "
            "On a clear night you could see its beam sweeping across the water.")

LIBRARY = [
    ("lib_m_young_warm",
     "Adult male, early twenties, warm and friendly, medium-high pitch, medium tempo, "
     "relaxed conversational delivery, clear diction."),
    ("lib_m_midage_authoritative",
     "Adult male, forties, calm authority, low pitch, measured tempo, even emphasis, "
     "documentary narration, no theatrics."),
    ("lib_m_senior_gravel",
     "Adult male, seventies, gravelly and weathered, low pitch, slow tempo, slight "
     "rasp, world-weary storyteller."),
    ("lib_f_young_bright",
     "Adult female, early twenties, bright and energetic, medium-high pitch, brisk "
     "tempo, lively delivery, crisp consonants."),
    ("lib_f_midage_narration",
     "Adult female, forties, refined British accent, low-mid pitch, unhurried tempo, "
     "rich timbre, calm narration."),
    ("lib_f_senior_gentle",
     "Adult female, seventies, gentle and kindly, medium pitch, slow tempo, soft "
     "articulation, grandmotherly warmth."),
]

# Does the TEXT's language drive the spoken language on its own, the way it does for
# some video models? Items here carry a 4th element overriding LANGUAGE.
JP = "こんにちは。今日は新しい声のテストをしています。よろしくお願いします。"
ES = "Hola. Hoy estamos probando una voz nueva. Espero que suene natural."
DIRECTION = ("Adult female, forties, calm and clear, medium pitch, medium tempo, "
             "warm conversational delivery.")

LANGTEST = [
    ("lang1_jp_auto", JP, DIRECTION, "auto"),
    ("lang2_jp_explicit", JP, DIRECTION, "japanese"),
    ("lang3_es_auto", ES, DIRECTION, "auto"),
    ("lang4_en_auto", "Hello. Today we are testing a new voice. I hope it sounds "
                      "natural.", DIRECTION, "auto"),
]

# Accent test. Chatterbox has NO text prompt for the voice, so accent can only come from
# the reference clip -- meaning it has to be baked in here, at design time. Text stays
# ENGLISH throughout: the target is the movie-character case (an Italian accent speaking
# English), not the Italian language.
ACC_TEXT = ("The old lighthouse had stood at the edge of the cliff for nearly two "
            "hundred years, and every sailor who passed it knew the story by heart. "
            "On a clear night you could see its beam sweeping across the water.")

ACCENTS = [
    ("acc_it_m", "Adult male, forties, speaking English with a strong Italian accent, "
                 "warm and expressive, medium pitch, medium tempo, rolled r sounds, "
                 "melodic intonation."),
    ("acc_ru_m", "Adult male, forties, speaking English with a heavy Russian accent, "
                 "low pitch, deliberate tempo, hard consonants, flat intonation, "
                 "gravelly edge."),
    ("acc_de_f", "Adult female, thirties, speaking English with a clear German accent, "
                 "medium pitch, precise clipped articulation, measured tempo, crisp "
                 "consonants."),
    ("acc_nl_m", "Adult male, thirties, speaking English with a Dutch accent, "
                 "medium-low pitch, relaxed tempo, guttural g sounds, direct delivery."),
    ("acc_es_f", "Adult female, thirties, speaking English with a Spanish accent, "
                 "medium pitch, lively tempo, rolled r sounds, warm open vowels."),
    ("acc_fr_f", "Adult female, thirties, speaking English with a French accent, "
                 "medium pitch, soft breathy delivery, unhurried tempo, nasal vowels."),
]

SETS = {
    "tutorial": TUTORIAL,
    "library": [(s, LIB_TEXT, d) for s, d in LIBRARY],
    "lang": LANGTEST,
    "accents": [(s, ACC_TEXT, d) for s, d in ACCENTS],
}


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    which = sys.argv[2] if len(sys.argv) > 2 else "tutorial"
    items = SETS[which]
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"transformers {__import__('transformers').__version__} | torch "
          f"{torch.__version__} | device {device}")

    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_DIR, device_map=device, dtype=torch.bfloat16)
    print(f"model loaded in {time.time() - t0:.1f}s")

    for i, item in enumerate(items):
        slug, text, instruct = item[0], item[1], item[2]
        lang = item[3] if len(item) > 3 else LANGUAGE
        seed = 1000 + i
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        np.random.seed(seed)

        t1 = time.time()
        try:
            wavs, sr = model.generate_voice_design(
                text=text, language=lang, instruct=instruct, **GEN)
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
            fh.write(f"TEXT: {text}\nDIRECTION: {instruct}\nSEED: {seed}\n")
        print(f"OK   {slug}  {len(wav) / sr:5.2f}s @ {sr}Hz  gen {time.time() - t1:5.1f}s"
              f"  -> {path}")


if __name__ == "__main__":
    main()
