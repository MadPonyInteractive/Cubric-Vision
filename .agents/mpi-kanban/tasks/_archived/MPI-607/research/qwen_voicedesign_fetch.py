"""Fetch voice-design clips from the OFFICIAL Qwen3-TTS HF Space (gradio API).

Space: Qwen/Qwen3-TTS -- ZeroGPU a10g, runs the open weights
Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign on transformers==4.57.3 / torch 2.8.0.

(The Qwen/Qwen3-TTS-Voice-Design space is a DashScope API proxy and is currently
returning an immediate error for every request, browser UI included.)

Writes wavs to OUT_DIR as vd_<slug>.wav plus vd_<slug>.txt holding the prompt.
"""
import json
import os
import sys
import time
import urllib.request

BASE = "https://qwen-qwen3-tts.hf.space/gradio_api"
FN = "generate_voice_design"
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "."

# ~10s of speech -- Chatterbox wants ~10s clean single-speaker reference.
REF_TEXT = (
    "The old lighthouse had stood at the edge of the cliff for nearly two hundred years, "
    "and every sailor who passed it knew the story by heart. On a clear night you could "
    "see its beam from twenty miles out, sweeping slow and steady across the water."
)

DESIGNS = [
    ("young_male_us_warm",
     "A young American male voice, early twenties, warm and friendly, moderate pace, "
     "clear articulation, relaxed conversational tone."),
    ("midage_female_uk_narration",
     "A middle-aged British female voice, refined Received Pronunciation, measured and "
     "unhurried pace, rich low-mid timbre, calm authoritative narration style."),
    ("senior_male_gravel_character",
     "An elderly male voice, seventies, gravelly and weathered timbre, slow deliberate "
     "pace, slightly raspy, world-weary storyteller character."),
]


def call_space(text, description):
    req = urllib.request.Request(
        f"{BASE}/call/{FN}",
        data=json.dumps({"data": [text, "English", description]}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        event_id = json.loads(r.read().decode("utf-8"))["event_id"]
    with urllib.request.urlopen(f"{BASE}/call/{FN}/{event_id}", timeout=600) as r:
        event = None
        for raw in r:
            line = raw.decode("utf-8").rstrip("\n")
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
                if event == "error":
                    raise RuntimeError(f"space error: {data}")
                if event == "complete":
                    return data
    raise RuntimeError("stream ended with no complete event")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for slug, description in DESIGNS:
        out = os.path.join(OUT_DIR, f"vd_{slug}.wav")
        t0 = time.time()
        try:
            data = call_space(REF_TEXT, description)
        except Exception as exc:
            print(f"FAIL {slug}: {exc}")
            continue
        fd = data[0] if isinstance(data, list) else data
        url = (fd or {}).get("url")
        if not url:
            print(f"FAIL {slug}: no url in {fd}")
            continue
        with urllib.request.urlopen(url, timeout=180) as r:
            blob = r.read()
        with open(out, "wb") as fh:
            fh.write(blob)
        print(f"OK   {slug}  {len(blob)} bytes  {time.time() - t0:.1f}s  -> {out}")
        with open(os.path.join(OUT_DIR, f"vd_{slug}.txt"), "w", encoding="utf-8") as fh:
            fh.write(description + "\n")


if __name__ == "__main__":
    main()
