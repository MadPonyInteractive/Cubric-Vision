"""MPI-607 Flow B: build the Text-to-Speech graph in API format and prove all FOUR quadrants.

THE SHAPE Fabio approved (2026-08-27). Two independent axes, so four routes:

    accent  none | <lang>      picks the MODEL   (base is fast; multilingual imposes an accent)
    emotion none | one of six  picks the REFERENCE and whether stage 2 runs

    accent  emotion   stage 1                          reference        stage 2
    none    none      FL_ChatterboxTTS                 the voice sample   --
    none    set       FL_ChatterboxTTS                 perf clip          VC -> voice
    lang    none      FL_ChatterboxMultilingualTTS     the voice sample   --
    lang    set       FL_ChatterboxMultilingualTTS     perf clip          VC -> voice

Accent picks the MODEL and not a parameter -- Fabio, session 13: unless the user selects an
accent, run the base one, because multilingual is slower. So the fan-out lives in the GRAPH
as `MpiAnySwitch` banks off two `MpiInt`s, which is the playbook's switch-bank pattern
(ui/switch-bank-fields.md) and costs zero app code.

THREE THINGS THIS PROBE EXISTS TO PROVE, none of which can be read off a doc:

1. **`MpiAnySwitch` is LAZY, so the unselected arm never executes.** That is the whole
   design: on the straight route the perf-clip loader is EMPTY and `block_if_empty` would
   fire an ExecutionBlocker, and on the accent route the base model must not load. If lazy
   evaluation does not hold, an empty slot kills a run that should have succeeded.
2. **`MpiAnySwitch`'s `*` output links into typed inputs** -- AUDIO (`audio_prompt`) and
   FLOAT (`exaggeration`). AlwaysEqualProxy should pass ComfyUI's type check; should is not
   a proof.
3. **`language` is a COMBO and REFUSES a link** (measured this session: `received_type(STRING)
   mismatch input_type([...23 entries])`). So the accent literal is BAKED per arm, one
   multilingual node per shipped accent, and the app injects only the selector INT. That is
   also why the accent list is CURATED rather than all 23 -- and it dodges the four languages
   (ja/he/ru/zh) whose tokenizer deps are not in the app's python lock.

`repetition_penalty` is baked at **1.5**, not the node's 2.0: at the default this model fails
to stop on 3 of 6 seeds, running to 11.97s on a 3.90s line with a tail 3x flatter than its
own body. 0/12 failures at 1.5 or 1.2. See validation.md 2026-08-27. It is not a user knob.

    G:/ComfyUi/python_embeded/python.exe flow_b_graph_probe.py [--keep]

Bench on 8188. Four jobs. Writes the candidate API graph beside the results.
"""
import json
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]

import librosa  # noqa: E402
import soundfile as sf  # noqa: E402

BENCH = "http://127.0.0.1:8188"
BENCH_INPUT = Path(r"G:\ComfyUi\ComfyUI\input")
OUT_FALLBACK = Path(r"D:\WORK\Images\Outputs")
WORK = Path(r"C:\Users\Fabio\AppData\Local\cubric-vision\mpi607\flowb")

TEXT = "The meeting starts at nine, so please bring the report with you."
VOICE = "standard_male_1.opus"
ACCENT_LANGUAGE = "French (fr)"   # one arm, to prove the shape; the shipped list is curated
SEED = 12345

# Locked on MPI-607: cfg_weight 0.3 always; exaggeration 0.5 for a straight read and 1.2
# for a clip that will drive VC. Constants live at plain MpiFloat nodes with NON-`Input_`
# titles -- in this codebase `Input_*` means "the app may inject this", and a constant that
# only takes effect on one arm of a switch is a trap that reports nothing when injected.
EXAG_STRAIGHT = 0.5
EXAG_PERF = 1.2
CFG = 0.3
TEMPERATURE = 0.8
REP_PENALTY = 1.5


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


