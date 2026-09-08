"""MPI-607: the DOUBLE-unload graph -- the only shape that survives a 2nd generation.

Measured on a 4060 Ti (16380 MiB), fresh bench each config, unique prompt per run
so the encode is never served from cache:

  bf16 + one unload (before sampler)   cold 30.9s / 12733 MiB   warm OOM in TextEncode
  Q8_0 + no unload  (both resident)    cold 30.6s / 14099 MiB   warm  24.0s / 15985 MiB (97.6%)

The warm failure is structural, not a tuning problem. On generation 2 the DiT
loader node is CACHED, so its weights are still resident, and the text encode then
tries to load the ~8 GB Gemma on top of them. A single unload cannot help: it
consumes the conditioning, so it runs AFTER the encode.

DramaBoxUnloadModels calls mm.unload_all_models(), which frees the DiT too. So put
one BEFORE the encode as well:

  9pre : trigger = text-encoder handle, output -> the encode's text_encoder input
         (frees a DiT left resident by the previous generation; Gemma NOT connected,
          it is about to be needed)
  9post: trigger = conditioning, text_encoder connected
         (frees Gemma before the sampler asks for the DiT)
"""
import json
import subprocess
import sys
import threading
import time
import urllib.request

BENCH = "http://127.0.0.1:8188"
DIT = sys.argv[1] if len(sys.argv) > 1 else "dramabox-dit-v1.safetensors"
COMPONENTS = "dramabox-audio-components.safetensors"
TEXT_ENCODER = "gemma-3-12b-it 4-bit (~8 GB, recommended)"
BASE = ('A weary man says, with a long sigh, "I told you this would happen." '
        'He pauses, then adds quietly, bitterly, "Nobody ever listens."')
NEGATIVE = ("worst quality, inconsistent, robotic, distorted, noise, static, "
            "muffled, unclear, unnatural, monotone")
VOICE_REF = "G:/ComfyUi/ComfyUI/input/mpi607_voices/R1_deep_male_1.wav"

_peak = {"mb": 0}
_stop = threading.Event()


def sample_vram():
    while not _stop.is_set():
        try:
            out = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5)
            _peak["mb"] = max(_peak["mb"], int(out.stdout.strip().splitlines()[0]))
        except Exception:
            pass
        time.sleep(0.5)


def graph(prefix):
    return {
        "1": {"class_type": "DramaBoxDiTLoader",
              "inputs": {"model_name": DIT, "dtype": "bf16"}},
        "2": {"class_type": "DramaBoxTextEncoderLoader",
              "inputs": {"text_encoder": TEXT_ENCODER, "components_name": COMPONENTS,
                         "keep_loaded": True}},
        "3": {"class_type": "DramaBoxAudioVAELoader",
              "inputs": {"components_name": COMPONENTS, "dtype": "bf16"}},
        # PRE: evict a DiT left resident by the previous generation.
        "90": {"class_type": "DramaBoxUnloadModels", "inputs": {"trigger": ["2", 0]}},
        "4": {"class_type": "DramaBoxTextEncode",
              "inputs": {"text_encoder": ["90", 0], "prompt": BASE + " " + prefix,
                         "negative_prompt": NEGATIVE}},
        # POST: free Gemma before the sampler asks for the DiT.
        "91": {"class_type": "DramaBoxUnloadModels",
               "inputs": {"trigger": ["4", 0], "text_encoder": ["2", 0]}},
        "5": {"class_type": "DramaBoxVoiceReferenceLoader",
              "inputs": {"audio_vae": ["3", 0], "trim_silence": True,
                         "max_duration_sec": 30.0, "denoise": False,
                         "strength": 1.0, "file_path": VOICE_REF}},
        "6": {"class_type": "DramaBoxSampler",
              "inputs": {"dit": ["1", 0], "conditioning": ["91", 0], "voice_ref": ["5", 0],
                         "quality_preset": "default", "steps": 30, "cfg_scale": 2.5,
                         "stg_scale": 1.5, "seed": 42, "duration_seconds": 0.0,
                         "duration_multiplier": 1.1, "cfg_rescale": -1.0}},
        "7": {"class_type": "DramaBoxVAEDecode",
              "inputs": {"audio_vae": ["3", 0], "audio_latent": ["6", 0], "crossfade_ms": 50}},
        "8": {"class_type": "DramaBoxSaveAudio",
              "inputs": {"audio": ["7", 0], "filename_prefix": prefix, "format": "wav"}},
    }


def run(label):
    prefix = "mpi607_double_%s" % label
    _peak["mb"] = 0
    t0 = time.time()
    req = urllib.request.Request(BENCH + "/prompt",
                                 data=json.dumps({"prompt": graph(prefix)}).encode(),
                                 headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    while True:
        time.sleep(2)
        h = json.load(urllib.request.urlopen("%s/history/%s" % (BENCH, pid)))
        if pid in h:
            break
        if time.time() - t0 > 900:
            print("TIMEOUT")
            return
    st = h[pid]["status"]
    cached = [m[1].get("nodes") for m in st.get("messages", []) if m[0] == "execution_cached"]
    print("%-6s status: %-8s wall: %5.1fs  peak VRAM: %5d MiB / 16380  cached=%s"
          % (label, st["status_str"], time.time() - t0, _peak["mb"], cached), flush=True)
    if st["status_str"] != "success":
        for m in st.get("messages", []):
            if m[0] == "execution_error":
                print("    ", m[1].get("node_type"), "|",
                      m[1].get("exception_message", "")[:180], flush=True)


if __name__ == "__main__":
    print("DiT =", DIT, flush=True)
    threading.Thread(target=sample_vram, daemon=True).start()
    for lbl in ("gen1", "gen2", "gen3"):
        run(lbl)
    _stop.set()
