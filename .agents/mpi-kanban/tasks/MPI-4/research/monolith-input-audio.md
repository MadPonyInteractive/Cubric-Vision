# Monolith INPUT AUDIO section — investigation (2026-06-21)

> Source: `G:\ComfyUi\ComfyUI\user\default\workflows\LTX-2.3_nerdyRodent.json` (551 nodes).
> INPUT audio = external audio file → drives generation (lip-sync). DISTINCT from
> OUTPUT audio (model-generated). Map only — replicate in stripped template later.

## Loader nodes
| id | type | widgets | role |
|---|---|---|---|
| 316 | LoadAudio | `['HAW2MNRG.wav',…]` | primary WAV uploader (currently MUTED mode=4) |
| 1033 | VHS_LoadVideo | `example.mp4`, force_rate 24, format LTXV | BFS face-swap video; audio slot 2 = BFS_AUDIO; image slot 0 = BFS control video |
| 1230 | VHS_LoadVideo | `example.mp4` | extend-video loader; audio → LTXVAudioVAEEncode 1227 (extend path) |

## Chain (custom loaded audio)
```
316 LoadAudio ─┬─ 1118 Set_RAW_AUDIO (raw, for output selector)
               └─ 1060 AnySwitch(rgthree) any_01
1033 VHS_LoadVideo.audio → 1039 Set_BFS_AUDIO → 1042 Get_BFS_AUDIO → 1060 any_02
1060 AnySwitch → 307 LTXVAudioVAEEncode (audio_vae ← 823 VAELoaderKJ 'LTX23_audio_vae_bf16')
  → 311 SetLatentNoiseMask (mask ← 310 SolidMask value=0, w/h ← Get_LAT_WIDTH/HEIGHT)
  → 312 Set_LAT_AUD_CUST
341 Get_LAT_AUD_CUST ─┐
                      ├ 344 AnySwitch(rgthree) → 345 Set_LAT_AUD_IN
343 Get_LAT_AUD_MT ───┘  (empty audio latent fallback ← 105 LTXVEmptyLatentAudio)
347 Get_LAT_AUD_IN → 108 LTXVConcatAVLatent (per-branch) → sampler (675 LTXVNormalizingSampler)
  → 114 LTXVSeparateAVLatent → output decode
```

## SolidMask (310) = audio STRENGTH knob, NOT spatial
- `SolidMask` (KJNodes), value=0, width/height runtime-overridden to latent dims (≈192×320).
- MASK → SetLatentNoiseMask(311) on the AUDIO latent. Noise mask semantics:
  - **0 = "fully denoise"** = audio conditioning drives generation at **FULL strength**.
  - **1 = "preserve"** = latent left ~untouched = audio has **minimal impact**.
- SOLID = uniform value → no per-region differentiation → acts as **global scalar**.
- Note 1044 verbatim: `0 = "full strength" / 1 = minimal impact`.
- **App control idea:** expose this 0..1 as an "Audio Influence" slider (inverted: 0=full).

## Voice-to-character: NO dedicated node
- Model picks which character lip-syncs by perceptual fit. Note 1044: *"the model will
  'pick' which character 'best fits' the voice… a masculine voice may lip sync on a man in
  the background if your main character is a woman."* No speaker-ID / region assignment.

## Gates (rgthree — must replace)
| id | type | title | replace with |
|---|---|---|---|
| 1063 | Fast Groups Muter | "Use Loaded Audio?" | bool gate on LoadAudio output |
| 346 | Fast Groups Muter | "Use Custom Audio?" | bool gate on whole encode chain |
| 1060 | Any Switch | pick LoadAudio vs BFS_AUDIO | MpiAnySwitch |
| 344 | Any Switch | pick custom vs empty audio latent | MpiAnySwitch |
| 1064 | Fast Groups Muter | "Use Generated Audio?" | (OUTPUT side, not input) |

## Replication notes for template (later)
- Need: LoadAudio (Input_Audio_File), LTXVAudioVAEEncode, SolidMask+SetLatentNoiseMask,
  audio-latent AnySwitch (custom vs empty), feed into existing LTXVConcatAVLatent.
- Audio VAE already in template (VAELoaderKJ 'LTX23_audio_vae_bf16'). Reuse.
- Gate via MpiBoolean/MpiAnySwitch (project bans rgthree).
- App controls: Input_Audio_File (audio upload) + Input_Use_Input_Audio (bool) + maybe
  Input_Audio_Influence (the SolidMask value, 0..1).
