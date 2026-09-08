"""MPI-622 Phase 0b: is a PERFORMED high take better or worse than a SHIFTED one?

Phase 0 assumed the offline shift was the only way to reach R3-R5, because "Fabio can only
perform emotion in his own voice". Fabio, 2026-08-25: he can change his voice quite a bit
and has done roleplay in very different characters. Two of those takes are already on disk.

So the shift may not be needed at all, and this decides it head to head. The registers line
up almost exactly, which makes it a controlled comparison rather than two different tests:

  R3   performed `high_pitch_exp_fabio.wav`  230.5 Hz   vs  shifted +12  201.8 Hz
  R4   performed `high_pittch_fabio.wav`     316.7 Hz   vs  shifted +19  305.9 Hz   (11 Hz apart)

Same character, same text, same seed for all four, so the performance clip is the only
variable.

**The R4 pair uses the R3 character** because no R4 character clip exists yet. Both R4 runs
carry the identical mismatch, so it cancels within the pair -- but do not read an R4 run
against an R3 run.

Why the old "do not push" objection does NOT apply here, and why this is worth running:
a pushed take scores 0.38-0.42 against Fabio's own natural voice, which matters in Flow A
(the promise there is converting HIM, so a take that does not encode as him starts the
conversion from the wrong x-vector). In THIS role the clip is a TTS `audio_prompt` and
nothing is trying to sound like Fabio. The measured asymmetry -- performer identity barely
leaks, performer PITCH leaks hard -- says the clip only has to carry emotion and sit in a
register. The one real risk is strain texture (fry, breathiness, wobble) riding through,
which is the same question the shift already passed.

Run under the GPU lease, bench on :8188.
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi622_perf_vs_shift"
SEED = 42
CFG = 0.3
EXAG = 1.2

TEXT = ("The train leaves at four. I put your bag by the door and the keys are on the "
        "table.")

CHARACTER = "lib_f_midage_narration.wav"  # 218.8 Hz, R3

# (slug, performance clip, its median f0)
RUNS = [
    ("R3_performed", "high_pitch_exp_fabio.wav", 230.5),
    ("R3_shifted", "rec003_plus12.wav", 201.8),
    ("R4_performed", "high_pittch_fabio.wav", 316.7),
    ("R4_shifted", "rec003_plus19.wav", 305.9),
]


def graph(perf, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": perf}},
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": {
            "text": TEXT, "exaggeration": EXAG, "cfg_weight": CFG, "temperature": 0.8,
            "seed": SEED, "audio_prompt": ["1", 0], "use_cpu": False,
            "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio", "inputs": {
            "audio": ["2", 0], "filename_prefix": PREFIX + "/TTS_" + slug}},
        "4": {"class_type": "LoadAudio", "inputs": {"audio": CHARACTER}},
        "5": {"class_type": "FL_ChatterboxVC", "inputs": {
            "input_audio": ["2", 0], "target_voice": ["4", 0], "seed": SEED,
            "use_cpu": False, "keep_model_loaded": True}},
        "6": {"class_type": "SaveAudio", "inputs": {
            "audio": ["5", 0], "filename_prefix": PREFIX + "/VC_" + slug}},
    }


def submit(g):
    req = urllib.request.Request(
        HOST + "/prompt", data=json.dumps({"prompt": g}).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))["prompt_id"]


def wait(prompt_id, timeout=1800):
    t0 = time.time()
    while time.time() - t0 < timeout:
        with urllib.request.urlopen(HOST + "/history/" + prompt_id, timeout=30) as r:
            hist = json.loads(r.read().decode("utf-8"))
        if prompt_id in hist:
            st = hist[prompt_id].get("status", {})
            if st.get("status_str") == "error" or not st.get("completed", True):
                raise RuntimeError(json.dumps(st.get("messages", []))[:900])
            return hist[prompt_id], time.time() - t0
        time.sleep(3)
    raise RuntimeError("timed out")


def main():
    for slug, perf, f0 in RUNS:
        try:
            h, secs = wait(submit(graph(perf, slug)))
            n_cached = sum(len(m[1].get("nodes", []))
                           for m in h.get("status", {}).get("messages", [])
                           if m[0] == "execution_cached")
            print("OK %6.1fs  %-14s perf=%-26s %5.1fHz  cached_nodes=%d"
                  % (secs, slug, perf, f0, n_cached))
        except Exception as exc:
            print("FAIL %s: %s" % (slug, exc))


if __name__ == "__main__":
    main()
