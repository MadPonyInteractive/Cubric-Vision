"""MPI-607 Flow B gate: does `repetition_penalty` explain the multilingual trailing noise?

THE DEFECT (session 13, Fabio): the multilingual model *"most times comes out with a few
extra seconds with some noise"*, and it is slow -- 22-30s of wall clock for a ~12-word
line. Two symptoms, and the card argued they were ONE cause.

THE SUSPECT: `repetition_penalty` exists ONLY on `FL_ChatterboxMultilingualTTS`.
`mtl_tts.py:293` defaults it to 2.0 and the node matches. Plain `tts.py` has no such
parameter at all -- and plain TTS does not do this. An aggressive penalty distorts the
distribution near the end of an utterance so the model never lands a confident stop token
and keeps decoding until the cap.

THIS GATES THE ACCENT HALF OF FLOW B AND NOTHING ELSE. Accent picks the MODEL, not a
parameter (Fabio, session 13: unless the user selects an accent, run the base model), so
the fast default path never touches this.

--------------------------------------------------------------------------------
TWO MEASUREMENT TRAPS, BOTH HIT ON THE FIRST RUN (2026-08-27). Read before editing.

1. A COLD RUN CANNOT TIME ANYTHING. With `keep_model_loaded: False` every job reloads ~3GB
   from disk, so the first pass measured 24.4s for the BASE model and 23.2s for
   multilingual -- indistinguishable, and both of them almost entirely load. The "slow"
   half of the complaint is model LOAD, not decoding, and it is not multilingual-specific.
   `--warm` keeps the model resident so the wall clock is generation.

2. A SILENCE TRIM CANNOT SEE TRAILING NOISE. The first pass measured the tail with the
   `sustained_trim` rule and reported 0.00s for the very job that overshot -- because
   NOISE HAS ENERGY, so an energy trim files it as speech. Same class of error as
   MPI-622's `trim(top_db=35)` finding, one layer up. What separates noise from speech is
   SPECTRAL FLATNESS: noise is flat across the spectrum, voiced speech is peaky. So the
   tail is judged on flatness, and DURATION against the base model is the primary number.

--------------------------------------------------------------------------------
THE DESIGN. Text and reference are FIXED; seed and repetition_penalty vary.

    base      plain FL_ChatterboxTTS, N seeds  -- the duration REFERENCE for this line
    mtl fr    multilingual, French, rp 2.0 / 1.5 / 1.2, the same N seeds

One seed is a lottery -- this card has already logged flat spanning 2.5-8.5 st across eight
identical generations -- so the verdict is the MEDIAN over seeds, never a single run.
English text throughout: the product case is an English line read with a foreign accent,
not a translation.

    G:/ComfyUi/python_embeded/python.exe mtl_repetition_sweep.py --warm --seeds 3

`--warm` parks ~4GB in the pack's module-level `_MODEL_CACHE`, which ComfyUI's
`model_management` never sees, so `POST /free` returns 200 having released nothing. The
bench holds that memory until it is restarted. Deliberate for a timing run; say so.
"""
import json
import shutil
import statistics
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]

import librosa  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

BENCH = "http://127.0.0.1:8188"
BENCH_INPUT = Path(r"G:\ComfyUi\ComfyUI\input")
OUT_FALLBACK = Path(r"D:\WORK\Images\Outputs")
WORK = Path(r"C:\Users\Fabio\AppData\Local\cubric-vision\mpi607\mtl_sweep")

# 12 words, matching the reported symptom's shape. Ordinary sentence, no rare phonemes --
# the question is whether decoding STOPS, not whether the voice is good.
TEXT = "The meeting starts at nine, so please bring the report with you."

REF_VOICE = "standard_male_1.opus"   # a shipped library sample, decoded to wav below
LANGUAGE = "French (fr)"
SEEDS = [12345, 777, 20260827, 4242, 90210, 1301]
PENALTIES = [2.0, 1.5, 1.2]
EXAG = 0.5      # the narration recipe (MPI-607, locked)
CFG = 0.3
TEMPERATURE = 0.8
MIN_P = 0.05    # node defaults, held fixed -- only repetition_penalty moves
TOP_P = 1.0


