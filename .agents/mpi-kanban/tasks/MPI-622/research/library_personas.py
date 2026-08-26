"""MPI-622: author the voice library with Qwen3-TTS VoiceDesign, one persona per category.

WHY THE CORPUS WAS DROPPED (Fabio, 2026-08-26 - decided, do not reopen). The 60 curated
kyutai CC0 voices were auditioned and rejected outright: "I think 99% of this voice library
is garbage... none of it is usable." His reasons, all of which my measurements were blind to:
unintelligible accents (the donation pool is heavily Indian and Spanish accented), poor
microphone quality, and a "cartoon" that is a bad voice actor impersonating one. Plus the
structural gap - R4 and R5 held ONE voice each out of 228.

The failure was mine and it is worth stating plainly so it is not repeated: the curation
gates were `voiced_frac` and `snr_proxy_db`, which measure SIGNAL, not SPEECH. They cannot
see accent, intelligibility, mic character or acting. Worse, the one attribute that decided
usability - accent - is the field the design forbids inferring, so it could not enter the
ranking even in principle. This card had already recorded the same lesson one layer down
("the CAMPPlus cosine agreed with the pipeline at every step while disagreeing with the
listener"). A perceptual product needs a perceptual gate: ONE voice per category goes to
Fabio's ear BEFORE the other four are ever generated.

VoiceDesign was already `brief.md` section Sourcing's "long game". It is promoted to the
source because it fixes every one of the above: studio-clean by construction, and its
UNCONTROLLABLE AMERICAN PRIOR - closed NEGATIVE on MPI-607 when the goal was CHOOSING an
accent - is exactly the one consistent intelligible house accent wanted here. Same defect,
inverted by the goal, for the second time on this card.

ACCENT IS NEVER PROMPTED. MPI-607 asked for "refined British" and got a 1930s New York
gangster. Categories are gender / age / character-type only.

Apache-2.0, offline authoring, never an app dependency - this does not touch the standing
"Qwen3-TTS is never shipped" rule.

Usage (ALWAYS under the GPU lease, ALWAYS as a background Bash call):
    python <mpi-lib>/scripts/gpu_lease.py run -- \
        G:/ComfyUi/_qwen_tts_rt/venv/Scripts/python.exe library_personas.py <out_dir> [n]

    n = voices per category (default 1). Pass 1 for the approval pass, then 4 more per
    APPROVED category with --start 1 so the seeds do not collide with the approved take.
"""
import argparse
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

# Lifted verbatim from design_voices.py / phase2_perf_clips.py so every VoiceDesign result
# on this card stays directly comparable.
GEN = dict(max_new_tokens=2048, top_p=0.80, top_k=20, temperature=1.0,
           repetition_penalty=1.05)
LANGUAGE = "english"

# ONE text across the whole library, and NOT the performance-clip text.
#
# It must be phonetically comprehensive - that is an open red requirement on this card, and
# it binds here for a different reason than it does for the performance clips. VC takes
# articulation from the SOURCE, so a character voice inherits the performance clip's
# consonants; but this sample is also the NARRATION reference and the thing a user auditions
# to decide, so it has to let a voice demonstrate its own articulation.
#
# Deliberately DIFFERENT wording from PERF_TEXT so that auditioning a character voice does
# not play the listener the same sentence twice.
#
# Coverage checked by hand: kn- (knew), br- (bridge, broken), cr- (crew, crane),
# tr- (traced), str- (strange), gr- (green), gl- (glow), dr- (drifting), pr- (printed),
# wr- (write), /D/ (the, they), /T/ (nothing), /S/ (sure), /tS/ (chart), /dZ/ (just),
# plus open and closed vowels and a final unstressed syllable.
LIB_TEXT = ("The bridge crew traced a strange green glow drifting past the broken crane, "
            "but nothing they knew could explain it. Just write it in the printed chart "
            "and be sure of the time.")