def build(text, voice_path, perf_path, accent_route, emotion_route, seed):
    """The candidate Flow B graph, API format.

    Node ids are stable and the `Input_*` titles are the injection surface:
      Input_Positive       the line (commandExecutor emits this on EVERY run)
      Input_Audio          the performance clip -- EMPTY on a straight read
      Input_Audio_2        the picked voice's sample -- always present
      Input_Seed           the run's seed
      Input_Accent_Route   1 = base model, 2..N = one arm per shipped accent
      Input_Emotion_Route  1 = straight, 2 = perform through VC
    """
    tts_common = {
        "text": ["1", 0], "cfg_weight": CFG, "temperature": TEMPERATURE,
        "seed": ["4", 0], "audio_prompt": ["7", 0], "exaggeration": ["10", 0],
        "keep_model_loaded": False,
    }
    return {
        "1": {"class_type": "MpiString", "inputs": {"string": text},
              "_meta": {"title": "Input_Positive"}},
        # block_if_empty stays TRUE. It is safe precisely because the switch is lazy:
        # on a straight read this arm is never evaluated, so the blocker never fires.
        "2": {"class_type": "MpiLoadAudio",
              "inputs": {"string": perf_path, "block_if_empty": True},
              "_meta": {"title": "Input_Audio"}},
        "3": {"class_type": "MpiLoadAudio",
              "inputs": {"string": voice_path, "block_if_empty": True},
              "_meta": {"title": "Input_Audio_2"}},
        "4": {"class_type": "MpiInt", "inputs": {"int": seed},
              "_meta": {"title": "Input_Seed"}},
        "5": {"class_type": "MpiInt", "inputs": {"int": accent_route},
              "_meta": {"title": "Input_Accent_Route"}},
        "6": {"class_type": "MpiInt", "inputs": {"int": emotion_route},
              "_meta": {"title": "Input_Emotion_Route"}},
        # Straight reads the VOICE's own sample; an emotion reads the performance clip.
        "7": {"class_type": "MpiAnySwitch",
              "inputs": {"select": ["6", 0], "any_1": ["3", 0], "any_2": ["2", 0]},
              "_meta": {"title": "Ref_Select"}},
        "8": {"class_type": "MpiFloat", "inputs": {"float": EXAG_STRAIGHT},
              "_meta": {"title": "Exag_Straight"}},
        "9": {"class_type": "MpiFloat", "inputs": {"float": EXAG_PERF},
              "_meta": {"title": "Exag_Perf"}},
        "10": {"class_type": "MpiAnySwitch",
               "inputs": {"select": ["6", 0], "any_1": ["8", 0], "any_2": ["9", 0]},
               "_meta": {"title": "Exag_Select"}},
        "11": {"class_type": "FL_ChatterboxTTS", "inputs": dict(tts_common),
               "_meta": {"title": "TTS_Base"}},
        "12": {"class_type": "FL_ChatterboxMultilingualTTS",
               "inputs": dict(tts_common, language=ACCENT_LANGUAGE,
                              repetition_penalty=REP_PENALTY, min_p=0.05, top_p=1.0),
               "_meta": {"title": "TTS_Accent_1"}},
        "13": {"class_type": "MpiAnySwitch",
               "inputs": {"select": ["5", 0], "any_1": ["11", 0], "any_2": ["12", 0]},
               "_meta": {"title": "Model_Select"}},
        "14": {"class_type": "FL_ChatterboxVC",
               "inputs": {"input_audio": ["13", 0], "target_voice": ["3", 0],
                          "seed": ["4", 0], "use_cpu": False, "keep_model_loaded": False},
               "_meta": {"title": "VC_Stage"}},
        "15": {"class_type": "MpiAnySwitch",
               "inputs": {"select": ["6", 0], "any_1": ["13", 0], "any_2": ["14", 0]},
               "_meta": {"title": "Out_Select"}},
        "16": {"class_type": "SaveAudio",
               "inputs": {"audio": ["15", 0], "filename_prefix": "audio/TextToSpeech"},
               "_meta": {"title": "Output_Audio"}},
    }


