"""MPI-607 emotion, round 2: correct the dial test and try the real production case.

Round 1 findings (Fabio, by ear):
  A  reference emotion transfers but only SLIGHTLY, and sometimes drifts -- cheerful read
     as sarcastic, angry "almost there", sad came out near-neutral.
  B  exaggeration 1.3 was "super fast and a bit mechanical".
  C  emotional text on a neutral reference gave "disappointed / slightly annoyed" and
     "robotic with a hint of disappointment".

B was MIS-PARAMETERISED. The pack's own table calls `cfg_weight` "Pace/classifier-free
guidance", and it was pinned at 0.5 while exaggeration went to 1.3 -- raising exaggeration
speeds delivery up, and cfg_weight is the control that compensates. "Fast and mechanical"
is the documented symptom of exactly that mistake.

So this round drops cfg_weight to 0.3 throughout and sweeps exaggeration against it. The
round-1 A set IS the cfg_weight 0.5 / exaggeration 0.5 baseline to compare against.

It also runs the case never yet tested and the one that actually ships: an EMOTIONAL
reference speaking EMOTIONAL dialogue, instead of one or the other alone.

Run: python emotion_sweep.py   (needs the bench on :8188)
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi607_emotion2"

TEXT_NEUTRAL = ("The train leaves at four. I put your bag by the door and the keys are "
                "on the table.")
TEXT_ANGRY = ("You had one job. One. And you threw it away like it meant nothing to you "
              "at all.")
TEXT_SAD = ("I waited at the station until the last train went. You never came. I "
            "understand now.")

# (slug, ref, text, exaggeration, cfg_weight)
RUNS = [
    # D: does lowering cfg_weight rescue the emotion the A set only hinted at?
    ("D_sad_e05_c03", "e2_sad.wav", TEXT_NEUTRAL, 0.5, 0.3),
    ("D_sad_e08_c03", "e2_sad.wav", TEXT_NEUTRAL, 0.8, 0.3),
    ("D_sad_e12_c03", "e2_sad.wav", TEXT_NEUTRAL, 1.2, 0.3),
    ("D_angry_e08_c03", "e1_angry.wav", TEXT_NEUTRAL, 0.8, 0.3),
    ("D_angry_e12_c03", "e1_angry.wav", TEXT_NEUTRAL, 1.2, 0.3),
    ("D_cheerful_e08_c03", "e3_cheerful.wav", TEXT_NEUTRAL, 0.8, 0.3),
    # E: the production case -- emotional voice AND emotional words together.
    ("E_angry_ref_angry_text", "e1_angry.wav", TEXT_ANGRY, 0.8, 0.3),
    ("E_sad_ref_sad_text", "e2_sad.wav", TEXT_SAD, 0.8, 0.3),
]

SEED = 42


def graph(ref, text, exag, cfg, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref}},
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": {
            "text": text, "exaggeration": exag, "cfg_weight": cfg,
            "temperature": 0.8, "seed": SEED, "audio_prompt": ["1", 0],
            "use_cpu": False, "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": f"{PREFIX}/{slug}"}},
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


def main():
    for slug, ref, text, exag, cfg in RUNS:
        try:
            pid = submit(graph(ref, text, exag, cfg, slug))
            outs, secs = wait(pid)
        except Exception as exc:
            print(f"FAIL {slug}: {exc}")
            continue
        for _ in outs:
            print(f"OK {secs:5.1f}s  {slug:24} exag={exag} cfg={cfg}")


if __name__ == "__main__":
    main()
