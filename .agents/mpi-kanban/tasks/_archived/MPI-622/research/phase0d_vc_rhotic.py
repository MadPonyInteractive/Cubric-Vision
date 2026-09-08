"""MPI-622 Phase 0d: WHY does the VC stage eat R's, and when?

Fabio isolated it (2026-08-25): the character clip is clean, the TTS stage is clean, and
"train" becomes "twain" only AFTER `FL_ChatterboxVC`. **VC introduces a phoneme-level defect
that neither of its inputs has.** That is not the "lands halfway" behaviour already recorded
on MPI-607 -- it is corruption, and it hits Flow A, which ships today.

It appeared in exactly one of the five Phase 0c runs. What is unique about that one:

    run              TTS src f0    character    direction VC had to move
    D  +19              383.2        218.8       down
    E  performed        290.4        218.8       down
    F  +0               206.5        218.8       UP     <- the broken one, and the ONLY
    G  -12              229.2        218.8       down      source sitting BELOW the target
    H  +12              365.9        218.8       down

F is the only arm whose source pitch was BELOW the target voice's. Hypothesis: **VC damages
consonants when it has to raise pitch to reach the target.** That would also give guidance
rule 3 ("meet the target's pitch") a mechanism it currently lacks, and an asymmetry -- being
under the target would be worse than being over it.

This isolates VC completely by removing the TTS stage as a variable: every arm feeds VC the
SAME TTS output, pitch-shifted to a different distance from the character. Nothing else
differs, so anything heard is the VC stage responding to source-vs-target pitch.

    arm     source f0   vs character 218.8 Hz
    plus0     206.5      -1.0 st   <- the known-broken reference, unshifted
    minus4    163.9      -4.9 st   further below
    plus2     231.8      +1.0 st   just above
    plus4     260.1      +3.2 st   above
    plus7     309.2      +5.9 st   well above

`plus0` is deliberately left unshifted so the shifter cannot be blamed for the known result.
If `minus4` breaks and `plus2/4/7` do not, the hypothesis holds and the shifter is innocent.
If everything except `plus0` is clean, the shift itself is doing something and this is a
different investigation.

Run under the GPU lease, bench on :8188.
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi622_rhotic"
SEED = 42

CHARACTER = "lib_f_midage_narration.wav"  # 218.8 Hz

# (slug, already-staged source clip in the bench input dir, its median f0)
RUNS = [
    ("plus0", "rho_src_plus0.wav", 206.5),
    ("minus4", "rho_src_minus4.wav", 163.9),
    ("plus2", "rho_src_plus2.wav", 231.8),
    ("plus4", "rho_src_plus4.wav", 260.1),
    ("plus7", "rho_src_plus7.wav", 309.2),
]


def graph(src, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": src}},
        "2": {"class_type": "LoadAudio", "inputs": {"audio": CHARACTER}},
        "3": {"class_type": "FL_ChatterboxVC", "inputs": {
            "input_audio": ["1", 0], "target_voice": ["2", 0], "seed": SEED,
            "use_cpu": False, "keep_model_loaded": True}},
        "4": {"class_type": "SaveAudio", "inputs": {
            "audio": ["3", 0], "filename_prefix": PREFIX + "/VC_" + slug}},
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
    for slug, src, f0 in RUNS:
        try:
            h, secs = wait(submit(graph(src, slug)))
            n_cached = sum(len(m[1].get("nodes", []))
                           for m in h.get("status", {}).get("messages", [])
                           if m[0] == "execution_cached")
            print("OK %6.1fs  %-8s src=%-22s %5.1fHz  cached_nodes=%d"
                  % (secs, slug, src, f0, n_cached))
        except Exception as exc:
            print("FAIL %s: %s" % (slug, exc))


if __name__ == "__main__":
    main()
