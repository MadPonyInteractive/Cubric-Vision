"""MPI-664 bench test: does MiniMax Music 3 honour per-section voice stated in the caption?

Verses + first chorus: Singer A (Male), alone, no backing.
Final chorus: full mixed choir.
Queues on the bench (127.0.0.1:8188, G:/ComfyUi) and polls until the job lands.
"""
import json
import sys
import time
import urllib.error
import urllib.request

HOST = "http://127.0.0.1:8188"

# argv[1] = text encoder filename, argv[2] = output prefix. Everything else is held fixed
# so the two runs differ by the encoder alone.
CLIP_NAME = (sys.argv[1] if len(sys.argv) > 1
             else "minimax_music3_text_encoder_pruned_int8_convrot.safetensors")
PREFIX = sys.argv[2] if len(sys.argv) > 2 else "MPI664_voice_bench"

CAPTION = """Global Metadata:
Basic Attributes: Contemporary folk-pop anthem with a gospel-leaning finale. Moderate walking tempo around 84 BPM, D major, major scale. Acoustic-led, radio-warm.
Global Emotional Progression: Begins intimate, solitary and close, one person alone in a room. Grows steadily more certain through the middle. Opens out at the end into a communal, uplifting, many-voiced finale.
Application Scenarios & Imagery: A slow walk home at dawn; the last scene of a film where a crowd gathers and joins in.
Sonics & Production Profile: Warm analogue tone, close-miked and dry in the verses, wide hall reverb and full stereo width only in the final chorus.

Vocal Details:
Vocal Gender & Timbre: Singer A (Male). Every verse and the first chorus are sung ALONE by Singer A, a warm male baritone with a slight rasp and an unhurried delivery. No other voice appears anywhere in the first half of the song. The FINAL chorus is deliberately NOT Singer A alone: it is delivered by a full mixed choir of many male and female voices singing together, which enters only at the final chorus and carries the song to the end.
Vocal Style: Verses conversational, restrained and close, almost spoken at the low end of the baritone range. First chorus lifted but still one single male voice. Final chorus belted, full-throated and communal, dozens of voices in unison and in harmony.
Harmony/Backing Vocals: Absolutely none in the verses and none in the first chorus. The only harmony in the entire track is the large mixed choir at the final chorus, stacked in four-part gospel harmony.
Vocal FX: Verses dry with a light plate. Final chorus wide hall reverb and stereo choir spread.

Arrangement:
Instrument Lifecycle Description (Primary/Secondary Layering): Solo fingerpicked acoustic guitar carries the verses. Upright bass and brushed kit join at the first chorus. Piano, strings and tambourine arrive only at the final chorus, behind the choir.
Groove & Foundation Progression: Gentle 4/4, brushed snare through the middle, full backbeat and hand claps under the final chorus.
Embellishments, Textures & Spatial FX: Sparse and dry early. A single sustained string swell lifts into the final chorus, where the mix opens wide."""

LYRICS = """[Verse]
Walking home before the light comes up
Counting every window still awake
Nobody out here but the humming wires
And the quiet I decided not to break

[Chorus]
So I carry it alone
Carry it alone
One voice on an empty road
Carry it alone

[Verse]
Somebody left a door propped open wide
Warm light spilling out onto the street
And I heard them singing something I knew
Half a line and I could feel my feet

[Chorus]
Now we carry it together
Carry it together
Every voice on every road
Carry it together
Carry it together"""

PROMPT = {
    "47": {"class_type": "CLIPLoader", "inputs": {
        "clip_name": CLIP_NAME, "type": "minimax", "device": "default"}},
    "48": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_music3_dav.safetensors"}},
    "53": {"class_type": "UNETLoader", "inputs": {
        "unet_name": "minimax_music3_dit_fp16.safetensors", "weight_dtype": "default"}},
    "65": {"class_type": "MpiInt", "_meta": {"title": "Input_Seed"},
           "inputs": {"int": 976866873952}},
    "45": {"class_type": "MpiText", "_meta": {"title": "Input_Caption"},
           "inputs": {"string": CAPTION}},
    "46": {"class_type": "MpiText", "_meta": {"title": "Input_Lyrics"},
           "inputs": {"string": LYRICS}},
    "54": {"class_type": "MiniMaxMusic3TextEncode", "inputs": {
        "clip": ["47", 0], "caption": ["45", 0], "lyrics": ["46", 0], "seed": ["65", 0],
        "max_duration": 150.0, "cfg_scale": 1.7, "top_k": 50}},
    "55": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["54", 0]}},
    "56": {"class_type": "EmptyMiniMaxMusic3LatentAudio", "inputs": {
        "seconds": ["54", 1], "batch_size": 1}},
    "49": {"class_type": "KSampler", "inputs": {
        "model": ["53", 0], "positive": ["54", 0], "negative": ["55", 0],
        "latent_image": ["56", 0], "seed": ["65", 0], "steps": 30, "cfg": 1.7,
        "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
    "50": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["49", 0], "vae": ["48", 0]}},
    "51": {"class_type": "VAEDecodeAudioTiled", "inputs": {
        "samples": ["49", 0], "vae": ["48", 0], "tile_size": 1536, "overlap": 64}},
    "66": {"class_type": "MpiIfElse", "_meta": {"title": "Input_Low_Vram"}, "inputs": {
        "true": ["51", 0], "false": ["50", 0], "boolean": True}},
    "60": {"class_type": "MpiClearVram", "inputs": {"passthrough": ["66", 0]}},
    "62": {"class_type": "SaveAudioAdvanced", "_meta": {"title": "Output_Audio"}, "inputs": {
        "audio": ["60", 0], "filename_prefix": "audio/" + PREFIX, "format": "flac"}},
}


def post(path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(HOST + path, data=body,
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))


def get(path):
    return json.loads(urllib.request.urlopen(HOST + path, timeout=60).read().decode("utf-8"))


def main():
    try:
        res = post("/prompt", {"prompt": PROMPT, "client_id": "mpi664-bench"})
    except urllib.error.HTTPError as exc:
        print("QUEUE FAILED", exc.code)
        print(exc.read().decode("utf-8"))
        return 1
    pid = res["prompt_id"]
    print("queued", pid, flush=True)

    started = time.time()
    while time.time() - started < 3600:
        time.sleep(10)
        hist = get("/history/" + pid)
        if pid not in hist:
            continue
        entry = hist[pid]
        status = entry.get("status", {})
        print("status", status.get("status_str"), "completed", status.get("completed"), flush=True)
        if status.get("status_str") == "error":
            print(json.dumps(status.get("messages", []), indent=2)[:4000])
            return 1
        outs = entry.get("outputs", {})
        print(json.dumps(outs, indent=2)[:2000], flush=True)
        print("elapsed %.0fs" % (time.time() - started))
        return 0
    print("TIMED OUT after 3600s")
    return 1


if __name__ == "__main__":
    sys.exit(main())
