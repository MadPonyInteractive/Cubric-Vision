# Monolith BFS (head-swap) section — investigation (2026-06-21)

> DEFERRED feature — saved for when we build the head-swap operation.
> Source: `G:\ComfyUi\ComfyUI\user\default\workflows\LTX-2.3_nerdyRodent.json`.

## BFS = "Best Face Swap" Video LoRA
- LoRA by Alissonerdx: https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap-Video
- Custom nodes: https://github.com/alisson-anjos/ComfyUI-BFSNodes (node 372 install list)
- Note 1037 prompt style: `head_swap:` / `FACE:` (description) / `ACTION:` (scene).
- Note 1012: "For BFS LoRA". Note 1077: BFS uses AddGuide ("suggestion", promptable) vs
  InPlace nodes; "Uses BFS Video input by default, but could also just be 1+ images."

## BFS video source + BFS_AUDIO
- `1033 VHS_LoadVideo` (`example.mp4`, force_rate 24, format LTXV):
  - IMAGE slot 0 → ImageResizeKJv2 (1024) → Set_CTRL_VID_BFS (face/head reference frames)
  - AUDIO slot 2 → Set_BFS_AUDIO (1039) → Get_BFS_AUDIO (1042) → audio AnySwitch 1060 any_02
- **BFS_AUDIO** = the voice track extracted from the face-swap source video. Lets the swapped
  head lip-sync to the ORIGINAL speaker instead of a separate WAV. Notes 1044/1068/1125
  confirm: "If using the audio from the BFS video, disable the Load Audio group."

## Concat path (per sub-agent earlier scan)
- BFS init latent: `1022 LTXVAddGuideMulti → 1017 LTXVConcatAVLatent → 1019 Set_LAT_BFS`
- Selected via the master init-latent AnySwitch (257 in monolith) like every other mode.

## When we build head-swap op
- Need: BFS LoRA dep + ComfyUI-BFSNodes custom node + VHS_LoadVideo (or our own video loader)
  + AddGuideMulti chain. Replace rgthree muters/switches with MpiNodes.
- Relationship to input-audio: head-swap can REUSE the input-audio chain by feeding BFS_AUDIO
  into it (see [[monolith-input-audio]]).
- This is a SEPARATE operation from i2v/t2v/FL (own workflow file).
