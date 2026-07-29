# SDXL family — Depth Control (ControlNet-Union), shipped 2026-07-24

All 5 SDXL-family models — `sdxl-realistic`, `sdxl-nsfw`, `ill-anime-beauty`, `ill-anime`,
`pony-mix` — gained a **Depth Control** op. Shipped, verified in-app **and** on a Pod.

## It REUSES Krea2's `poseReference` op — it is not a new op

The op key stays `poseReference` (user-facing label "Depth"). The raw node was renamed to
`Input_depth_reference` so it matches Krea2's `injectParams`, which lets **one op drive both
model families**. Capability-gating auto-hides the Krea2-only controls (`krea2Turbo`,
`styleSelect`, `enhance`) for SDXL — **no registry change was needed**. Op-key/title history:
[../krea2/](../krea2/) and `docs/playbooks/add-model/04-ops-and-controls.md`.

## The MECHANISM differs from Krea2 — this is the first non-LoRA controlnet dep

| | Krea2 depth | SDXL depth |
|---|---|---|
| Kind | a **LoRA** (`krea2-lora-depth-control`) | a real ControlNet **weight** |
| File | — | `ControlNet-Union-ProMax-SDXL.safetensors` (`controlnet-union-sdxl`), 2.34 GB, `controlnet/` path |

This is the **first controlnet-model dep in the app** — every prior control was a LoRA.

## Depth path in the shared t2i graph

```
MpiLoadImageFromPath
  -> ImageResizeKJv2                      (comfyui-kjnodes)
  -> AIO_Preprocessor / DepthAnythingV2   (comfyui_controlnet_aux)
  -> SetUnionControlNetType[depth]
  -> ControlNetApplyAdvanced
```

`Input_depth_reference` (`MpiIfElse`) is baked **FALSE**; `poseReference` injects `true` at
submit. **Same trap as `Input_Is_i2i`** — a template exported with it ON would force depth on
every generation. See `.claude/rules/comfy_injection.md` § The silent-skip trap.

## Two traps worth knowing

- **kjnodes was NOT previously an SDXL dep** despite the template already using
  `ImageResizeKJv2` before this change — a latent gap. Both `kjnodes` **and**
  `controlnet_aux` are now explicit deps on all 5 models.
- **yaml needs ZERO edits.** `routes/yamlHelper.js` derives folder keys from dep filenames
  (`controlnet/...` → `controlnet:`) and `controlnet` is already in `coreExtras`, so it is
  auto-emitted for every user and Pod (`start.sh` maps `controlnet: mpi_models/controlnet/`).
  **Dropping a new dep with a new folder type is discoverable automatically — never hand-edit
  the yaml for one.**

## Pod

The weight is **per-model, NOT an `engineAsset`** — it downloads on demand from R2 into the
volume at model-install time. Both custom nodes are already baked into the image (Dockerfile
kjnodes + controlnet_aux). **No image rebuild required.**
