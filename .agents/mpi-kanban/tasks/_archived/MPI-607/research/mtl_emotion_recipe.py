"""MPI-607 Flow B: does the emotion recipe transfer to the MULTILINGUAL model?

`exaggeration` 1.2 / `cfg_weight` 0.3 is a BASE-model finding (MPI-607: emotion works at
cfg 0.3, the node default 0.5 suppresses it). It has NEVER been swept on
`FL_ChatterboxMultilingualTTS`. The only multilingual value this card has measured is
`repetition_penalty` 1.5.

THE WARNING SIGN THAT PROMPTED THIS: quadrant q4 ran multilingual + an angry performance clip
at exactly 1.2 / 0.3, and Fabio heard no emotion in it.

WHY IT MATTERS NOW: multilingual is no longer an optional accent trick. Fabio's rule is that
it runs for ANY language that is not English -- Portuguese text through the base model is
unusable, through multilingual it is real Brazilian Portuguese. So a PERFORMED read in any
non-English language goes through this model, and it needs its own numbers if the base ones
do not carry.

DO NOT CARRY BASE-MODEL CONSTANTS ACROSS UNCHECKED. That is exactly the error that produced
q3's missing accent: 0.5 was locked for the base model's dictation read and got reused on the
multilingual arm without being re-derived.

THE REAL PRODUCT PATH, not a shortcut: Portuguese text, chain order A (the order that won on
measurement AND ear), so what is judged is what would ship.

    TTS_multilingual(pt, text, ref = R2 angry clip, exag, cfg)  ->  VC(target = R2 voice)

FOUR CELLS plus two controls:

    exag 1.2 x cfg 0.3     the base-model recipe, carried over -- the cell q4 failed on
    exag 1.2 x cfg 0.5     is cfg the problem?
    exag 1.8 x cfg 0.3     does more exaggeration rescue it?
    exag 1.8 x cfg 0.5
    m0  multilingual STRAIGHT (voice as ref, 0.5/0.3)   what neutral Portuguese sounds like
    m1  the base model on the same Portuguese text      Fabio's "sounds like crap" baseline

m1 is not padding: it is the clip that shows WHY multilingual ships, and it keeps the
comparison honest about what "good" means here.

    G:/ComfyUi/python_embeded/python.exe mtl_emotion_recipe.py

Bench on 8188. Six jobs, warm.
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
WORK = Path(r"C:\Users\Fabio\AppData\Local\cubric-vision\mpi607\mtl_emotion")

# The same sentence as the English tests, so duration and delivery stay comparable.
TEXT_PT = "A reuniao comeca as nove, por isso traz o relatorio contigo."
LANGUAGE = "Portuguese (pt)"
VOICE = "standard_male_1.opus"      # R2
EMOTION = "angry"
SEED = 12345
TEMPERATURE = 0.8
REP_PENALTY = 1.5                    # the one multilingual value this card HAS measured


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


def chain(ref, voice, exag, cfg, prefix, multilingual=True):
    """Order A on the real product path: TTS(ref) -> VC(voice)."""
    tts = {"text": TEXT_PT, "exaggeration": exag, "cfg_weight": cfg,
           "temperature": TEMPERATURE, "seed": SEED, "audio_prompt": ["1", 0],
           "keep_model_loaded": True}
    if multilingual:
        tts.update(language=LANGUAGE, repetition_penalty=REP_PENALTY, min_p=0.05, top_p=1.0)
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref}},
        "2": {"class_type": "LoadAudio", "inputs": {"audio": voice}},
        "3": {"class_type": ("FL_ChatterboxMultilingualTTS" if multilingual
                             else "FL_ChatterboxTTS"), "inputs": tts},
        "4": {"class_type": "FL_ChatterboxVC",
              "inputs": {"input_audio": ["3", 0], "target_voice": ["2", 0], "seed": SEED,
                         "use_cpu": False, "keep_model_loaded": True}},
        "5": {"class_type": "SaveAudio",
              "inputs": {"audio": ["4", 0], "filename_prefix": f"mpi607_mtlemo/{prefix}"}},
    }


def straight(voice, prefix, multilingual=True):
    """No performance clip: the voice reads its own line. The neutral referent."""
    tts = {"text": TEXT_PT, "exaggeration": 0.5, "cfg_weight": 0.3,
           "temperature": TEMPERATURE, "seed": SEED, "audio_prompt": ["1", 0],
           "keep_model_loaded": True}
    if multilingual:
        tts.update(language=LANGUAGE, repetition_penalty=REP_PENALTY, min_p=0.05, top_p=1.0)
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": voice}},
        "3": {"class_type": ("FL_ChatterboxMultilingualTTS" if multilingual
                             else "FL_ChatterboxTTS"), "inputs": tts},
        "5": {"class_type": "SaveAudio",
              "inputs": {"audio": ["3", 0], "filename_prefix": f"mpi607_mtlemo/{prefix}"}},
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
            outs = e.get("outputs", {}).get("5", {}).get("audio", [])
            if not outs:
                print(f"  {label}: no audio on node 5")
                return None
            o = outs[0]
            p = out_root / (o.get("subfolder") or "") / o["filename"]
            dst = WORK / f"{label}{p.suffix}"
            shutil.copy2(p, dst)
            y, sr = librosa.load(str(dst), sr=None, mono=True)
            f0, voiced, _ = librosa.pyin(y, sr=sr, fmin=60, fmax=500)
            import numpy as np
            vals = f0[voiced] if voiced is not None else np.array([])
            vals = vals[~np.isnan(vals)] if vals.size else vals
            med = float(np.median(vals)) if vals.size else float("nan")
            return {"label": label, "wall_s": round(time.time() - t0, 1),
                    "dur_s": round(len(y) / sr, 2), "median_f0": round(med, 1),
                    "file": str(dst)}
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

    manifest = json.loads((REPO / "voices" / "manifest.json").read_text(encoding="utf-8"))
    v = next(x for x in manifest["voices"] if x["sample"] == VOICE)
    clip = next(c for c in manifest["performanceClips"]
                if c["register"] == v["register"] and c["emotion"] == EMOTION)

    voice_wav = stage(REPO / "voices" / VOICE, "mpi607_pt_voice.wav")
    perf_wav = stage(REPO / "voices" / clip["clip"], "mpi607_pt_perf.wav")

    print(f"voice {VOICE} ({v['display_name']}, {v['register']}, {v['median_f0']} Hz)")
    print(f"perf  {clip['clip']} ({clip['emotion']}, {clip['median_f0']} Hz)")
    print(f"lang  {LANGUAGE} | rp {REP_PENALTY} | seed {SEED}")
    print(f'text  "{TEXT_PT}"\n')

    jobs = [
        ("m1_base_model_pt", "BASE model on Portuguese - the 'sounds like crap' baseline",
         straight(voice_wav, "m1", multilingual=False)),
        ("m0_mtl_straight", "multilingual, straight read - neutral Portuguese",
         straight(voice_wav, "m0")),
        ("e_ex12_cfg03", "exag 1.2 / cfg 0.3  <- the base recipe, q4's failing cell",
         chain(perf_wav, voice_wav, 1.2, 0.3, "e1")),
        ("e_ex12_cfg05", "exag 1.2 / cfg 0.5", chain(perf_wav, voice_wav, 1.2, 0.5, "e2")),
        ("e_ex18_cfg03", "exag 1.8 / cfg 0.3", chain(perf_wav, voice_wav, 1.8, 0.3, "e3")),
        ("e_ex18_cfg05", "exag 1.8 / cfg 0.5", chain(perf_wav, voice_wav, 1.8, 0.5, "e4")),
    ]

    rows = []
    for label, desc, g in jobs:
        print(f"-> {label}: {desc}")
        r = run(g, label, out_root)
        if r:
            print(f"   wall {r['wall_s']}s | dur {r['dur_s']}s | f0 {r['median_f0']}Hz")
            r["desc"] = desc
            rows.append(r)
        print()

    (WORK / "mtl_emotion.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print("-" * 72)
    for r in rows:
        print(f"{r['label']:<18} {r['dur_s']:>5}s  {r['median_f0']:>6}Hz  {r['desc']}")
    print("-" * 72)
    print(f"clips in {WORK}")
    print("EAR DECIDES whether the anger is there. f0 is a HINT only: an angry read sits")
    print("above its neutral (the R2 grid's angry clip is 167.3 Hz against a 90-130 R1 /")
    print("130-190 R2 band), so a cell level with m0 has probably not carried the emotion.")


if __name__ == "__main__":
    main()