def post(path, payload):
    req = urllib.request.Request(f"{BENCH}{path}", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get(path):
    with urllib.request.urlopen(f"{BENCH}{path}", timeout=60) as r:
        return json.load(r)


def stage(opus_path, name):
    """Decode a shipped opus into the bench input dir as wav. The shipped artifact is the
    right input: a reference the user never hears is a test of the wrong thing."""
    y, sr = librosa.load(str(opus_path), sr=None, mono=True)
    sf.write(str(BENCH_INPUT / name), y, sr)
    return name


def base_graph(ref_name, prefix, seed, warm):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref_name}},
        "2": {"class_type": "FL_ChatterboxTTS",
              "inputs": {"text": TEXT, "exaggeration": EXAG, "cfg_weight": CFG,
                         "temperature": TEMPERATURE, "seed": seed,
                         "audio_prompt": ["1", 0], "keep_model_loaded": warm}},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": f"mpi607_mtl/{prefix}"}},
    }


def mtl_graph(ref_name, prefix, seed, rep_penalty, warm):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref_name}},
        "2": {"class_type": "FL_ChatterboxMultilingualTTS",
              "inputs": {"text": TEXT, "language": LANGUAGE, "exaggeration": EXAG,
                         "cfg_weight": CFG, "temperature": TEMPERATURE,
                         "repetition_penalty": rep_penalty, "min_p": MIN_P, "top_p": TOP_P,
                         "seed": seed, "audio_prompt": ["1", 0],
                         "keep_model_loaded": warm}},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": f"mpi607_mtl/{prefix}"}},
    }


def run(graph, label, out_root, timeout=900):
    """Queue one graph, wait, copy its audio out. Returns (path, wall_seconds)."""
    t0 = time.time()
    pid = post("/prompt", {"prompt": graph})["prompt_id"]
    while time.time() - t0 < timeout:
        h = get(f"/history/{pid}")
        if pid in h:
            wall = time.time() - t0
            entry = h[pid]
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                print(f"  FAIL {label}: {json.dumps(st)[:300]}")
                return None, wall
            # Fetch the capture node BY ID: every loader's preview also lands in `outputs`,
            # so scanning for "the first audio" returns the INPUT clip (MPI-607 /history trap).
            outs = entry.get("outputs", {}).get("3", {}).get("audio", [])
            if not outs:
                print(f"  FAIL {label}: completed with no audio on node 3")
                return None, wall
            o = outs[0]
            p = out_root / (o.get("subfolder") or "") / o["filename"]
            if not p.exists():
                print(f"  FAIL {label}: wrote {o['filename']}, not found at {p}")
                return None, wall
            dst = WORK / f"{label}{p.suffix}"
            shutil.copy2(p, dst)
            return dst, wall
        time.sleep(1.0)
    print(f"  FAIL {label}: timed out after {timeout}s")
    return None, time.time() - t0


def measure(path, tail_s=1.0):
    """Duration, plus what the last `tail_s` actually CONTAINS.

    `flat_tail` / `flat_mid` are spectral flatness (Wiener entropy): ~1.0 for white noise,
    low for voiced speech. The ratio is the discriminator -- a tail that is babble or hiss
    reads much flatter than the body of the same clip, while a tail that is simply more
    speech reads about the same. `voiced_tail` is the pyin cross-check: real speech in the
    tail is voiced, noise is not.
    """
    y, sr = librosa.load(str(path), sr=None, mono=True)
    total = len(y) / sr
    n = int(min(tail_s, total / 2) * sr)
    tail, mid = y[-n:], y[:-n]
    flat_tail = float(np.mean(librosa.feature.spectral_flatness(y=tail)))
    flat_mid = float(np.mean(librosa.feature.spectral_flatness(y=mid))) if mid.size else 0.0
    try:
        f0, voiced, _ = librosa.pyin(tail, sr=sr, fmin=60, fmax=500)
        voiced_frac = float(np.mean(voiced)) if voiced is not None else 0.0
    except Exception:
        voiced_frac = float("nan")
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    return {"total_s": round(total, 2),
            "flat_tail": round(flat_tail, 4), "flat_mid": round(flat_mid, 4),
            "flat_ratio": round(flat_tail / flat_mid, 2) if flat_mid > 1e-9 else None,
            "voiced_tail": round(voiced_frac, 2),
            "peak_dbfs": round(20 * np.log10(peak) if peak > 1e-9 else -120.0, 1)}


