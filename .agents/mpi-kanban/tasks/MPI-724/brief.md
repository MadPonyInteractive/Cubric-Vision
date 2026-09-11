# MPI-724 — A LoRA rack at the top of the PromptBox settings popup

## The hole

The cog in the PromptBox opens a settings popup carrying **knobs for the current model**
(style, stylization, ratio, tier, denoise, …). It says nothing about which **LoRAs** that
model is running. To see them — or nudge a strength, or bypass one for a single take — the
user leaves the prompt, opens the model picker, clicks *LoRA & Upscale*, lands in
`MpiModelSettings`, changes the value, closes two surfaces and comes back. Four clicks and
a lost context for a knob that belongs next to the prompt.

MPI-356 deliberately stripped the popup back to *parameters only*: "anything that picks a
FILE belongs on the model card, only knobs belong here"
(`MpiPromptBox.js`, § *Settings popup content*). **This card does not reverse that.** The
rack picks no file, offers no dropdown, adds no slot. It reads out what is already
assigned, plus the two knobs belonging to each assignment — strength and bypass. Adding,
removing or re-pointing a LoRA stays on the model card.

## What ships

At the **top** of the popup, under a **`LORAS`** label, one row per **filled** LoRA slot of
the currently selected model:

| part | behaviour |
|---|---|
| name | a label/badge. Not selectable, not clickable, not a dropdown |
| strength | one number input per knob the model declares (`loraStrengths`: `model`, `clip`, or both) |
| bypass | the same button as the overlay — pressed = injected at strength 0, nothing saved is lost |

- One LoRA added → one row. Two → two rows.
- **No LoRAs → nothing at all**: no label, no rows, no placeholder. The rack occupies zero
  height.
- A model with **staged** LoRAs (Wan: `HIGH NOISE` / `LOW NOISE`) → one labelled group per
  stage that has a filled slot, instead of the single `LORAS` label.

## Both surfaces stay in step

Changing a strength or a bypass in the rack updates `MpiModelSettings`, and changing it in
`MpiModelSettings` updates the rack — **live, both directions**, not just on reopen. One
value, two views.

## Where the data lives

`project.modelSettings[modelId].loras` — written today by `MpiModelSettings._autoSave()` as
`settings:model:update { modelId, key: 'loras', value }` with no `opName` (`loras` is a
legacy model-wide key, allow-listed in `projectService._MODEL_WIDE_KEYS`). Two shapes:

- flat — an array of `LORA_COUNT` (6) `{ name, strengthModel, strengthClip, bypass }`
- staged — an object keyed by `model.loraStages[].key`, each an array of the same

The rack reads and writes **that same key in that same shape**. No new persistence, no
schema change, no engine work: bypass-at-zero injection already shipped with MPI-223.

`MpiModelSettings` keeps its six fixed slot pickers exactly as they are — it is the only
place a LoRA can be **added**, so collapsing its empty slots would remove the way to add
one.
