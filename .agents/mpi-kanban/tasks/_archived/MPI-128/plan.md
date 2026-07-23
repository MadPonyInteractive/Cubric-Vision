# MPI-128 — Plan (item 1: dual-latent stage-2 staging)

Goal: LTX preview → Continue/Finish reuses BOTH staged latents (video + audio),
not just one. Local-first (no Pod; Pod busy being updated). WAN path untouched.

## Prereq DONE
- LTX template bumped tier-2 dual-save (`Output_Video_Latent` / `Output_Audio_Latent`),
  4 app files regenerated via `comfy_workflows/scripts/workflow_generation/orchestrate.py`.
  Save nodes now title-distinguishable; LoadLatent already `Input_Video_Latent` /
  `Input_Audio_Latent`; stage-2 pre-stamps `Input_Is_Continue=true`.

## Design (lazy, WAN-safe)
Add ONE optional sibling field `audioLatent` next to existing `previewAssets.latent`,
and ONE optional payload pair `loadAudioLatentName` / `audioLatentFilePath` next to the
existing scalars. No arrays, no schema churn. WAN never sets them → zero change.
Role derived by SaveLatent node TITLE (`Output_Video_Latent` vs `Output_Audio_Latent`).

Engine input names fixed (both already in `WORKFLOW_INPUT_DEFAULTS`):
`ltx_video_latent_00001_.latent` + `ltx_audio_latent_00001_.latent`.

## The 7 wiring points
1. commandExecutor `_collectComfyLatents` call (~1171): tag each latent with `role`
   from `workflow[nodeId]._meta.title` (Output_Video_Latent→video, Output_Audio_Latent→audio).
2. generationService (~694): keep `latent`=video (back-compat) + add `audioLatent`=audio.
3. projects.js `materializePreviewAssets` (~294): materialize audioLatent →
   `.latents/<itemId>.audio.latent`; record `result.audioLatent`.
4. projects.js validation (~888): when sidecar has audioLatent, require it on disk for fast-path.
5. MpiGalleryBlock continue (~483) + finish (~657): pass `loadAudioLatentName` +
   `audioLatentFilePath` from `previewAssets.audioLatent`.
6. commandExecutor `_stagePreviewLatent` (~112) + comfy.js route (~205): stage audio latent too.
7. commandExecutor `_buildParams` (~479): emit `Input_Audio_Latent` = staged audio name.

## Verify (local)
LTX i2v preview → Finish on local engine (forceLocal). Assert:
- preview run writes 2 latents to `.latents/` (video + audio)
- Finish stages BOTH into engine input/
- stage-2 prompt validates (no `Invalid latent file`)
- final ≈ preview
Self-check: small assert-based test on the role-pairing + payload-threading logic.
