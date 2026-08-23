"""MPI-607 emotion transfer, stage 2: where does Chatterbox's emotion actually come from?

Three candidate sources, isolated against each other:

  A. THE REFERENCE  -- five refs differing only in emotion, all cloned onto the SAME
                       emotionally-blank target text. Any emotion heard came from the ref.
  B. THE DIAL       -- the neutral ref cloned onto that same blank text at exaggeration
                       0.5 vs 1.3. Shows what the dial buys with no emotional ref.
  C. THE TEXT       -- the NEUTRAL ref cloned onto angry and sad text (Fabio's
                       suggestion). If output emotion follows the words, the library
                       needs far fewer emotional references.

Whichever source dominates decides the library's size: 60 voices, or 60 x 5 = 300.

Run: python emotion_clone_stage2.py   (needs the bench on :8188)
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi607_emotion"

# Emotionally BLANK -- carries no anger, sadness or cheer of its own.
TEXT_NEUTRAL = ("The train leaves at four. I put your bag by the door and the keys are "
                "on the table.")
TEXT_ANGRY = ("You had one job. One. And you threw it away like it meant nothing to you "
              "at all.")
TEXT_SAD = ("I waited at the station until the last train went. You never came. I "
            "understand now.")

EMO_REFS = ["e0_neutral.wav", "e1_angry.wav", "e2_sad.wav", "e3_cheerful.wav",
            "e4_whisper.wav"]

# (label, ref_wav, text, exaggeration, out_slug)
RUNS = (
    [(f"A: ref {r} -> blank text", r, TEXT_NEUTRAL, 0.5, f"A_from_{r[:-4]}")
     for r in EMO_REFS]
    + [("B: neutral ref, dial 1.3", "e0_neutral.wav", TEXT_NEUTRAL, 1.3, "B_dial_1p3")]
    + [("C: neutral ref, ANGRY text", "e0_neutral.wav", TEXT_ANGRY, 0.5, "C_text_angry"),
       ("C: neutral ref, SAD text", "e0_neutral.wav", TEXT_SAD, 0.5, "C_text_sad")]
)

SEED = 42


def graph(ref_wav, text, exaggeration, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref_wav}},
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": {
            "text": text, "exaggeration": exaggeration, "cfg_weight": 0.5,
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
            entry = hist[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error" or not status.get("completed", True):
                raise RuntimeError(json.dumps(status.get("messages", []))[:900])
            outs = []
            for node in entry.get("outputs", {}).values():
                outs.extend(node.get("audio", []))
            return outs, time.time() - t0
        time.sleep(3)
    raise RuntimeError("timed out")


def main():
    for label, ref, text, exag, slug in RUNS:
        try:
            pid = submit(graph(ref, text, exag, slug))
            outs, secs = wait(pid)
        except Exception as exc:
            print(f"FAIL {slug}: {exc}")
            continue
        for o in outs:
            print(f"OK {secs:5.1f}s  {slug:22} <- {label}")


if __name__ == "__main__":
    main()