def main():
    args = sys.argv[1:]
    warm = "--warm" in args
    seeds = SEEDS
    if "--seeds" in args:
        seeds = SEEDS[:int(args[args.index("--seeds") + 1])]

    WORK.mkdir(parents=True, exist_ok=True)
    try:
        out_root = Path(get("/system_stats").get("system", {}).get("output_directory")
                        or OUT_FALLBACK)
    except Exception as exc:
        sys.exit(f"bench not reachable on {BENCH}: {exc}")

    ref = REPO / "voices" / REF_VOICE
    if not ref.exists():
        sys.exit(f"reference not found: {ref}")
    ref_name = stage(ref, "mpi607_sweep_ref.wav")
    print(f"bench output dir: {out_root}")
    print(f"reference: {REF_VOICE} | language: {LANGUAGE}")
    print(f'text ({len(TEXT.split())} words): "{TEXT}"')
    print(f"seeds {seeds} | keep_model_loaded={warm}\n")

    jobs = []
    for s in seeds:
        jobs.append((f"base_s{s}", "base", None, base_graph(ref_name, f"base_s{s}", s, warm)))
    for rp in PENALTIES:
        tag = str(rp).replace(".", "")
        for s in seeds:
            jobs.append((f"mtl_rp{tag}_s{s}", "mtl", rp,
                         mtl_graph(ref_name, f"mtl_rp{tag}_s{s}", s, rp, warm)))

    rows = []
    for label, kind, rp, graph in jobs:
        path, wall = run(graph, label, out_root)
        if path is None:
            rows.append({"label": label, "kind": kind, "rp": rp,
                         "wall_s": round(wall, 1), "error": True})
            continue
        m = measure(path)
        m.update({"label": label, "kind": kind, "rp": rp, "wall_s": round(wall, 1),
                  "file": str(path)})
        rows.append(m)
        print(f"{label:<20} wall {m['wall_s']:>5}s | dur {m['total_s']:>5}s | "
              f"flat {m['flat_tail']:.4f} vs {m['flat_mid']:.4f} (x{m['flat_ratio']}) | "
              f"voiced {m['voiced_tail']}")

    ok = [r for r in rows if not r.get("error")]
    base = [r for r in ok if r["kind"] == "base"]
    base_med = statistics.median([r["total_s"] for r in base]) if base else None

    print("\n" + "-" * 74)
    print(f"{'group':<12} {'n':>2} {'med dur':>9} {'vs base':>9} {'med wall':>9} {'med flat x':>11}")
    print("-" * 74)

    def line(name, rs):
        if not rs:
            return
        d = statistics.median([r["total_s"] for r in rs])
        w = statistics.median([r["wall_s"] for r in rs])
        fr = [r["flat_ratio"] for r in rs if r["flat_ratio"] is not None]
        f = statistics.median(fr) if fr else float("nan")
        rel = f"{d - base_med:+.2f}s" if base_med is not None else "n/a"
        print(f"{name:<12} {len(rs):>2} {d:>8.2f}s {rel:>9} {w:>8.1f}s {f:>10.2f}x")

    line("base", base)
    for rp in PENALTIES:
        line(f"mtl rp {rp}", [r for r in ok if r["kind"] == "mtl" and r["rp"] == rp])

    (WORK / "sweep_warm.json" if warm else WORK / "sweep_cold.json").write_text(
        json.dumps(rows, indent=2), encoding="utf-8")
    print(f"\nclips in {WORK}")
    print("DURATION vs base is the verdict. Flatness says WHAT the tail holds; the ear "
          "says whether it is audible. Neither replaces the other.")
    if warm:
        print("NOTE: --warm left ~4GB in the pack's module-level cache. POST /free will not "
              "release it; the bench holds it until restarted.")


if __name__ == "__main__":
    main()
