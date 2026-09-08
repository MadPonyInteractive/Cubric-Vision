"""MPI-622 Phase 3: the MISSING performance grids — R2, R4 and R5 x six emotions.

The Phase 2 grid is R1 + R3 only, by design ("R2 interpolates; R4/R5 land when a cartoon
voice needs them"). A cartoon voice now exists — ten of them — and 25 of the 60 shipped
voices sit in R2/R4/R5.

WHY THE FULL GRID AND NOT JUST NEUTRAL. Auditions need one cell per register, so three
clips looked like the whole job. `check_manifest.mjs` check 9 refuses it: every register
PRESENT in the manifest must carry all six emotions, or `listPerformanceClips(reg)` hands
the picker a register that can do one thing. Weakening that check to ship a partial grid
would put a voice in the library offering emotions it cannot perform. Eighteen clips is
the smallest set that does not break the invariant.

WHY NOT DRIVE R2/R4/R5 OFF THE R1 OR R3 CLIPS. Source pitch LEAKS through VC: two
performers 0.47 apart drove one character to outputs 93 Hz apart on this card. Driving a
394 Hz cartoon critter off the 94.7 Hz R1 neutral hands back an audition that
misrepresents the voice the user is about to pick.

PERSONAS ARE VERBATIM PREFIXES of the shipped `library_personas.py` entries that already
measured into each band — `mature_female` (R2), `child` (R4), `cartoon_critter` (R5).
Only the tempo/delivery half is dropped, because EMOTIONS supplies exactly that and the
two would otherwise fight. For R5 that drop is load-bearing: the shipped cartoon persona
ends "exaggerated playful delivery", and carrying it into every cell would make the whole
R5 grid read excited.

CALIBRATION, AND WHY IT IS PER-REGISTER AND NOT PER-CLIP. The R4 and R5 personas do not
land on their band's baseline: measured across three seeds each, every child take came
back 363-408 Hz (R5 territory, never R4) and the cartoon takes 339-464 Hz. Re-rolling was
tried first and was the wrong tool — this card's own instruction is that a clip off its
baseline is REPAIRED with `pitch_tools.py shift` (validated to +/-19 st, no artefacts,
emotion intact), not re-rolled. The correction is applied identically to all six cells of
a register because it calibrates the PERFORMER, not the take: that preserves each
emotion's pitch delta exactly while putting the baseline where the band says it is.
Relabelling R4 as R5 and vice versa was the other obvious fix and was REJECTED — it would
leave a cartoon read driving every child audition and a child read driving every cartoon
one, trading a real perceptual risk for a pitch fix.

DO NOT REJECT AN EMOTION CELL FOR MEASURING OUT OF BAND. `register` names the performer's
baseline, never the clip's f0; an angry R1 take measured 167 Hz and is correct. Only the
neutral cell is expected to sit on the baseline.

Everything else — text, generation params, seeding, write format — is imported from
`phase2_perf_clips.py` so these eighteen clips stay directly comparable to the twelve that
shipped. Seeds are 2100+ so they cannot collide with Phase 2's 2000-2011.

Usage (under the GPU lease; foreground — a backgrounded external exe is refused here):
    python <mpi-lib>/scripts/gpu_lease.py run -- \
        G:/ComfyUi/_qwen_tts_rt/venv/Scripts/python.exe phase3_perf_r245.py \
        <out_dir> [--only R4,R5] [--emotions neutral,angry] [--seed-offset 10]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from phase2_perf_clips import (  # noqa: E402
    EMOTIONS, GEN, LANGUAGE, MODEL_DIR, PACK, PERF_TEXT)

sys.path.insert(0, PACK)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402

from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel  # noqa: E402

# register -> (persona, baseline calibration in semitones)
#
# THE CALIBRATION TARGET IS THE MEAN f0 OF THE VOICES THE GRID DRIVES, not the midpoint of
# the band. That is not a preference — it is what the two shipped, ear-approved grids
# already do: R1's neutral sits 1.34 st off its 22 voices' mean and R3's sits 0.22 st off
# its 13. Matching the band midpoint instead would have put R2 nine semitones from the
# voices it has to drive. Targets: R2 167.8 Hz, R4 323.1 Hz, R5 377.1 Hz.
#
# Each figure is measured against a real take, never guessed, and applies to all six cells
# of its register — see the module docstring for why the correction is per-performer.
PERSONAS = {
    "R2": ("Middle aged woman, low warm alto voice, full chest resonance", -3.59),
    "R4": ("Young child around eight years old, moderate pitch, soft light voice", -2.86),
    "R5": ("Animated cartoon critter character, very high pitch, squeaky bright timbre", 0.60),
}

# Deterministic order, so a re-run reproduces the same seed per cell.
GRID = [(reg, emo) for reg in ("R2", "R4", "R5") for emo in EMOTIONS]


def main():
    args = sys.argv[1:]
    out_dir = args[0] if args and not args[0].startswith("--") else "."
    only_reg, only_emo, offset = None, None, 0
    for i, a in enumerate(args):
        if a == "--only":
            only_reg = {s.strip() for s in args[i + 1].split(",")}
        elif a == "--emotions":
            only_emo = {s.strip() for s in args[i + 1].split(",")}
        elif a == "--seed-offset":
            offset = int(args[i + 1])

    jobs = [(r, e) for r, e in GRID
            if (only_reg is None or r in only_reg) and (only_emo is None or e in only_emo)]
    if not jobs:
        raise SystemExit("--only/--emotions matched nothing")
    os.makedirs(out_dir, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"transformers {__import__('transformers').__version__} | torch "
          f"{torch.__version__} | device {device} | {len(jobs)} clips")

    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_DIR, device_map=device, dtype=torch.bfloat16)
    print(f"model loaded in {time.time() - t0:.1f}s")

    for reg, emo in jobs:
        persona, calib = PERSONAS[reg]
        seed = 2100 + GRID.index((reg, emo)) + offset
        slug = f"perf_{reg}_{emo}" + (f"_s{offset}" if offset else "")
        instruct = f"{persona}, {EMOTIONS[emo]}."
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
                     f"DIRECTION: {instruct}\nSEED: {seed}\n"
                     f"CALIBRATION_ST: {calib}\n")
        print(f"OK   {slug:<24} {len(wav) / sr:5.2f}s @ {sr}Hz  gen {time.time() - t1:5.1f}s")

    print("\nNEXT: apply the per-register CALIBRATION_ST with pitch_tools.py shift, then")
    print("      measure. Only the neutral cell is expected on baseline; an emotion cell")
    print("      off band is correct and must not be re-rolled. Then judge BY EAR —")
    print("      VoiceDesign's prompt label is not a promise of the delivered emotion.")


if __name__ == "__main__":
    main()
