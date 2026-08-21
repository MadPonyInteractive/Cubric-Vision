# MPI-590 — a Flow accepts any of a set of models, and the user picks

**Fabio, 2026-08-20:** *"all right, let's go with three. User can select the model. Best place to
put it is probably with a dropdown in the slide over before opening the flow."*

Option 3 of the three put to him. Option 1 (silently treat `krea2-nsfw` as satisfying `krea2`)
was rejected on its own merits: it would run the sheet on the NSFW bake for a user who never
asked for that. **The user chooses; the app does not choose for them.**

## The bug this fixes

`getFlowAvailability` in `js/data/flowsRegistry.js`:

```js
const missing = (flow.requiredModels || []).filter(id => !installed.includes(id));
```

Exact ids, ANDed. Character Sheet declares `['krea2', 'klein-4b']`. A user with **only**
`krea2-nsfw` installed is told the flow needs models and is pointed at a **12.25 GB** download
for the same architecture with a different bake.

## Two halves — the second is the real work

### 1. The gate takes an any-of set

Minimal shape, no new registry concept, every existing flow untouched:

```js
requiredModels: [['krea2', 'krea2-nsfw'], 'klein-4b']   // an array entry = any-of
```

**Do NOT reach for `modelFamily`.** MPI-316 deliberately *removed* that field from both krea2
cards: it drives the H/B/L tier letter, and these two are **content variants (SFW/NSFW), not
tiers**. Re-adding it renders "Krea 2 NSFW H" again — the exact bug MPI-316 fixed. Read the
comment on the `krea2` ModelDef before touching this.

Sweep every consumer of `requiredModels`, not just the availability badge — the shape change
is on a shared primitive.

### 2. The picked model has to reach the graph — today it cannot

`comfy_workflows/flow_character_sheet.json` node **55**:

```json
"UNETLoader": { "unet_name": "krea2_raw_int8_convrot.safetensors", "weight_dtype": "default" }
```

Hardcoded, no `Input_*` title, so **nothing injects it**. The NSFW arm needs
`lustify-v10-krea-raw-int8_convrot.safetensors` (dep `krea2-raw-transformer-nsfw`).

So this card carries a **workflow change plus an injection param** — title the node injectable,
or route it through an MpiNodes switch. **The failure mode to design against is a picker that
renders, saves, and silently changes nothing**, which is exactly what a UI-only implementation
produces. It is also precisely the bug MPI-504 found in the LoRA panel: the panel opened, saved
real slots, and produced an identical image because `loraModelId` never crossed.

### Do not forget `settingsModel`

`settingsModel: 'krea2'` on the FlowDef names **whose LoRA rack** the Flow's settings button
opens, and whose slots reach `commandExecutor` as `loraModelId` (MPI-504). It must follow the
picked model — otherwise a user on the NSFW card edits the SFW rack and gets no LoRAs, silently.

## The UI, as placed by Fabio

An **MpiDropdown** in the Flow Library's slide-over detail panel, **before** the flow opens.

- List only the **installed** members of the set — a set with one installed member needs no
  picker at all.
- `MpiDropdown`, never a bare `<select>` (MPI-582, `mpi/no-bare-form-control`).
- **Open:** where the choice persists — `project.json`, a flow-level store, or not at all
  (session-only). Not decided; pick one and say why.

## Procedure

`docs/playbooks/add-flow/` — this changes the **FlowDef contract**, so
`01-descriptor-and-ops.md` is the page that must be updated, not a new doc.
`docs/workflow-authoring/` for the injectable node.

## Verify

- A profile with **only** `krea2-nsfw` installed sees Character Sheet as READY, picks it, and
  the dispatched graph really loads the lustify weight — check `/history`, not the UI.
- The same profile's LoRA slots reach `Input_Lora_N`.
- A profile with both installed gets a two-entry dropdown; one with only `krea2` gets none.
- Every other flow still gates exactly as before.
