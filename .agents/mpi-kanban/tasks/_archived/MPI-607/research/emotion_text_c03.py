"""MPI-607: the cell that decides the library's size -- 60 voices or 300.

cfg_weight 0.3 rescued emotion transfer from an EMOTIONAL reference (round 2, confirmed
by ear). But round 1's text-driven test (C) ran at cfg_weight 0.5, the setting now known
to suppress emotion -- so it was never a fair test either.

If a NEUTRAL reference plus emotional WORDS works at cfg_weight 0.3, the library needs no
per-emotion variants at all: 60 neutral voices, emotion free at runtime from the script.
If it stays flat, emotion must be baked per voice and the library is 60 x N.

Control included: same neutral reference, neutral words, same settings -- so "it sounded
angry" can be told apart from "everything sounds angry at cfg 0.3".

Run: python emotion_text_c03.py   (needs the bench on :8188)
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi607_emotion3"

TEXT_NEUTRAL = ("The train leaves at four. I put your bag by the door and the keys are "
                "on the table.")
TEXT_ANGRY = ("You had one job. One. And you threw it away like it meant nothing to you "
              "at all.")
TEXT_SAD = ("I waited at the station until the last train went. You never came. I "
            "understand now.")

# All from the NEUTRAL reference. Only the words change.
RUNS = [
    ("F_ctl_neutral_text", TEXT_NEUTRAL, 0.5, 0.3),
    ("F_angry_text", TEXT_ANGRY, 0.5, 0.3),
    ("F_sad_text", TEXT_SAD, 0.5, 0.3),
    # same words, more intensity -- can the dial amplify text-driven emotion?
    ("F_angry_text_e10", TEXT_ANGRY, 1.0, 0.3),
    ("F_sad_text_e10", TEXT_SAD, 1.0, 0.3),
]

REF = "e0_neutral.wav"
SEED = 42


def graph(text, exag, cfg, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": REF}},
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
    for slug, text, exag, cfg in RUNS:
        try:
            pid = submit(graph(text, exag, cfg, slug))
            outs, secs = wait(pid)
        except Exception as exc:
            print(f"FAIL {slug}: {exc}")
            continue
        for _ in outs:
            print(f"OK {secs:5.1f}s  {slug:22} exag={exag} cfg={cfg}")


if __name__ == "__main__":
    main()
