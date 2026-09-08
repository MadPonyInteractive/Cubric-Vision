"""MPI-607 Flow B: which ORDER carries a performance -- TTS-then-VC, or VC-then-TTS?

FABIO'S POINT (2026-08-27), and it is a defect report, not a preference: *"User picks a
voice. The voice goes through TTS ... comes out normal, neutral. Only then do you add the
performance."* Identity should be established FIRST.

WHY THAT MATTERS. The shipped audition recipe is order A -- TTS(perf clip) -> VC(voice) --
and its known cost is on this card already: stage 1 runs in the PERFORMER's voice, and VC
moves a voice only PART of the way (measured: 101.8 -> 94.2 Hz against a 125.7 Hz target).
So order A lands on "a consistent OTHER voice", not the voice the user picked. MPI-622 says
so outright, and Fabio heard it as "the variations merge into one voice".

Order B removes that: the TTS reference IS the picked voice, so identity should be exact.

    A  TTS(text, ref = perf clip)  ->  VC(input = A1, target = voice sample)
    B  VC(input = perf clip, target = voice sample)  ->  TTS(text, ref = B1)

ONE CONSTRAINT THAT KILLS THE NAIVE VERSION, stated so nobody re-proposes it: VC preserves
the SOURCE's linguistic content. `VC(input = perf clip, target = TTS output)` therefore
speaks the PERF CLIP's sentence in the user's voice, not the user's text. Order B works
because the VC output is used as a REFERENCE for TTS, never as the final audio.

CONTROLS ARE THE POINT. Two chains that both "sound fine" prove nothing without knowing what
the voice is supposed to sound like and what neutral is supposed to sound like:

    c0  the picked voice's shipped sample     what identity should sound like
    c1  plain TTS on the voice, neutral       identity with NO performance
    c2  the raw performance clip              the emotion, in the performer's voice

Judged by ear on two axes, and they can disagree -- that disagreement IS the result:
  IDENTITY  does it sound like c0/c1, or like c2?
  EMOTION   does the anger survive at all?

    G:/ComfyUi/python_embeded/python.exe chain_order_ab.py [--emotion angry]

Bench on 8188. Four generated jobs plus two copied controls.
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
WORK = Path(r"C:\Users\Fabio\AppData\Local\cubric-vision\mpi607\chainorder")

TEXT = "The meeting starts at nine, so please bring the report with you."
VOICE = "standard_male_1.opus"
SEED = 12345
# Locked on MPI-607: cfg 0.3 throughout; 1.2 for a reference that must carry a performance,
# 0.5 for a straight read.
CFG = 0.3
EXAG_PERF = 1.2
EXAG_FLAT = 0.5


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


def order_a(perf, voice, prefix):
    """TTS(text, ref = perf clip) -> VC(target = voice). The shipped audition recipe."""
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": perf}},
        "2": {"class_type": "LoadAudio", "inputs": {"audio": voice}},
        "3": {"class_type": "FL_ChatterboxTTS",
              "inputs": {"text": TEXT, "exaggeration": EXAG_PERF, "cfg_weight": CFG,
                         "temperature": 0.8, "seed": SEED, "audio_prompt": ["1", 0],
                         "keep_model_loaded": True}},
        "4": {"class_type": "FL_ChatterboxVC",
              "inputs": {"input_audio": ["3", 0], "target_voice": ["2", 0], "seed": SEED,
                         "use_cpu": False, "keep_model_loaded": True}},
        "5": {"class_type": "SaveAudio",
              "inputs": {"audio": ["4", 0], "filename_prefix": f"mpi607_order/{prefix}"}},
    }


def order_b(perf, voice, prefix):
    """VC(perf clip -> voice) -> TTS(text, ref = that). Fabio's order: identity first.

    Stage B1's output is a REFERENCE, never the delivered audio -- which is what keeps VC's
    word-preserving behaviour from putting the perf clip's sentence in the result.
    """
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": perf}},
        "2": {"class_type": "LoadAudio", "inputs": {"audio": voice}},
        "3": {"class_type": "FL_ChatterboxVC",
              "inputs": {"input_audio": ["1", 0], "target_voice": ["2", 0], "seed": SEED,
                         "use_cpu": False, "keep_model_loaded": True}},
        "4": {"class_type": "FL_ChatterboxTTS",
              "inputs": {"text": TEXT, "exaggeration": EXAG_PERF, "cfg_weight": CFG,
                         "temperature": 0.8, "seed": SEED, "audio_prompt": ["3", 0],
                         "keep_model_loaded": True}},
        "5": {"class_type": "SaveAudio",
              "inputs": {"audio": ["4", 0], "filename_prefix": f"mpi607_order/{prefix}"}},
        # The intermediate is saved too: if B sounds wrong, the question is immediately
        # "did the VC stage produce a usable reference?", and that needs the clip.
        "6": {"class_type": "SaveAudio",
              "inputs": {"audio": ["3", 0], "filename_prefix": f"mpi607_order/{prefix}_ref"}},
    }


def neutral(voice, prefix):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": voice}},
        "2": {"class_type": "FL_ChatterboxTTS",
              "inputs": {"text": TEXT, "exaggeration": EXAG_FLAT, "cfg_weight": CFG,
                         "temperature": 0.8, "seed": SEED, "audio_prompt": ["1", 0],
                         "keep_model_loaded": True}},
        "5": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": f"mpi607_order/{prefix}"}},
    }


def run(g, label, out_root, node="5", timeout=900):
    t0 = time.time()
    pid = post("/prompt", {"prompt": g})["prompt_id"]
    while time.time() - t0 < timeout:
        h = get(f"/history/{pid}")
        if pid in h:
            e = h[pid]
            if e.get("status", {}).get("status_str") == "error":
                print(f"  {label}: ERROR {json.dumps(e.get('status'))[:300]}")
                return None
            got = {}
            for nid, out in e.get("outputs", {}).items():
                for o in out.get("audio", []):
                    p = out_root / (o.get("subfolder") or "") / o["filename"]
                    if not p.exists():
                        continue
                    suffix = "" if nid == node else "_ref"
                    dst = WORK / f"{label}{suffix}{p.suffix}"
                    shutil.copy2(p, dst)
                    got[nid] = dst
            if node not in got:
                print(f"  {label}: no audio on node {node}")
                return None
            y, sr = librosa.load(str(got[node]), sr=None, mono=True)
            return {"label": label, "wall_s": round(time.time() - t0, 1),
                    "dur_s": round(len(y) / sr, 2),
                    "files": {k: str(v) for k, v in got.items()}}
        time.sleep(1.0)
    print(f"  {label}: timed out")
    return None


def main():
    args = sys.argv[1:]
    emotion = args[args.index("--emotion") + 1] if "--emotion" in args else "angry"

    WORK.mkdir(parents=True, exist_ok=True)
    try:
        out_root = Path(get("/system_stats").get("system", {}).get("output_directory")
                        or OUT_FALLBACK)
    except Exception as exc:
        sys.exit(f"bench not reachable on {BENCH}: {exc}")

    manifest = json.loads((REPO / "voices" / "manifest.json").read_text(encoding="utf-8"))
    v = next(x for x in manifest["voices"] if x["sample"] == VOICE)
    clip = next(c for c in manifest["performanceClips"]
                if c["register"] == v["register"] and c["emotion"] == emotion)

    voice_src = REPO / "voices" / VOICE
    perf_src = REPO / "voices" / clip["clip"]
    voice_wav = stage(voice_src, "mpi607_ord_voice.wav")
    perf_wav = stage(perf_src, "mpi607_ord_perf.wav")

    # The two controls are COPIES, not generations -- they cost nothing and without them
    # "does it sound like the voice" has no referent.
    shutil.copy2(voice_src, WORK / "c0_voice_sample.opus")
    shutil.copy2(perf_src, WORK / "c2_perf_clip.opus")

    print(f"voice {VOICE} ({v['display_name']}, {v['register']})")
    print(f"perf  {clip['clip']} ({clip['register']} {clip['emotion']})")
    print(f'text  "{TEXT}"\n')

    jobs = [
        ("c1_neutral_tts", "plain TTS on the voice, no performance", neutral(voice_wav, "c1"), "5"),
        ("A_tts_then_vc", "ORDER A: TTS(perf clip) -> VC(voice)",
         order_a(perf_wav, voice_wav, "A"), "5"),
        ("B_vc_then_tts", "ORDER B: VC(perf -> voice) -> TTS(ref = that)",
         order_b(perf_wav, voice_wav, "B"), "5"),
    ]

    rows = []
    for label, desc, g, node in jobs:
        print(f"-> {label}: {desc}")
        r = run(g, label, out_root, node=node)
        if r:
            print(f"   wall {r['wall_s']}s | dur {r['dur_s']}s")
            r["desc"] = desc
            rows.append(r)
        print()

    (WORK / "chainorder.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print("-" * 68)
    print("c0  the voice's shipped sample      <- what identity should sound like")
    print("c2  the raw performance clip        <- the emotion, in the PERFORMER's voice")
    for r in rows:
        print(f"{r['label']:<18} {r['dur_s']:>5}s  {r['desc']}")
    print("-" * 68)
    print(f"clips in {WORK}")
    print("TWO AXES, and they may disagree: does it sound like c0/c1 (identity), and does")
    print("the anger survive (emotion)? Order A is expected to drift off c0 -- that is the")
    print("defect Fabio reported. B_vc_then_tts_ref is B's intermediate, for diagnosis.")


if __name__ == "__main__":
    main()
