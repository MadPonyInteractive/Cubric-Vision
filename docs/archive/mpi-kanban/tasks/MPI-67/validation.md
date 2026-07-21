# MPI-67 Validation

## Acceptance
- A LoRA in `<models>/loras/<TYPE>/file.safetensors` selects + generates on Windows
  with no "Prompt outputs failed validation" / no `Value not in list` 400, and the
  LoRA's effect is visible in the output.
- `GET /comfy/list-files?subDir=loras` returns the subfolder name with a BACKSLASH
  on Windows, matching `GET http://127.0.0.1:8188/object_info/LoraLoader` enum.
- An existing project that saved a forward-slash subfolder LoRA name still shows it
  selected in Model Settings and generates (legacy value self-heals at injection;
  no project.json migration).
- Root-level LoRA, upscale, and non-LoRA generations unaffected.
- App reports 1.0.1; release:check green; per-OS artifacts built; release published.

## Proof reference
Fix proven on the RunPod branch 2026-06-14: offline logic test confirmed emit ==
ComfyUI enum (`SDXL\...`) and legacy forward-slash resolves to the backslash list
string; live confirmed a subfolder LoRA generated successfully after the fix.
