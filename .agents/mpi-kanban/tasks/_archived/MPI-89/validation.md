# MPI-89 Validation

Remote input-asset transfer for non-image inputs. Code shipped in committed
`e46a02b` (MPI-64 Step 5.1). All three legs verified live 2026-06-17.

## Leg 1 + 2 — video/audio media upload + trimmed-clip — VERIFIED (2026-06-17)
Connected to an L4 Pod (image v0.4.7-cu124). Set a trim range on a local video
(`video_crop_001`, trimmed from `t2v_ms_031`) and ran a remote **upscale**:
- The trimmed clip uploaded to the Pod (`comfyController._uploadRemoteMedia` →
  `/remote/upload/media` → `/wrapper/upload/media`); VHS read it; the upscale ran
  remotely and produced correct output from the trimmed input.
- Trim path fired (`_prepareTrimmedVideoInputs` → `/api/video/trim-input`): the
  uploaded asset was the trimmed clip, not the full source. ✓
- (Found+separated during this test: a custom **local** upscaler model not present
  on the Pod produced a silent "completed but no output" — that is the model-list
  remote-awareness bug tracked on **MPI-82**, NOT an input-transfer failure.
  Re-running with a Pod-present upscaler succeeded.)

## Leg 3 — preview-latent staging round-trip — VERIFIED (2026-06-17)
Connected to an **L40S ephemeral** Pod (image v0.4.8-cu124, wrapper 0.2.10 — per
MPI-90 reply, the upload/latent/media/input-dir paths are byte-identical to v0.4.7).
Ran a full **remote-origin** multi-stage flow:
- Created a multi-stage **preview remotely** → latent produced on the Pod and
  returned to the local project (`routes/projects.js` remote branch streams the
  produced `.latent` from the Pod via the authed `/view` base). ✓
- **2× "Continue From Generation"** → `_stagePreviewLatent`
  (`commandExecutor.js:807`) uploaded the local `<uuid>.latent` back to the Pod via
  `/comfy/stage-preview-latent` remote branch → `/wrapper/upload/latent`; stage-2
  loaded it and completed. ✓
- **In-place continue** → same staging+upload path, in-place variant. ✓
- **Deleted one Continue-From generation** → history teardown clean, no orphan. ✓

All succeeded. The full leg-3 round-trip (produce-on-Pod → return-to-app →
re-upload → stage-2 load) is proven on the current image.

## Known limitation (carded follow-up: MPI-108)
**Local-origin** preview → **remote** Continue can hit "preview latent missing":
when the preview `.latent` was generated **locally** and the user then connects to
an **ephemeral** Pod whose ComfyUI **restarts for a node install** between staging
and stage-2, the staged latent is wiped from the ephemeral `input/` dir → fallback
fires ("running stage 1 from saved snapshots") and, in one observed run, the stage-1
rerun finished without producing a latent ("Stage 1 rerun finished but latent was
not produced"). The fallback is graceful UX, but it bypasses the exact preview
latent. Re-staging the latent **after** an ephemeral-Pod engine restart is the fix —
tracked on **MPI-108**. Remote-origin previews (the common remote flow) are
unaffected and fully verified above.

## Outcome
Legs 1+2+3 verified live 2026-06-17. MPI-89 accepted/closed; the ephemeral-restart
edge case carved off to MPI-108.
