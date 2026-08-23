"""MPI-607 Step 2b: clone each Qwen-designed voice through Chatterbox on the bench.

Reference clips were designed by Qwen3-TTS VoiceDesign (official HF Space, open
weights) and already sit in the bench's input/ folder. Chatterbox speaks DIFFERENT
text with each as audio_prompt -- if it only echoed the reference text the test would
prove nothing.

Also runs one no-reference baseline so the cloned timbre can be compared against
Chatterbox's own default voice.

Usage: python chatterbox_clone_test.py
"""
import json
import sys
import time
import urllib.request

HOST = "http://127.0.0.1:8188"

# Deliberately different from the reference clips' text.
TARGET_TEXT = (
    "I never planned to come back here. But the map said the road ended at the water, "
    "and it was the only road left."
)

REFERENCES = [
    "vd_young_male_us_warm.wav",
    "vd_midage_female_uk_narration.wav",
    "vd_senior_male_gravel_character.wav",
]

SEED = 42


def graph_multi(ref_wav, prefix, language, text):
    """FL_ChatterboxMultilingualTTS: same cloned voice, a different spoken language."""
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": ref_wav}},
        "2": {"class_type": "FL_ChatterboxMultilingualTTS", "inputs": {
            "text": text, "language": language, "exaggeration": 0.5, "cfg_weight": 0.5,
            "temperature": 0.8, "repetition_penalty": 2.0, "min_p": 0.05, "top_p": 1.0,
            "seed": SEED, "audio_prompt": ["1", 0], "use_cpu": False,
            "keep_model_loaded": True}},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": prefix}},
    }


def graph(ref_wav, prefix):
    """API-format graph: LoadAudio -> FL_ChatterboxTTS -> SaveAudio. ref_wav None = baseline."""
    tts = {
        "text": TARGET_TEXT,
        "exaggeration": 0.5,
        "cfg_weight": 0.5,
        "temperature": 0.8,
        "seed": SEED,
        "use_cpu": False,
        "keep_model_loaded": True,
    }
    g = {
        "2": {"class_type": "FL_ChatterboxTTS", "inputs": tts},
        "3": {"class_type": "SaveAudio",
              "inputs": {"audio": ["2", 0], "filename_prefix": prefix}},
    }
    if ref_wav:
        g["1"] = {"class_type": "LoadAudio", "inputs": {"audio": ref_wav}}
        tts["audio_prompt"] = ["1", 0]
    return g


def submit(g):
    req = urllib.request.Request(
        f"{HOST}/prompt",
        data=json.dumps({"prompt": g}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
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
                msgs = status.get("messages", [])
                raise RuntimeError(f"execution error: {json.dumps(msgs)[:1200]}")
            outs = []
            for node in entry.get("outputs", {}).values():
                outs.extend(node.get("audio", []))
            return outs, time.time() - t0
        time.sleep(3)
    raise RuntimeError("timed out waiting for history")


def run(label, ref_wav, prefix):
    print(f"\n--- {label} ---")
    try:
        pid = submit(graph(ref_wav, prefix))
    except Exception as exc:
        body = getattr(exc, "read", lambda: b"")()
        print(f"SUBMIT FAILED: {exc} {body[:1500]}")
        return
    print(f"prompt_id={pid}")
    try:
        outs, secs = wait(pid)
    except Exception as exc:
        print(f"FAILED: {exc}")
        return
    for o in outs:
        print(f"OK {secs:.1f}s -> {o.get('subfolder')}/{o.get('filename')} ({o.get('type')})")


def run_multi(label, ref_wav, prefix, language, text):
    print(f"\n--- {label} ---")
    try:
        pid = submit(graph_multi(ref_wav, prefix, language, text))
    except Exception as exc:
        print(f"SUBMIT FAILED: {exc} {getattr(exc, 'read', lambda: b'')()[:1200]}")
        return
    try:
        outs, secs = wait(pid)
    except Exception as exc:
        print(f"FAILED: {exc}")
        return
    for o in outs:
        print(f"OK {secs:.1f}s -> {o.get('subfolder')}/{o.get('filename')}")


# Does an ACCENT baked into the reference survive cloning? Chatterbox has no voice
# prompt, so if it flattens the accent the whole accent library is pointless.
ACCENT_REFS = ["acc_it_m.wav", "acc_ru_m.wav", "acc_fr_f.wav"]

# Same cloned voice, other languages -- answers "can one supplied voice speak many
# languages" without touching the accent question.
MULTI = [
    ("acc_it_m.wav", "Italian (it)",
     "Mi hanno detto che il ponte era chiuso, ma l'ho attraversato lo stesso."),
    ("acc_es_f.wav", "Spanish (es)",
     "Me dijeron que el puente estaba cerrado, pero lo crucé de todos modos."),
    ("lib_f_midage_narration.wav", "French (fr)",
     "On m'a dit que le pont était fermé, mais je l'ai traversé quand même."),
]


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "accents":
        for ref in ACCENT_REFS:
            slug = ref[:-4]
            run(f"accent survival: {ref}", ref, f"mpi607_accents/CLONE_{slug}")
        for ref, lang, text in MULTI:
            tag = lang.split(" (")[1].rstrip(")")
            run_multi(f"multilingual {lang} from {ref}", ref,
                      f"mpi607_accents/MULTI_{tag}_{ref[:-4]}", lang, text)
        return
    if len(sys.argv) > 1:
        # ad-hoc refs, e.g. the real-human control clip
        for ref in sys.argv[1:]:
            slug = ref.rsplit(".", 1)[0].replace(" ", "_")[:40]
            run(f"clone from {ref}", ref, f"mpi607/control_{slug}")
        return
    run("baseline (no reference, Chatterbox default voice)", None, "mpi607/baseline_noref")
    for ref in REFERENCES:
        slug = ref[3:-4]  # strip vd_ / .wav
        run(f"clone from {ref}", ref, f"mpi607/clone_{slug}")


if __name__ == "__main__":
    main()
