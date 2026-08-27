"""MPI-607 Flow B: does the accent axis EXIST, or is Indian the only one that reads?

WHAT PROMPTED THIS. The four-quadrant probe's q3 (French) came back with no accent at all.
Fabio, listening: *"The only accent that I actually noticed was the Indian accent. Every
other accent just read neutral."* -- at `exaggeration` 0.5.

THAT DEMOTES THE QUESTION. It was "which exaggeration does an accent need"; it is now
"is there an accent feature at all". One working accent out of 23 does not justify a 3.2 GB
third weight set, so this probe decides whether the accent axis ships, not how it is tuned.

THE CARD AND THE EAR DISAGREE, AND THE EAR WINS UNTIL RE-MEASURED. validation.md 2026-08-23
says *"`exaggeration` 0.8 gives a more pronounced accent than 0.5; both work."* Fabio now
says 0.5 gave him nothing outside Indian. Both readings are his, months apart, so this asks
the one question that separates them: does 0.8 RESCUE the accents that 0.5 leaves neutral?

FIVE CLIPS, chosen to be listenable rather than exhaustive:

    a0  base model, no accent           the control -- 'sounds French' needs a not-French
    a1  Hindi   @ 0.5                   the KNOWN POSITIVE. If this reads neutral too, the
                                        probe itself is wrong, not the feature.
    a2  French  @ 0.8                   does 0.8 rescue a language 0.5 left flat?
    a3  German  @ 0.8                   second sample of the same question
    a4  Italian @ 0.8                   third -- one language rescuing could be seed luck

A POSITIVE CONTROL IS THE POINT. Without a1 a uniformly neutral result is unreadable: it
could mean the feature is dead, or that the reference voice overpowers it, or that the
staging is broken. With it, a flat a2-a4 against a clear a1 is a real verdict.

ACCENT IS AN EAR JUDGEMENT and nothing here scores it. This card has twice been burned
trusting a number over a listener -- the CAMPPlus cosine, then corpus gates that measured
signal instead of speech. The script's only job is to vary one thing at a time.

    G:/ComfyUi/python_embeded/python.exe accent_strength_probe.py

Bench on 8188. Five jobs, warm. `cfg_weight` is held at the node default 0.5 throughout:
the quadrant probe ran 0.3 (the BASE model's emotion recipe, carried over without being
re-derived) and that is not a value Fabio's own listening ever used.
"""
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]

import librosa  # noqa: E402
import soundfile as sf  # noqa: E402

BENCH = "http://127.0.0.1:8188"
BENCH_INPUT = Path(r"G:\ComfyUi\ComfyUI\input")
OUT_FALLBACK = Path(r"D:\WORK\Images\Outputs")
WORK = Path(r"C:\Users\Fabio\AppData\Local\cubric-vision\mpi607\accent")

# Deliberately ordinary English. The product case is an English line READ with a foreign
# accent -- not the model speaking the other language.
TEXT = "The meeting starts at nine, so please bring the report with you."
VOICE = "standard_male_1.opus"
SEED = 12345
CFG = 0.5           # node default, and what Fabio's listening used
REP_PENALTY = 1.5   # measured this session; 2.0 fails to stop on 3 of 6 seeds


def post(path, payload):
    req = urllib.request.Request(f"{BENCH}{path}", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get(path):
    with urllib.request.urlopen(f"{BENCH}{path}", timeout=60) as r:
        return json.load(r)


def stage(src, name):
    y, sr = librosa.load(str(src), sr=None, mono=True)
    sf.write(str(BENCH_INPUT / name), y, sr)
    return name


def mtl(ref, language, exaggeration, prefix):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref}},
        "2": {"class_type": "FL_ChatterboxMultilingualTTS",
              "inputs": {"text": TEXT, "language": language, "exaggeration": exaggeration,
                         "cfg_weight": CFG, "temperature": 0.8,
                         "repetition_penalty": REP_PENALTY, "min_p": 0.05, "top_p": 1.0,
                         "seed": SEED, "audio_prompt": ["1", 0],
                         "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": f"mpi607_accent/{prefix}"}},
    }


def base(ref, prefix):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref}},
        "2": {"class_type": "FL_ChatterboxTTS",
              "inputs": {"text": TEXT, "exaggeration": 0.5, "cfg_weight": 0.3,
                         "temperature": 0.8, "seed": SEED, "audio_prompt": ["1", 0],
                         "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": f"mpi607_accent/{prefix}"}},
    }


def run(g, label, out_root, timeout=900):
    t0 = time.time()
    pid = post("/prompt", {"prompt": g})["prompt_id"]
    while time.time() - t0 < timeout:
        h = get(f"/history/{pid}")
        if pid in h:
            e = h[pid]
            if e.get("status", {}).get("status_str") == "error":
                print(f"  {label}: ERROR {json.dumps(e.get('status'))[:300]}")
                return None
            outs = e.get("outputs", {}).get("3", {}).get("audio", [])
            if not outs:
                print(f"  {label}: no audio on node 3")
                return None
            o = outs[0]
            p = out_root / (o.get("subfolder") or "") / o["filename"]
            dst = WORK / f"{label}{p.suffix}"
            shutil.copy2(p, dst)
            y, sr = librosa.load(str(dst), sr=None, mono=True)
            return {"label": label, "wall_s": round(time.time() - t0, 1),
                    "dur_s": round(len(y) / sr, 2), "file": str(dst)}
        time.sleep(1.0)
    print(f"  {label}: timed out")
    return None


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    try:
        out_root = Path(get("/system_stats").get("system", {}).get("output_directory")
                        or OUT_FALLBACK)
    except Exception as exc:
        sys.exit(f"bench not reachable on {BENCH}: {exc}")

    ref = stage(REPO / "voices" / VOICE, "mpi607_accent_ref.wav")
    print(f"voice {VOICE} | seed {SEED} | cfg {CFG} | rp {REP_PENALTY}")
    print(f'text  "{TEXT}"\n')

    jobs = [
        ("a0_base_control", "base model, no accent (control)", base(ref, "a0")),
        ("a1_hindi_ex05", "Hindi @ 0.5 - the KNOWN POSITIVE",
         mtl(ref, "Hindi (hi)", 0.5, "a1")),
        ("a2_french_ex08", "French @ 0.8 - does 0.8 rescue it?",
         mtl(ref, "French (fr)", 0.8, "a2")),
        ("a3_german_ex08", "German @ 0.8", mtl(ref, "German (de)", 0.8, "a3")),
        ("a4_italian_ex08", "Italian @ 0.8", mtl(ref, "Italian (it)", 0.8, "a4")),
    ]

    rows = []
    for label, desc, g in jobs:
        print(f"-> {label}: {desc}")
        r = run(g, label, out_root)
        if r:
            print(f"   wall {r['wall_s']}s | dur {r['dur_s']}s")
            r["desc"] = desc
            rows.append(r)
        print()

    (WORK / "accent.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print("-" * 64)
    for r in rows:
        print(f"{r['label']:<18} {r['dur_s']:>5}s  {r['desc']}")
    print("-" * 64)
    print(f"{len(rows)}/{len(jobs)} generated. Clips in {WORK}")
    print("EAR ONLY. If a1 (Hindi) reads neutral too, distrust the probe before the feature.")


if __name__ == "__main__":
    main()
