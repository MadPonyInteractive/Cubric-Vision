"""MPI-622 Phase 3: generate the 120 auditions THROUGH THE SHIPPING ROUTE.

    audition_narration  = TTS(text, audio_prompt=<the voice's own sample>, exag 0.5, cfg 0.3)
    audition_character  = VC(input_audio=TTS(text, perf_R<n>_neutral, exag 1.2), target=<sample>)

WHY AN AUDITION IS NOT THE SAMPLE (brief.md § 3). A `character` voice never sounds exactly
like its own sample, because the VC route lands somewhere between the performer and the
target. Playing the raw sample at selection time would promise a voice the product cannot
deliver. The mismatch between these two files IS the feature.

125 JOBS, NOT 185. The character route's TTS half is identical for every voice in a
register - same text, same neutral clip, same params, same seed - so it runs FIVE times
(once per register) and its output is reused as the VC source for all the voices in that
register. Then 60 narration TTS and 60 VC. Deterministic, and it removes 60 redundant TTS
runs from the GPU lease.

INPUTS ARE THE SHIPPED OPUS, decoded to wav - not the pre-encode `lib_v2` wavs. The
audition must be generated from the artifact that actually ships, or it is an audition of
something the user will never hear.

`keep_model_loaded` is FALSE everywhere. `ComfyUI_Fill-ChatterBox` parks models in a
module-level `_MODEL_CACHE` that ComfyUI's `model_management` never sees, so `POST /free`
returns 200 having released nothing and the bench sits on ~4 GB until it is killed
(measured, session 20).

    G:/ComfyUi/python_embeded/python.exe phase3_auditions.py [--only <id,id>] [--install]

Bench must be up on 8188. Run under the GPU lease.
"""
import json
import shutil
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "scripts" / "voice-library"))

import librosa  # noqa: E402
import soundfile as sf  # noqa: E402

from ingest import level_rms, sustained_trim, to_opus  # noqa: E402

BENCH = "http://127.0.0.1:8188"
BENCH_INPUT = Path(r"G:\ComfyUi\ComfyUI\input")
OUT_FALLBACK = Path(r"D:\WORK\Images\Outputs")
WORK = Path(r"C:\Users\Fabio\AppData\Local\cubric-vision\mpi622\auditions")

# ONE short line, the same for all 60, and DELIBERATELY not the library sample text.
#
# Short because a picker plays it inline and nobody auditions sixty twelve-second reads;
# ~3.5 s also keeps 120 clips near D1's size estimate instead of adding 6 MB. Different
# from the sample text because the two files sit next to each other in the record and the
# whole point is to hear the ROUTE differ, which is hard when the words are identical.
# Phonetically spread on purpose: /dZ/ just, /S/ show, /hw/ whole, /tS/ chart, /r/ part,
# /f/ fix - a thin line cannot demonstrate a voice.
AUDITION_TEXT = "Just show me the whole chart, and I'll tell you which part to fix."

# Locked on MPI-607, not tunable here: cfg_weight 0.3 always; exaggeration 0.5 for a
# dictation read and 1.2 for a clip that will drive VC.
EXAG_NARRATION = 0.5
EXAG_VC_SOURCE = 1.2
CFG = 0.3
TEMPERATURE = 0.8


def post(path, payload):
    req = urllib.request.Request(f"{BENCH}{path}", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get(path):
    with urllib.request.urlopen(f"{BENCH}{path}", timeout=60) as r:
        return json.load(r)


def stage(opus_path, name):
    """Decode a shipped opus into the bench input dir as wav, and return the name."""
    y, sr = librosa.load(str(opus_path), sr=None, mono=True)
    sf.write(str(BENCH_INPUT / name), y, sr)
    return name


def tts_graph(ref_name, prefix, seed, exaggeration):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref_name}},
        "2": {"class_type": "FL_ChatterboxTTS",
              "inputs": {"text": AUDITION_TEXT, "exaggeration": exaggeration,
                         "cfg_weight": CFG, "temperature": TEMPERATURE, "seed": seed,
                         "audio_prompt": ["1", 0], "keep_model_loaded": False}},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": f"mpi622_aud/{prefix}"}},
    }


def vc_graph(src_name, tgt_name, prefix, seed):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": src_name}},
        "2": {"class_type": "LoadAudio", "inputs": {"audio": tgt_name}},
        "3": {"class_type": "FL_ChatterboxVC",
              "inputs": {"input_audio": ["1", 0], "target_voice": ["2", 0], "seed": seed,
                         "keep_model_loaded": False}},
        "4": {"class_type": "SaveAudio",
              "inputs": {"audio": ["3", 0], "filename_prefix": f"mpi622_aud/{prefix}"}},
    }