# 12 categories x 5 = 60. Approved by Fabio 2026-08-26.
#
# `register` is the PERFORMER'S BASELINE the persona is aimed at - it is what the runtime
# uses to pick a shared performance clip, so it is an engineering key, not a label. It is
# a TARGET here, verified by measurement after generation, never assumed.
#
# NOTE ON EMOTION: none is prompted. A library voice is ONE NEUTRAL SAMPLE. Emotion arrives
# at runtime from the shared register x emotion performance grid, which is why a new emotion
# costs one clip per register instead of sixty voice variants (brief.md section 2).
PERSONAS = [
    ("deep_male", "R1",
     "Adult male, fifties, deep and resonant, very low pitch, slow measured tempo, "
     "full chest resonance, calm and grounded, clear diction"),

    ("standard_male", "R1",
     "Adult male, early thirties, warm and friendly, medium-low pitch, relaxed "
     "conversational tempo, natural everyday delivery, clear diction"),

    ("elderly_male", "R1",
     "Adult male, seventies, gravelly and weathered, low pitch, slow tempo, slight rasp, "
     "world-weary storyteller"),

    ("young_male", "R2",
     "Young male, late teens, bright and eager, medium-high pitch, brisk tempo, light "
     "timbre, casual delivery, crisp consonants"),

    ("narrator_trailer", "R1",
     "Adult male, deep trailer voice, low pitch, slow pace, dramatic pauses, heavy "
     "emphasis, cinematic gravitas"),

    ("mature_female", "R2",
     "Adult female, forties, low-mid pitch, unhurried tempo, rich timbre, calm composed "
     "narration, even emphasis"),

    ("standard_female", "R3",
     "Adult female, early thirties, natural and even, medium pitch, medium tempo, "
     "conversational warmth, clear diction"),

    ("young_female", "R3",
     "Adult female, early twenties, bright and energetic, medium-high pitch, brisk tempo, "
     "lively delivery, crisp consonants"),

    ("elderly_female", "R2",
     "Adult female, seventies, gentle and kindly, medium pitch, slow tempo, soft "
     "articulation, grandmotherly warmth"),

    ("child", "R4",
     "Young child, around eight years old, high pitch, light airy timbre, quick eager "
     "tempo, simple clear articulation, natural child voice and not cartoonish"),

    # THE RISK CELL. Fabio rejected the corpus cartoon as "somebody trying to impersonate a
    # cartoon, a terrible voice actor", so a model doing the same impersonation fails the
    # same way. Prompted as an animated CHARACTER rather than as a person doing a voice.
    ("cartoon_critter", "R5",
     "Animated cartoon critter character, very high pitch, squeaky bright timbre, quick "
     "bouncy tempo, exaggerated playful delivery, fully animated character voice"),

    # RENAMED 2026-08-26 from `creature_monster`, on Fabio's ear: the v1 take "sounds more
    # like a villain... a menacing voice". That is a good result wearing the wrong label, so
    # the label moved rather than the voice. My prompt asked for "menacing but fully
    # articulate", and that is exactly what it delivered - a menacing human.
    #
    # TRUE CREATURE / MONSTER IS NOT A TTS JOB, and neither is robot. brief.md already
    # settles the neighbouring case: "True robot voices are post-FX (vocoder / ring-mod /
    # formant shift) on any voice - a later card, not a job for the TTS model." A monster is
    # the same shape of problem: non-human timbre comes from processing, not from a speech
    # model whose entire prior is human voices. Both are post-FX on ANY deep voice, so
    # neither needs a library slot at all. Fabio, 2026-08-26: "I never asked for a monster
    # anyway, but I guess a voice could be for a monster or a dragon."
    #
    # This category also still absorbs the sub-90 Hz range that the 15 rejected corpus
    # voices would have occupied, so the open R1-floor question stays settled as product.
    #
    # THE FIVE ARE MIXED-GENDER (Fabio: "the variants can have a male and female"), unlike
    # every other category. Author them from `VILLAIN_VARIANTS` below, not by repeating one
    # direction five times.
    ("villain_menacing", "R1",
     "Adult male villain, extremely low pitch, deep guttural rumble under the voice, "
     "slow heavy tempo, chest resonance, menacing but fully articulate and intelligible"),
]

