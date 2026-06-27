# MPI-82 Brief — External connections (local LoRA/upscale) in remote mode

## Origin
ID-collision spin-off. On 2026-06-14 two `task.created` events both grabbed `MPI-81`:
`claude` 12:50 (rebuild batch) and `vscode` 12:35 (this External-Connections concern).
Last writer won task.json/title; brief.md kept the rebuild-batch content. Resolution:
MPI-81 stays = "Next Pod-image rebuild batch" (preserves the MPI-75→MPI-81 close link);
this External-Connections concern moved to MPI-82.

## The concern (Fabio)
External connections pointing at upscale models + user LoRAs likely don't work in remote
mode — remote tries to resolve from local storage, which it can't reach. User needs a way
to upload LoRA + upscale models to the cloud. Drop-area in Settings, in the picker modal,
or best UX = both.

## Investigation verdict (CONFIRMED)
- Remote mode ships LoRA/upscale **filenames** in the workflow JSON to the Pod; Pod resolves
  from its own `/workspace/mpi_models/<type>/` volume.
- Local extra-folder models (`extra_model_folders.json` → `extra_model_paths.yaml`) are
  never consulted remotely.
- `GET /comfy/list-files` (picker source) has NO remote branch → user sees local-only LoRAs
  remotely, picks one, Pod fails "model not found", no warning.
- NO model-file upload path exists (wrapper only has upload/image, /media, /latent). A model
  upload endpoint = new wrapper endpoint = Pod-image rebuild.

## Decisions (user, 2026-06-14)
1. Phased, one card. **Phase 1 = guard + warn, ship now, no rebuild, test locally first.**
   **Phase 2 = upload pipeline, GATED on next Pod-image rebuild (batch into MPI-81).**
2. UX placement = **both** (Settings External Connections + picker modal) — Phase 2.

See plan.md for the step-by-step.
