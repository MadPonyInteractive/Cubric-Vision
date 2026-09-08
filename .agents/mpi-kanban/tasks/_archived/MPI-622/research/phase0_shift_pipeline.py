"""MPI-622 Phase 0: can an OFFLINE formant-preserving pitch shift supply the
performance clips for registers Fabio cannot perform in?

Fabio can only perform emotion in his own voice (~100 Hz, R1). A LIVE voice changer is
settled as not the answer -- it fights the pitch while the voice is being produced, and
pitch is what emotion rides on. An offline shift is a different thing: it operates on an
already-emotional recording, so the contour is shifted intact.

Two questions, which fail differently:
  (a) does the shifted clip still read as genuinely angry?      <- needs an ANGRY source
  (b) do chipmunk/formant artefacts ride through the VC stage?  <- any natural source does

This script answers (b). Each run drives the shipping route with the shifted clip as the
performance reference:

    stage 1  FL_ChatterboxTTS(text, audio_prompt=<shifted perf clip>, exag 1.2, cfg 0.3)
    stage 2  FL_ChatterboxVC(input_audio=stage 1, target_voice=<matched-register character>)

Both stages are saved so a shift artefact can be traced to the stage that introduced it.

The +0 CONTROL is load-bearing: without it there is no way to tell a shift artefact from
one the pipeline always produces.

Run under the GPU lease, bench on :8188:
  python <mpi-lib>/scripts/gpu_lease.py run -- G:/ComfyUi/python_embeded/python.exe phase0_shift_pipeline.py
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi622_shift"
SEED = 42
CFG = 0.3      # the only setting that lets emotion through at all
EXAG = 1.2     # the VC-source setting (0.5 is for direct dictation)

# Neutral text on purpose. Text CANNOT select emotion (measured 2026-08-25: angry words
# at exag 1.0 read as disappointed), so an emotional script would only add a confound.
TEXT = ("The train leaves at four. I put your bag by the door and the keys are on the "
        "table.")

# (slug, performance clip, its median f0, character clip, its median f0)
# Registers are MATCHED -- performer pitch leaks hard, so a mismatched pair would be
# measuring the mismatch rather than the shift.
RUNS = [
    ("ctrl_R1_plus0", "recording_003.wav", 101.5,
     "A3_REF_senior_male_gravel_character.wav", 125.7),
    ("shift_R2_plus7", "rec003_plus7.wav", 150.3,
     "vd_midage_female_uk_narration.wav", 138.6),
    ("shift_R3_plus12", "rec003_plus12.wav", 201.8,
     "lib_f_midage_narration.wav", 218.8),
]


def graph(perf, char, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": perf}},
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": {
            "text": TEXT, "exaggeration": EXAG, "cfg_weight": CFG, "temperature": 0.8,
            "seed": SEED, "audio_prompt": ["1", 0], "use_cpu": False,
            "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio", "inputs": {
            "audio": ["2", 0], "filename_prefix": PREFIX + "/TTS_" + slug}},
        "4": {"class_type": "LoadAudio", "inputs": {"audio": char}},
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
            cached = st.get("status_str"), hist[prompt_id].get("status", {})
            return hist[prompt_id], time.time() - t0
        time.sleep(3)
    raise RuntimeError("timed out")


def main():
    for slug, perf, pf0, char, cf0 in RUNS:
        try:
            h, secs = wait(submit(graph(perf, char, slug)))
            cached = h.get("status", {}).get("messages", [])
            n_cached = sum(len(m[1].get("nodes", [])) for m in cached
                           if m[0] == "execution_cached")
            print("OK %6.1fs  %-18s perf=%-24s %5.1fHz -> char %5.1fHz  cached_nodes=%d"
                  % (secs, slug, perf, pf0, cf0, n_cached))
        except Exception as exc:
            print("FAIL %s: %s" % (slug, exc))


if __name__ == "__main__":
    main()