# The villain category is the ONE that ships more than one direction, because menace reads
# very differently across gender and delivery. Used when its remaining four are authored.
VILLAIN_VARIANTS = [
    ("villain_menacing_m_deep",
     "Adult male villain, extremely low pitch, deep guttural rumble under the voice, "
     "slow heavy tempo, chest resonance, menacing but fully articulate and intelligible"),
    ("villain_menacing_m_cold",
     "Adult male villain, cold and controlled, low pitch, quiet clipped delivery, "
     "unhurried, no shouting, quietly threatening, precise diction"),
    ("villain_menacing_f_cold",
     "Adult female villain, cold and composed, low-mid pitch, measured unhurried tempo, "
     "quiet controlled menace, precise diction, no shouting"),
    ("villain_menacing_f_silk",
     "Adult female villain, smooth and silken, low warm pitch, slow deliberate delivery, "
     "charming on the surface and dangerous underneath, rich timbre"),
    ("villain_menacing_m_manic",
     "Adult male villain, unhinged and theatrical, medium pitch with sudden shifts, "
     "uneven tempo, gleeful menace, sharp consonants, fully intelligible"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("n", nargs="?", type=int, default=1,
                    help="voices per category (default 1 = the approval pass)")
    ap.add_argument("--start", type=int, default=0,
                    help="first variant index; use 1 after the approval pass so seeds "
                         "do not collide with the take Fabio already accepted")
    ap.add_argument("--only", default="",
                    help="comma-separated category slugs; default is all 12")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    wanted = {s.strip() for s in args.only.split(",") if s.strip()}
    personas = [p for p in PERSONAS if not wanted or p[0] in wanted]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"transformers {__import__('transformers').__version__} | torch "
          f"{torch.__version__} | device {device}")
    print(f"{len(personas)} categories x {args.n} = {len(personas) * args.n} voices\n")

    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_DIR, device_map=device, dtype=torch.bfloat16)
    print(f"model loaded in {time.time() - t0:.1f}s\n")

    ok = fail = 0
    for ci, (slug, reg, direction) in enumerate(personas):
        for vi in range(args.start, args.start + args.n):
            name = f"{slug}_{vi + 1}"
            # Seed is derived and RECORDED. Phase 2 proved identity across seeds is a
            # lottery for at least one cell, so the winning ticket number is provenance.
            seed = 5000 + ci * 100 + vi
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
                fail += 1
                continue

            if not (isinstance(wavs, list) and wavs):
                print(f"FAIL {name}: no audio returned ({type(wavs)})")
                fail += 1
                continue

            wav = np.asarray(wavs[0], dtype=np.float32).squeeze()
            path = os.path.join(args.out_dir, f"{name}.wav")
            sf.write(path, wav, sr)
            with open(os.path.join(args.out_dir, f"{name}.txt"), "w",
                      encoding="utf-8") as fh:
                fh.write(f"CATEGORY: {slug}\nTARGET_REGISTER: {reg}\nTEXT: {LIB_TEXT}\n"
                         f"DIRECTION: {direction}\nSEED: {seed}\n")
            print(f"OK   {name:<24} {len(wav) / sr:5.2f}s @ {sr}Hz  "
                  f"gen {time.time() - t1:5.1f}s")
            ok += 1

    print(f"\n{ok} generated, {fail} failed -> {args.out_dir}")
    print("\nNEXT, AND NEITHER STEP IS OPTIONAL:")
    print("  1. Measure median_f0 per clip and compare against TARGET_REGISTER. The target")
    print("     is a claim the prompt makes, not a fact - verify it.")
    print("  2. LEVEL-MATCH before anyone listens, by matching rms_active at -20 dBFS.")
    print("     Do NOT use pitch_tools.py norm: its -1.0 dBFS peak ceiling under-levels")
    print("     high-crest clips and it once WIDENED the very gap it was run to close.")
    print("  3. Judge BY EAR, one voice per category, BEFORE generating the other four.")
    print("     That gate is the whole point - measurement is what missed the corpus.")


if __name__ == "__main__":
    main()
