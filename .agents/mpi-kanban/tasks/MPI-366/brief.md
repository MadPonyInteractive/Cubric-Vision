# MPI-366 — Krea2 ID-Edit character-dataset workflow: App viability

**Status:** idea / investigation only. Do not wire anything on this card.

## Source

https://civitai.red/models/2805529/krea2-id-edit-character-dataset-creator-w-tagger-and-optional-rtx50xx-attention-fix

Shared with the user 2026-07-28. **The link needs the user's VPN on** — it was not
reachable when the card was written, so nothing below is verified. First step of the
investigation is to actually get the JSON.

## Why it is interesting

Dataset creation is exactly the gap in front of the headline bet. We already ship Krea2
identity edit (MPI-282 / MPI-311) and the character sheet is the keystone artifact of the
LoRA-free character system; a workflow that turns ONE reference image into a spread of
tagged, training-ready shots is the other half of that story — and an obvious App shape
(one input, one big output set) for the App Library that MPI-259 opened.

## What to actually check

1. **Get the graph.** Download the workflow JSON with the VPN on. Convert browser to API
   form if needed (`scripts/workflow-to-api.mjs`) and read the node graph end to end.
2. **Does it do the right job?** Identity actually held across the set, or drift after a few
   edits? Real variation in pose/angle/expression/lighting, or the same face pasted on the
   same body? Resolution and framing usable as LoRA training data? Is the variation driven by
   a prompt list, a batch seed sweep, or something smarter?
3. **What does it need that we do not have?** Every custom node and weight: already shipped,
   installable, or blocked. Watch the usual traps — node lock, licence (non-commercial weights
   are out), download size, and whether a node exists on the Pod image at our pinned ComfyUI.
4. **The tagger.** Which tagger/captioner is it (WD14, JoyCaption, Florence2, an LLM node)?
   We already have the `image_descriptor` harness + Describe-Image radial from MPI-299/308 —
   decide: keep theirs, swap to ours, or use a different LLM. Ours means no extra dependency
   and one captioning surface across the app; theirs may produce booru tags that a trainer
   actually wants. Compare output shape against what LoRA trainers consume.
5. **The RTX 50xx attention fix.** Almost certainly a sage/flash-attention patch node. Our Pod
   image pins its own attention stack and the local engine has its own install — assess
   whether this is needed, a no-op, or actively harmful in our engines. Default expectation:
   strip it. Do NOT copy an attention patch into our graph without evidence.
6. **Shape it as an App if it survives.** One reference image in, N tagged images out; step
   carousel per `docs/playbooks/add-app/`. Note what the App would need that the App
   foundation does not have yet (batch output handling, a zip/export step, tag file writing
   next to each image).

## Likely outcome to keep in mind

The valuable part may be the *recipe* (prompt spread + tag pass), not the graph. Cannibalising
it into an in-house Krea2 workflow we already own beats importing a third-party graph with a
node tail. Say so explicitly in the recommendation if that is where it lands.

## Related

- MPI-259 — Apps v2 (App Library plumbing; Head Swap = app 1)
- MPI-282 / MPI-311 — Krea2 masked/identity edit, shipped → `docs/models/krea2/`
- MPI-299 / MPI-308 — `image_descriptor` harness + Describe-Image radial (the in-house captioner)
- `docs/playbooks/add-app/` — the playbook any build would have to follow
