"""MPI-607: build a loadable DramaBox workflow that actually fits a 16 GB card.

The pack's own three examples all omit DramaBoxUnloadModels, so on a 4060 Ti the
4-bit Gemma (~8 GB, pinned by bitsandbytes, not patcher-managed) is still resident
when the sampler asks for the 6.6 GB DiT. Comfy reports `full load: False`, leaves
part of the DiT on CPU, and the run dies at timestep_embedding.linear_2 with a
cuda/cpu mismatch that reads like a broken install.

Routing the conditioning THROUGH the unload node makes the free a real data
dependency rather than a hope about execution order.

Adds on top of dramabox_lowvram_12gb.json:
  10 LoadAudio                  -> a staged MPI-622 voice
   5 DramaBoxVoiceReferenceLoader
   9 DramaBoxUnloadModels       -> between text encode and sampler
"""
import io
import json

SRC = r"G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-MelodramaBox/example_workflows/dramabox_lowvram_12gb.json"
DST = r"G:/ComfyUi/ComfyUI/user/default/workflows/MPI607_DramaBox_16GB.json"

PROMPT = ('A weary man says, with a long sigh, "I told you this would happen." '
          'He pauses, then adds quietly, bitterly, "Nobody ever listens."')
VOICE = "mpi607_voices/R1_deep_male_1.wav"

w = json.load(io.open(SRC, encoding="utf-8"))
w["id"] = "mpi607-dramabox-16gb"
by_id = {n["id"]: n for n in w["nodes"]}

# ---- prompt text ------------------------------------------------------
by_id[4]["widgets_values"][0] = PROMPT

# The shipped example ships a SHORT sampler widget list (4 of 8 values), which a
# strict GUI->API conversion rejects on cfg_rescale. Write the full list.
# quality_preset, steps, cfg_scale, stg_scale, seed, <control_after_generate>,
# duration_seconds, duration_multiplier, cfg_rescale
by_id[6]["widgets_values"] = ["default", 30, 2.5, 1.5, 42, "randomize", 0.0, 1.1, -1.0]

# ---- 9: unload, spliced between text encode (4) and sampler (6) --------
w["nodes"].append({
    "id": 9, "type": "DramaBoxUnloadModels", "pos": [800, 480], "size": [300, 80],
    "flags": {}, "order": 20, "mode": 0,
    "inputs": [
        {"name": "trigger", "type": "*", "link": 40},
        {"name": "text_encoder", "type": "DRAMABOX_TEXTENC", "link": 31},
    ],
    "outputs": [{"name": "*", "type": "*", "links": [41], "slot_index": 0}],
    "properties": {"Node name for S&R": "DramaBoxUnloadModels"},
    "widgets_values": [],
    "title": "Free Gemma BEFORE the DiT loads (16 GB fix)",
})
# link 40 was 4 -> 6; retarget it to 4 -> 9, then 9 -> 6 carries it on.
for l in w["links"]:
    if l[0] == 40:
        l[3], l[4] = 9, 0
w["links"].append([41, 9, 0, 6, 1, "DRAMABOX_CONDITIONING"])
w["links"].append([31, 3, 0, 9, 1, "DRAMABOX_TEXTENC"])
by_id[3]["outputs"][0]["links"] = [30, 31]
for inp in by_id[6]["inputs"]:
    if inp["name"] == "conditioning":
        inp["link"] = 41

# ---- 90: PRE-encode unload --------------------------------------------
# Generation 2 OOMs without this: node 1 is cached, so the DiT is STILL resident
# when the text encode asks for the ~8 GB Gemma. The post-unload cannot help --
# it consumes the conditioning, so it runs after the encode.
w["nodes"].append({
    "id": 90, "type": "DramaBoxUnloadModels", "pos": [420, 300], "size": [300, 60],
    "flags": {}, "order": 10, "mode": 0,
    "inputs": [
        {"name": "trigger", "type": "*", "link": 30},
        {"name": "text_encoder", "type": "DRAMABOX_TEXTENC", "link": None},
    ],
    "outputs": [{"name": "*", "type": "*", "links": [32], "slot_index": 0}],
    "properties": {"Node name for S&R": "DramaBoxUnloadModels"},
    "widgets_values": [],
    "title": "Evict last run's DiT BEFORE the encode (gen-2 fix)",
})
# link 30 was 3 -> 4; retarget to 3 -> 90, then 90 -> 4 carries it on.
for l in w["links"]:
    if l[0] == 30:
        l[3], l[4] = 90, 0
w["links"].append([32, 90, 0, 4, 0, "DRAMABOX_TEXTENC"])
by_id[3]["outputs"][0]["links"] = [30, 31]
for inp in by_id[4]["inputs"]:
    if inp["name"] == "text_encoder":
        inp["link"] = 32

# ---- 10: LoadAudio + 5: voice reference -------------------------------
w["nodes"].append({
    "id": 10, "type": "LoadAudio", "pos": [40, 620], "size": [340, 130],
    "flags": {}, "order": 4, "mode": 0, "inputs": [],
    "outputs": [{"name": "AUDIO", "type": "AUDIO", "links": [52], "slot_index": 0}],
    "properties": {"Node name for S&R": "LoadAudio"},
    "widgets_values": [VOICE, None, None],
})
w["nodes"].append({
    "id": 5, "type": "DramaBoxVoiceReferenceLoader", "pos": [440, 620], "size": [340, 240],
    "flags": {}, "order": 8, "mode": 0,
    "inputs": [
        {"name": "audio_vae", "type": "DRAMABOX_AUDIO_VAE", "link": 22},
        {"name": "audio", "type": "AUDIO", "link": 52},
        {"name": "file_path", "type": "STRING", "link": None},
        {"name": "extra_ref", "type": "DRAMABOX_VOICE_REF", "link": None},
    ],
    "outputs": [{"name": "voice_ref", "type": "DRAMABOX_VOICE_REF", "links": [50], "slot_index": 0}],
    "properties": {"Node name for S&R": "DramaBoxVoiceReferenceLoader"},
    # trim_silence, max_duration_sec, denoise, strength.
    # denoise=False: RE-USE reference denoising is NSCLv1 NON-COMMERCIAL.
    "widgets_values": [True, 30.0, False, 1.0],
})
w["links"].append([22, 2, 0, 5, 0, "DRAMABOX_AUDIO_VAE"])
w["links"].append([52, 10, 0, 5, 1, "AUDIO"])
w["links"].append([50, 5, 0, 6, 2, "DRAMABOX_VOICE_REF"])
by_id[2]["outputs"][0]["links"] = [21, 22]
for inp in by_id[6]["inputs"]:
    if inp["name"] == "voice_ref":
        inp["link"] = 50

w["last_node_id"] = 90
w["last_link_id"] = 71

io.open(DST, "w", encoding="utf-8").write(json.dumps(w, indent=1))
print("wrote", DST)
print("nodes:", sorted(n["id"] for n in w["nodes"]))