def run(graph, out_node, label, out_root, timeout=900):
    """Queue one graph, wait, copy its audio out. Returns the collected path or None."""
    pid = post("/prompt", {"prompt": graph})["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = get(f"/history/{pid}")
        if pid in h:
            entry = h[pid]
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                print(f"  FAIL {label}: {json.dumps(st)[:300]}")
                return None
            outs = entry.get("outputs", {}).get(out_node, {}).get("audio", [])
            if not outs:
                print(f"  FAIL {label}: completed with no audio on node {out_node}")
                return None
            o = outs[0]
            p = out_root / (o.get("subfolder") or "") / o["filename"]
            if not p.exists():
                print(f"  FAIL {label}: wrote {o['filename']}, not found at {p}")
                return None
            dst = WORK / f"{label}{p.suffix}"
            shutil.copy2(p, dst)
            return dst
        time.sleep(1.5)
    print(f"  FAIL {label}: timed out after {timeout}s")
    return None


def finish(raw_path, opus_path):
    """Trim, level and encode - the same treatment the shipped samples get."""
    y, sr = librosa.load(str(raw_path), sr=None, mono=True)
    y = level_rms(sustained_trim(y, sr))
    staged = raw_path.with_suffix(".lvl.wav")
    sf.write(str(staged), y, sr)
    to_opus(staged, opus_path)
    return len(y) / sr


def main():
    args = sys.argv[1:]
    install = "--install" in args
    only = None
    if "--only" in args:
        only = {s.strip() for s in args[args.index("--only") + 1].split(",")}

    voices_dir = REPO / "voices"
    aud_dir = voices_dir / "audition"
    aud_dir.mkdir(exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((voices_dir / "manifest.json").read_text(encoding="utf-8"))
    voices = [v for v in manifest["voices"] if only is None or v["id"] in only]
    neutral = {c["register"]: c for c in manifest["performanceClips"]
               if c["emotion"] == "neutral"}

    try:
        out_root = Path(get("/system_stats").get("system", {}).get("output_directory")
                        or OUT_FALLBACK)
    except Exception as exc:
        sys.exit(f"bench not reachable on {BENCH}: {exc}")
    print(f"bench output dir: {out_root}\n{len(voices)} voices\n")

    # --- 1. one VC source per register (5 runs, not 60) ------------------------------
    registers = sorted({v["register"] for v in voices})
    vc_source = {}
    for i, reg in enumerate(registers):
        clip = neutral.get(reg)
        if not clip:
            print(f"SKIP register {reg}: no neutral performance clip")
            continue
        ref = stage(voices_dir / clip["clip"], f"mpi622_perf_{reg}_neutral.wav")
        t0 = time.time()
        got = run(tts_graph(ref, f"src_{reg}", 7100 + i, EXAG_VC_SOURCE), "3",
                  f"vcsrc_{reg}", out_root)
        if got:
            vc_source[reg] = stage(got, f"mpi622_vcsrc_{reg}.wav")
            print(f"vc source {reg:<3} {time.time() - t0:5.1f}s")

    # --- 2. per voice: narration TTS, then character VC ------------------------------
    results, failures = {}, []
    for i, v in enumerate(voices):
        vid, reg = v["id"], v["register"]
        sample = stage(voices_dir / v["sample"], f"mpi622_s_{vid}.wav")
        t0 = time.time()
        row = {}

        nar = run(tts_graph(sample, f"nar_{vid}", 7200 + i, EXAG_NARRATION), "3",
                  f"nar_{vid}", out_root)
        if nar:
            row["narration"] = nar

        if reg in vc_source:
            cha = run(vc_graph(vc_source[reg], sample, f"cha_{vid}", 7300 + i), "4",
                      f"cha_{vid}", out_root)
            if cha:
                row["character"] = cha

        if len(row) == 2:
            results[vid] = row
            print(f"{i + 1:>3}/{len(voices)}  {vid:<22} {reg}  {time.time() - t0:5.1f}s")
        else:
            failures.append(vid)
            print(f"{i + 1:>3}/{len(voices)}  {vid:<22} {reg}  INCOMPLETE {list(row)}")

    print(f"\n{len(results)}/{len(voices)} voices got BOTH auditions")
    if failures:
        print(f"{len(failures)} incomplete: {', '.join(failures)}")
    if not install:
        print(f"\nnothing written - raw takes in {WORK}. Re-run with --install.")
        return

    # --- 3. encode + register --------------------------------------------------------
    added = 0
    by_id = {v["id"]: v for v in manifest["voices"]}
    for vid, row in results.items():
        for kind, field in (("narration", "audition_narration"),
                            ("character", "audition_character")):
            rel = f"audition/{vid}_{kind}.opus"
            finish(row[kind], voices_dir / rel)
            by_id[vid][field] = rel
        added += 1
    manifest["auditionText"] = AUDITION_TEXT
    manifest["auditionUpdated"] = date.today().isoformat()
    (voices_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n")

    total = sum(p.stat().st_size for p in aud_dir.glob("*.opus"))
    print(f"installed {added * 2} auditions for {added} voices "
          f"({total / 1e6:.2f} MB in {aud_dir.name}/)")


if __name__ == "__main__":
    main()
