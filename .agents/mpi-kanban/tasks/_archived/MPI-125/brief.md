# MPI-125 Brief — LoRA settings UI: clip knob is per-TEMPLATE

## Decision

The LoRA settings UI clip knob is **set by the template's LoRA-node capability**,
NOT by per-LoRA detection. The user can add any LoRA at any time, so live
safetensors-header introspection in the UI is overkill and the wrong layer. The
template decides which strengths are real:

- **Wan template uses MODEL-ONLY LoRA nodes** → the Clip slider does nothing →
  **REMOVE Clip from the Wan LoRA UI** (this is the misleading part — the UI
  offers a knob the workflow can't consume).
- **LTX template uses clip-capable LoRA loaders** (standard `LoraLoader`, model+clip;
  being added 2026-06-24) → **KEEP Strength + Clip for LTX.**

So the UI mirrors the workflow per model family: drop Clip where the template's
nodes are model-only, keep it where they accept clip.

## Why per-template, not per-LoRA

- The clip slider being inert is a property of the **node** the template wired, not
  of every individual LoRA. Wan's nodes don't take clip at all → no LoRA can use the
  clip knob there.
- A clip-only LoRA (e.g. abliterated/heretic encoder LoRA = 100% `text_encoders.*`)
  only works if the template has a clip-accepting loader. LTX gets those loaders, so
  LTX can support clip LoRAs; Wan does not.
- Background data (safetensors headers, verified): the 4 LTX-2.3 capability LoRAs are
  model-only; the heretic LoRA is clip-only. This explains WHY the knobs matter, but
  the UI keys off the template, not the file. See
  `docs/builder/research/lora-strength-law.md`.

## Scope
1. Find where the LoRA settings UI renders Strength + Clip (Model Manager / the LoRA
   settings surface shared with the Wan flow).
2. Drive the clip slider's visibility off the active model family / template
   (Wan = hide clip; LTX = show clip).
3. Verify: Wan LoRA settings show Strength only; LTX show Strength + Clip.

## Pointers
- `docs/builder/research/lora-strength-law.md` (model-only vs clip-only evidence)
- memory: `feedback_lora_ab_use_strength_not_bypass`
