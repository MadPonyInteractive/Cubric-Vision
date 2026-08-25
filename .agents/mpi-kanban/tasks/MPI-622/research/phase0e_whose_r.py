"""MPI-622 Phase 0e: is "twain" the VOICE's own accent, or damage VC inflicts?

Phase 0d's hypothesis is DEAD. Fabio heard "twain" in all five arms, at every pitch distance
above and below the target, so it does not track the direction VC has to move pitch.

What his result actually shows is that the defect follows the **TTS source** -- every broken
clip on this card descends from one TTS output (Phase 0c's F run) -- and that shifting the
TTS output afterwards cannot repair it. Which means it was already in that TTS output, even
though it sounded clean.

But the origin of the character clip changes the likeliest explanation entirely.
`lib_f_midage_narration.wav` is **synthetic**: generated offline by Qwen3-TTS VoiceDesign
from Fabio's own prompt (`../MPI-607/research/design_voices.py`), which reads

    "Adult female, forties, REFINED BRITISH ACCENT, low-mid pitch, unhurried tempo,
     rich timbre, calm narration."

Fabio described the output cold as "a white woman from 1935 sassy voice". That register is
exactly where **labiodental /r/** lives -- the [v]-like R of upper-class early-20th-century
British speech, which sounds like /w/ to almost everyone else. So "twain" may be the voice
faithfully being the voice it was prompted to be.

And the voice's own sample would never reveal it. Its text is fixed for the whole library set:

    "The old lighthouse had stood at the edge of the cliff for nearly two hundred years,
     and every sailor who passed it knew the story by heart. On a clear night you could
     see its beam sweeping across the water."

Every R in it is post-vocalic (nearly, years, sailor, heart, clear, water) -- which a British
voice drops CORRECTLY, so a listener hears nothing wrong -- or buried mid-word. **There is no
stop+/r/ onset cluster anywhere in it. It never says "train".**

Two arms, and between them they settle it:

    direct_char   TTS(the train text, audio_prompt=the character clip), NO VC AT ALL.
                  If this says "twain", the voice owns the defect and VC is innocent.

    vc_other_char The SAME broken TTS source, VC'd into a non-British male character
                  (A3_REF gravel). If "twain" survives into a voice that has no business
                  having it, VC is carrying or creating it.

Run under the GPU lease, bench on :8188.
"""
import json
import time
import urllib.request

HOST = "http://127.0.0.1:8188"
PREFIX = "mpi622_whose_r"
SEED = 42
CFG = 0.3

BRITISH = "lib_f_midage_narration.wav"          # 218.8 Hz, the suspect
GRAVEL = "A3_REF_senior_male_gravel_character.wav"  # 125.7 Hz, not British
BROKEN_SRC = "rho_src_plus0.wav"                # Phase 0c F's TTS output, unshifted

TEXT = ("The train leaves at four. I put your bag by the door and the keys are on the "
        "table.")


def graph_direct(slug):
    """TTS straight from the character clip. No VC anywhere in this graph."""
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": BRITISH}},
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": {
            "text": TEXT, "exaggeration": 0.5, "cfg_weight": CFG, "temperature": 0.8,
            "seed": SEED, "audio_prompt": ["1", 0], "use_cpu": False,
            "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio", "inputs": {
            "audio": ["2", 0], "filename_prefix": PREFIX + "/" + slug}},
    }


def graph_vc(target, slug):
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": BROKEN_SRC}},
        "2": {"class_type": "LoadAudio", "inputs": {"audio": target}},
        "3": {"class_type": "FL_ChatterboxVC", "inputs": {
            "input_audio": ["1", 0], "target_voice": ["2", 0], "seed": SEED,
            "use_cpu": False, "keep_model_loaded": True}},
        "4": {"class_type": "SaveAudio", "inputs": {
            "audio": ["3", 0], "filename_prefix": PREFIX + "/" + slug}},
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
    for slug, g in [("direct_char_no_vc", graph_direct("direct_char_no_vc")),
                    ("vc_into_gravel", graph_vc(GRAVEL, "vc_into_gravel")),
                    ("vc_into_british", graph_vc(BRITISH, "vc_into_british"))]:
        try:
            _, secs = wait(submit(g))
            print("OK %6.1fs  %s" % (secs, slug))
        except Exception as exc:
            print("FAIL %s: %s" % (slug, exc))


if __name__ == "__main__":
    main()
