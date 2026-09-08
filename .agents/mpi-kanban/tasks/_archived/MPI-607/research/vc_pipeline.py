"""MPI-607: can Chatterbox VC carry a PERFORMANCE onto a character's voice?

If yes, the library collapses. Instead of every character needing a clip per emotion, we
ship ONE neutral clip per character plus a handful of emotional performance clips shared
across all of them:

    stage 1  FL_ChatterboxTTS(user's text, audio_prompt=<emotional performer>)
             -> the right emotion, in the performer's voice
    stage 2  FL_ChatterboxVC(input_audio=stage 1, target_voice=<character clip>)
             -> the same performance, in the character's voice

60 neutral clips + ~5 performance clips, instead of 60 x 5.

Both stages are saved, so the performance can be heard before and after conversion.

Two things get judged:
  IDENTITY  measured, not heard -- cosine of the output against the character's own clip,
            using Chatterbox's CAMPPlus encoder (speaker_similarity.py).
  EMOTION   Fabio's ear -- does the anger/sadness survive the conversion?

Controls:
  `ctl_vc_neutral`  a neutral performance through VC -- shows what VC costs identity-wise
                    when there is no emotion to preserve.
  `ctl_direct_*`    plain TTS straight from the character clip, no VC -- what we would
                    ship WITHOUT this pipeline, for comparison.

Run: python vc_pipeline.py   (needs the bench on :8188)
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi607_vc"

# Round 2 (`push` mode). Round 1 verdict: identity survives VC (0.78-0.83, level with
# no-VC) and VC sounds MORE natural than direct -- but emotion is attenuated, "vc_angry
# sounds more disappointed than angry". Round 1 fed VC an exaggeration-0.8 performance.
# Since anger was measured to keep strengthening at 1.2, the test is whether VC's
# attenuation can simply be pre-compensated by driving the performance harder.
# The PERF_ clip is saved for each so the drop across conversion can be judged directly.

CHARACTER = "vB_neutral.wav"  # identity that held across emotions (0.68-0.88)

TEXT_NEUTRAL = ("The train leaves at four. I put your bag by the door and the keys are "
                "on the table.")
TEXT_ANGRY = ("You had one job. One. And you threw it away like it meant nothing to you "
              "at all.")
TEXT_SAD = ("I waited at the station until the last train went. You never came. I "
            "understand now.")

# (slug, performer_ref, text, exaggeration)
VC_RUNS = [
    ("vc_angry", "e1_angry.wav", TEXT_ANGRY, 0.8),
    ("vc_sad", "e2_sad.wav", TEXT_SAD, 0.5),
    ("vc_cheerful", "e3_cheerful.wav", TEXT_NEUTRAL, 0.8),
    ("ctl_vc_neutral", "e0_neutral.wav", TEXT_NEUTRAL, 0.5),
]

# no VC -- straight from the character clip
DIRECT_RUNS = [
    ("ctl_direct_angry", TEXT_ANGRY, 0.8),
    ("ctl_direct_neutral", TEXT_NEUTRAL, 0.5),
]

SEED = 42
CFG = 0.3  # the setting that lets emotion through at all


def graph_vc(performer, text, exag, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": performer}},
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": {
            "text": text, "exaggeration": exag, "cfg_weight": CFG, "temperature": 0.8,
            "seed": SEED, "audio_prompt": ["1", 0], "use_cpu": False,
            "keep_model_loaded": True}},
        # stage 1 kept so the performance can be heard pre-conversion
        "3": {"class_type": "SaveAudio", "inputs": {
            "audio": ["2", 0], "filename_prefix": f"{PREFIX}/PERF_{slug}"}},
        "4": {"class_type": "LoadAudio", "inputs": {"audio": CHARACTER}},
        "5": {"class_type": "FL_ChatterboxVC", "inputs": {
            "input_audio": ["2", 0], "target_voice": ["4", 0], "seed": SEED,
            "use_cpu": False, "keep_model_loaded": True}},
        "6": {"class_type": "SaveAudio", "inputs": {
            "audio": ["5", 0], "filename_prefix": f"{PREFIX}/{slug}"}},
    }


def graph_direct(text, exag, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": CHARACTER}},
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": {
            "text": text, "exaggeration": exag, "cfg_weight": CFG, "temperature": 0.8,
            "seed": SEED, "audio_prompt": ["1", 0], "use_cpu": False,
            "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio", "inputs": {
            "audio": ["2", 0], "filename_prefix": f"{PREFIX}/{slug}"}},
    }


def submit(g):
    req = urllib.request.Request(
        f"{HOST}/prompt", data=json.dumps({"prompt": g}).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))["prompt_id"]


def wait(prompt_id, timeout=1800):
    t0 = time.time()
    while time.time() - t0 < timeout:
        with urllib.request.urlopen(f"{HOST}/history/{prompt_id}", timeout=30) as r:
            hist = json.loads(r.read().decode("utf-8"))
        if prompt_id in hist:
            st = hist[prompt_id].get("status", {})
            if st.get("status_str") == "error" or not st.get("completed", True):
                raise RuntimeError(json.dumps(st.get("messages", []))[:900])
            outs = []
            for node in hist[prompt_id].get("outputs", {}).values():
                outs.extend(node.get("audio", []))
            return outs, time.time() - t0
        time.sleep(3)
    raise RuntimeError("timed out")


PUSH_RUNS = [
    ("push_angry_e12", "e1_angry.wav", TEXT_ANGRY, 1.2),
    ("push_angry_e15", "e1_angry.wav", TEXT_ANGRY, 1.5),
    ("push_angry_e20", "e1_angry.wav", TEXT_ANGRY, 2.0),
    ("push_sad_e12", "e2_sad.wav", TEXT_SAD, 1.2),
]


def main():
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "push":
        globals()["PREFIX"] = "mpi607_vc2"
        for slug, performer, text, exag in PUSH_RUNS:
            try:
                _, secs = wait(submit(graph_vc(performer, text, exag, slug)))
                print(f"OK {secs:6.1f}s  {slug:20} exag={exag}")
            except Exception as exc:
                print(f"FAIL {slug}: {exc}")
        return
    for slug, performer, text, exag in VC_RUNS:
        try:
            outs, secs = wait(submit(graph_vc(performer, text, exag, slug)))
            print(f"OK {secs:6.1f}s  {slug:20} perf={performer}")
        except Exception as exc:
            print(f"FAIL {slug}: {exc}")
    for slug, text, exag in DIRECT_RUNS:
        try:
            outs, secs = wait(submit(graph_direct(text, exag, slug)))
            print(f"OK {secs:6.1f}s  {slug:20} (no VC)")
        except Exception as exc:
            print(f"FAIL {slug}: {exc}")


if __name__ == "__main__":
    main()