def run(graph, label, out_root, timeout=900):
    t0 = time.time()
    try:
        pid = post("/prompt", {"prompt": graph})["prompt_id"]
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print(f"  {label}: REJECTED AT VALIDATION")
        try:
            j = json.loads(body)
            print(f"    {j.get('error', {}).get('message')}")
            for nid, n in j.get("node_errors", {}).items():
                for d in n.get("errors", []):
                    print(f"    node {nid}: {d.get('message')} :: {d.get('details')}")
        except Exception:
            print(f"    {body[:400]}")
        return None
    while time.time() - t0 < timeout:
        h = get(f"/history/{pid}")
        if pid in h:
            entry = h[pid]
            st = entry.get("status", {})
            wall = time.time() - t0
            if st.get("status_str") == "error":
                print(f"  {label}: RUN ERROR {json.dumps(st)[:400]}")
                return None
            # BY ID. Every loader's preview also lands in `outputs`, so scanning for
            # "the first audio" hands back the INPUT clip (the /history trap on this card).
            outs = entry.get("outputs", {}).get("16", {}).get("audio", [])
            if not outs:
                print(f"  {label}: completed with NO audio on node 16 -- the arm was blocked")
                return None
            o = outs[0]
            p = out_root / (o.get("subfolder") or "") / o["filename"]
            dst = WORK / f"{label}{p.suffix}"
            shutil.copy2(p, dst)
            # Which nodes actually RAN: the proof that the unselected arm stayed cold.
            ran = sorted(entry.get("outputs", {}).keys())
            y, sr = librosa.load(str(dst), sr=None, mono=True)
            return {"label": label, "wall_s": round(wall, 1),
                    "dur_s": round(len(y) / sr, 2), "file": str(dst),
                    "output_nodes": ran}
        time.sleep(1.0)
    print(f"  {label}: TIMED OUT")
    return None


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    try:
        out_root = Path(get("/system_stats").get("system", {}).get("output_directory")
                        or OUT_FALLBACK)
    except Exception as exc:
        sys.exit(f"bench not reachable on {BENCH}: {exc}")

    manifest = json.loads((REPO / "voices" / "manifest.json").read_text(encoding="utf-8"))
    voice = next(v for v in manifest["voices"] if v["sample"] == VOICE)
    reg = voice["register"]
    clip = next(c for c in manifest["performanceClips"]
                if c["register"] == reg and c["emotion"] == "angry")

    voice_wav = stage(REPO / "voices" / VOICE, "mpi607_fb_voice.wav")
    perf_wav = stage(REPO / "voices" / clip["clip"], "mpi607_fb_perf.wav")
    voice_abs = str(BENCH_INPUT / voice_wav)
    perf_abs = str(BENCH_INPUT / perf_wav)

    print(f"voice   {VOICE}  register {reg}  ({voice['display_name']})")
    print(f"perf    {clip['clip']}  ({clip['register']} {clip['emotion']})")
    print(f'text    "{TEXT}"\n')

    quadrants = [
        ("q1_plain",         1, 1, "no accent, no emotion  -> base TTS on the voice"),
        ("q2_emotion",       1, 2, "no accent, ANGRY       -> base TTS on the clip -> VC"),
        ("q3_accent",        2, 1, "FRENCH, no emotion     -> multilingual on the voice"),
        ("q4_accent_emotion", 2, 2, "FRENCH + ANGRY        -> multilingual on the clip -> VC"),
    ]

    (WORK / "candidate_graph.json").write_text(
        json.dumps(build(TEXT, voice_abs, perf_abs, 1, 2, SEED), indent=2), encoding="utf-8")

    results = []
    for label, acc, emo, desc in quadrants:
        print(f"-> {label}: {desc}")
        # The straight arms get an EMPTY performance clip on purpose. That is the lazy-
        # evaluation proof: block_if_empty is armed and must never fire.
        perf = perf_abs if emo == 2 else ""
        r = run(build(TEXT, voice_abs, perf, acc, emo, SEED), label, out_root)
        if r:
            print(f"   OK  wall {r['wall_s']}s | dur {r['dur_s']}s | "
                  f"output nodes {r['output_nodes']}")
            results.append(r)
        else:
            results.append({"label": label, "failed": True})
        print()

    print("-" * 66)
    ok = [r for r in results if not r.get("failed")]
    for r in results:
        if r.get("failed"):
            print(f"{r['label']:<18} FAILED")
        else:
            print(f"{r['label']:<18} {r['wall_s']:>5}s  {r['dur_s']:>5}s")
    print("-" * 66)
    print(f"{len(ok)}/4 quadrants produced audio.")
    (WORK / "quadrants.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"clips + candidate_graph.json in {WORK}")


if __name__ == "__main__":
    main()
