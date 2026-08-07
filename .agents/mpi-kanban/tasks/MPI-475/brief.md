# MPI-475 — MiniMax H3 ref2va as a separate model

**1.4 release blocker** (MPI-450 Gate E). Uncarded until 2026-08-07.

`ref2va` is the reference-to-video half of H3 and the vehicle for the LoRA-free
character bet: a character sheet in, a consistent character out, no training.

## Why it cannot ride on minimax-h3 (fl2va)

Three independent reasons, any one of which is sufficient:

- **Different DiT.** `minimax_h3_ref2va_pruned_int8_convrot` is 20.97 GB *on top of*
  fl2va's. Separate weights, separate dep entries, separate install decision.
- **No keyframe path.** `MiniMaxH3ReferenceToVideo.execute` sets `minimax_refs` and
  never `minimax_keyframes`. It cannot express start/end-frame conditioning at all,
  so it is not an op on an i2v model — it is a different model.
- **Different required inputs.** It additionally takes `audio_vae` and
  `ref_image_size`, neither of which fl2va has.

Confirmed against the shipped engine: `comfy_extras/nodes_minimax_h3.py` is
**byte-identical** between engine v0.30.0 and bench v0.30.2 (md5 `422138bb…`), so no
engine bump is owed for this. Only v0.30.0 publishes a Windows portable build, so
there is nothing to bump to anyway.

## What is already DONE (and proved by output)

The combinatorial problem is solved. Core takes its references through AUTOGROW
slots (`ref_images.ref_image_0`, …), which a host app cannot grow at inject time —
covering every "which references did the user supply" combination would need one
pre-authored branch per combination, 2**18 of them.

**`MpiH3References`** (in `c:\AI\Mpi\ComfyUi-MpiNodes\h3.py`) takes all 18 slots as
flat, always-present optional inputs, drops the empty ones, and renumbers the
survivors from 0 so core's index-based soundtrack pairing still lines up. It
delegates the conditioning to core's own `MiniMaxH3ReferenceToVideo` rather than
copying its tensor maths, so it cannot drift.

"Empty" is detected exactly, not heuristically: the Mpi loaders with
`block_if_empty` OFF emit a 1x1 image and a 1-sample waveform, neither of which real
media can be. A genuinely black reference reports its true size and a genuinely
silent clip its full sample count — both pass through.

**Proved end to end on the bench 2026-08-07**: prompt `8da14ac3`, one reference image,
14 empty slots dropped, `Output_Video` written. `python h3.py` also runs an
assert-based self-check covering the renumbering, the pairing-after-a-gap, and both
sentinels.

## Traps this model brings (all verified against source)

- **Prompt tags are 1-based per type and the audio sequence is SHARED.** A reference
  video's soundtrack consumes an `<Audio j>` and is emitted *before* its `<Video k>`,
  so a standalone clip after one is `<Audio 2>`, not `<Audio 1>`. The node's
  `ref_tags` output reports the map; the app must build the tags, not the user.
- **`ref_image_size` is a COMBO widget, so it is not addressable by the plain title
  spray.** Drive it with the `Title.widget` form (MPI-359) —
  `params['Input_Refs.ref_image_size']`. It must stay an UNLINKED widget: injection
  has `if (_isLink(cur)) continue`, so a wired Primitive combo makes it uninjectable.
- **Do NOT crop or resize references app-side.** Both `match` and `max` are
  aspect-preserving, down-only scales done by the node, and neither crops. fl2va crops
  because a keyframe literally becomes frame 0 / frame N-1 of the output; a reference
  never touches the canvas, it is conditioning tokens with their own latent dims.
  Cropping only throws away identity. Capping uploads at a 2048 short edge is the one
  worthwhile app-side step, since both modes discard everything above it.
- **`max` costs real time and it scales with ref count.** Measured by the user on the
  bench 2026-08-07 with ONE reference: `match` 11-12 s/step, `max` 14 s/step (~20%).
  Reference tokens ride through EVERY sampling step, so nine refs at `max` is far
  steeper than 20%. Ship `match` as the default and `max` as an explicit
  best-identity toggle — a character sheet needs `max`, because `match` squashes the
  sheet to the output's pixel area and each view loses readability.
  The quality side is measured too: the user reported a **noticeable improvement at
  `max`** on the same bench run, and that was at a low test resolution where the gap
  should be at its narrowest. So the toggle earns its cost — it is not a
  theoretical knob.
- **Ref videos**: under 5 frames raises, longer than the output is truncated to
  `frame_count`, then floored until `n % 17 == 5`. Qwen sees them at 2 fps.
- **No second licence dialog, and that is deliberate.** Acceptance receipts are keyed
  by LICENCE id (`minimax-h3-cla-2026-08-02`), not model id, so accepting during a
  fl2va install already satisfies ref2va. Do not read the silent second install as a
  bug (confirmed by the MPI-451 session).
- **Weights come from the publisher's own repos and are NEVER re-hosted on R2** — the
  licence forbids redistribution. Same rule as MPI-452.

## Remaining scope (the Vision side)

1. Dep entries for the ref2va transformer, pointed at the publisher URLs.
2. `models.js` ModelDef `minimax-h3-ref2va` (`type: 'h3'` reuses the ratio ladder).
3. `progressStages` — needs a live run to count bars.
4. Media-slot declarations: 9 image, 3 video, 3 audio. Existing fleet convention is
   `Input_Image` / `Input_Image_2` / … (first slot unnumbered), confirmed in
   `commandRegistry.js`.
5. The `ref_image_size` control and its `Input_Refs.ref_image_size` param.
6. Prompt-tag construction for `<Picture i>` / `<Video k>` / `<Audio j>`.
7. Type-consumer sweep, per `docs/playbooks/add-model/`.
8. **The PromptBox chip row must scroll.** No shipped model comes close to this many
   media slots — ref2va can hold 15 chips (9 image + 3 video + 3 audio) and they will
   overflow the box. Raised by the user 2026-08-07. Read
   `docs/component-contracts.md` PromptBox section before touching it; the chip strip
   already carries a reorder fast path and a role-repaint fix (MPI-466) that a layout
   change must not break.

Run `/mpi-add-model` — it enforces the playbook, which holds every other known trap.

## Related

- `MPI-452` — fl2va, the prior art and the shared licence gate.
- `MPI-449` — the H3 research card (weight matrix, feasibility numbers).
- `MPI-450` — the 1.4 umbrella; this is Gate E content.
- Memory `project_lora_free_character_system` — why this model matters commercially.
