"""MPI-622 Phase 0c: does ANGER survive an offline pitch shift, and is a shifted angry
take better or worse than a natively performed one at the same pitch?

Fabio supplied three angry takes (2026-08-25). Measured:

    recording_008   136.3 Hz  R2   13.62 s   32.3% voiced
    recording_009   166.8 Hz  R2    8.76 s   21.4% voiced
    recording_010   274.1 Hz  R4    7.08 s   40.2% voiced   <- angry, natively in R4

`recording_010` alone contradicts the premise Phase 0 was written on ("the only emotional
performance I can do is with my own voice", ~100 Hz R1). He reached R4 angry, unaided.

The gift in the numbers: shifting `recording_008` up **+12 semitones lands on 272.6 Hz**,
**1.5 Hz** from `recording_010`'s 274.1. Same speaker, same emotion, same register, one
shifted and one performed. That is as controlled as this comparison can get.

Runs (same character, same text, same seed -- the performance clip is the only variable):

    angry_R2_plus0      recording_008 unshifted    136.3 Hz   control: does anger survive
                                                              the pipeline AT ALL
    angry_R4_shift12    recording_008 +12          272.6 Hz   the shifted arm
    angry_R4_performed  recording_010              274.1 Hz   the performed arm, 1.5 Hz away
    angry_R5_shift19    recording_008 +19          409.4 Hz   how far the shift stretches

The text is deliberately the same NEUTRAL line every run on this card has used. Text cannot
select emotion (measured on MPI-607), so a neutral line delivered angrily is unambiguous
evidence that the clip carried it -- and it keeps every run on both cards comparable.

## The confound Fabio flagged, and why the runs are split into two chains

**Recordings 008 and 009 went through his AI noise-cancellation filter. 010 did not.** So
the 1.5 Hz pair above is NOT controlled after all: `rec008_plus12` is denoised-and-shifted
while `recording_010` is raw-and-performed, and any difference could be either variable.
Read across the chains and you get a confident wrong answer.

The runs are therefore grouped so each chain is clean within itself:

  DENOISED chain, all from 008:  plus0 (136.3) / +12 (277.3) / +19 (399.0)
      -> answers (a): does anger survive the shift, and how far can it stretch
  RAW chain, all from 010:       plus0 (274.1) / -12 (137.1)
      -> the same question on an unfiltered recording, and the only test of a DOWNWARD
         shift so far. Every shift before this one went up.

Cross-chain comparison is only ever suggestive. A properly controlled performed-vs-shifted
answer needs one more take: an angry line at his natural pitch recorded RAW.

Run under the GPU lease, bench on :8188.
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi622_angry"
SEED = 42
CFG = 0.3
EXAG = 1.2

TEXT = ("The train leaves at four. I put your bag by the door and the keys are on the "
        "table.")

CHARACTER = "lib_f_midage_narration.wav"  # 218.8 Hz, R3 -- same as Phase 0b

RUNS = [
    # --- the DENOISED chain (recording_008), clean within itself ---
    ("angry_R2_plus0", "recording_008.wav", 136.3),
    ("angry_R4_shift12", "rec008_plus12.wav", 277.3),
    ("angry_R5_shift19", "rec008_plus19.wav", 399.0),
    # --- the RAW chain (recording_010), clean within itself ---
    ("angry_R4_performed", "recording_010.wav", 274.1),
    ("angry_R2_shiftdown12", "rec010_minus12.wav", 137.1),
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
            print("OK %6.1fs  %-20s perf=%-22s %5.1fHz  cached_nodes=%d"
                  % (secs, slug, perf, f0, n_cached))
        except Exception as exc:
            print("FAIL %s: %s" % (slug, exc))


if __name__ == "__main__":
    main()
