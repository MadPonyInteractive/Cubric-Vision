# MPI-610 Validation

## What shipped 2026-08-23

The Character Sheet now declares **two model slots and two LoRA racks**, the shape
`scribble-object` ships. **No Krea 2 machinery was removed** — the ClownsharKSampler ladder
(#72 #162 #311 #436), both its `ToBasicPipe`s, `Input_is_Turbo`, `Input_Negative`,
`Input_Bypass_Filter_Lora`, the accelerator LoRA and the `qwen_image` VAE are all untouched,
and the edit script asserts the ladder and the pipe count rather than trusting that.

| slot | phase | candidates | graph |
|---|---|---|---|
| **Render model** | sheet generation | `krea2`, `krea2-nsfw` | `Input_Base_Model` #55 — already titled, no graph change |
| **Blend model** | head removal | `klein-4b` (recommended), `klein-9b` | #726 → `Input_Edit_Model`, #724 → `Input_Edit_Clip` |

`models[0]` is `klein-4b`, deliberately unlike scribble-object which recommends 9B: 4B is what
the graph bakes and what every sheet has ever been judged on, and **9B has never been run on
this flow**. Re-order once someone has.

### Graph

- #726 UNETLoader → `Input_Edit_Model`; #724 CLIPLoader → `Input_Edit_Clip` (still the 4B
  bake, `qwen_3_4b`, type `flux2`).
- `Input_Lora_1..6` → `Input_Lora_Phase1_1..6` on the Krea 2 chain (renamed by TITLE, not by
  id — the chain order is 1,4,2,5,3,6 and renaming by position would have scrambled them).
- Six NEW `MpiLoraModel` → `Input_Lora_Phase2_1..6` (#778–#783), chained between
  `Input_Edit_Model` and `Set_klein model`. Cloned from **this graph's own #141**, not
  scribble's donor: same class, but the MpiNodes `ver` pin matches the rest of this file.
- One node repositioned, `#729 Set_klein model` → x 2320, so the phase-2 chain reads
  left→right instead of doubling a 2000px wire back over itself. Every other surviving node's
  `pos`/`size` asserted byte-identical.

Putting the rack before the `SetNode` (rather than after the `GetNode`) is what gives it to
**both** Klein consumers — the `LanPaint_KSampler` that removes the head AND the
`MaskDetailerPipe` refinement that follows it. Both resolve to #783 in the API twin.

### Descriptor + injection

`requiredModels` gains the labelled blend slot with `loras: true`; `modelParams` gains the two
Klein arms with `Input_Edit_Clip.clip_name` in the **dotted** form — `clip_name` is not on
`comfyController._inject`'s spray list, so a plain key would match the node and write nothing.
The encoder moves WITH the checkpoint: 9B on 4B's `qwen_3_4b` dies with a shape error that
reads as a LanPaint bug (MPI-600).

## Evidence

| check | how | result |
|---|---|---|
| graph edit is surgical | node-level diff before/after | exactly the 6 retitles + 2 titles + 6 new + #729; nothing else |
| structural + type | `validate_node_input` re-implemented against 48188 `/object_info` | **PASS**, 94 nodes |
| injection rules | `node scripts/validate-injection-rules.mjs comfy_workflows/flow_character_sheet.json` | **PASS** |
| live graph | raw loaded into the app engine's own frontend (48188, not the user's 8188 bench), `app.graphToPrompt()` | 144 nodes, **0 missing node types**, no node errors, **0 semantic diffs** vs the regenerated API twin |
| node suite | `npm test` | **727/727** |
| desktop suite | `npx playwright test --config=playwright.desktop.config.js` | **26/26** |
| lint | `npx eslint js/ --max-warnings=0` | clean |

New/changed tests:

- `flow-model-choice.test.cjs` — the blend slot's two arms (transformer + dotted clip, per
  arm), the 4B arm restating the bake, a blend pick not disturbing the render pick, and a new
  test walking the phase-2 rack node-by-node from `Input_Edit_Model` through to
  `LanPaint_KSampler`. Its two one-slot expectations were updated to two.
- `inject-params-titles.test.cjs` — gains `input_base_model` / `input_edit_model` /
  `input_edit_clip`, both phase racks, and asserts the flat `Input_Lora_N` form is GONE.
- `flow-lora-button.spec.js` (desktop) — see below.

## 🟡 A red release gate found and repaired — MPI-608's, not this card's

`tests/desktop/flow-lora-button.spec.js` had been **failing since e0173e5d**. MPI-608 deleted
the flow's `LoRAs` action button (one flow-level button cannot name two racks) and did not
update the spec, which kept asserting it. The desktop suite gates the release AND runs in CI
on every push, so it was red on master.

Repaired rather than deleted, because the coverage it lost is exactly this card's contract:
the spec now mounts the Flow Library, opens the Character Sheet's detail panel by clicking its
tile, and asserts **two labelled slots, two cogwheels, and that they emit
`{modelId:'krea2'}` and `{modelId:'klein-4b'}` respectively** — the new silent failure being
both cogwheels naming the same model. It mounts the library directly rather than via
`Events.emit('flows:open')`, which the shell gates on an installed engine the E2E profile
deliberately lacks.

Same sweep found and healed MPI-608's doc debt, since the character sheet is its worked
example: `docs/playbooks/add-flow/ui/lora-rack.md` documented the fully retired
`settingsModel` / `loraModelId` / `action: 'settings'` vocabulary end to end.

## 🟡 The one check NOT done — a live run

**No sheet has been generated.** Everything above proves the graph the server would receive,
the params the pick resolves to, and the UI that collects it — none of it proves a picture.
That is a GPU run and it was deliberately not taken: the bench reported **3.4 GB free of
16 GB** with `torch_vram_free` at 24 MB, and the user's app is live on 48188.

**What closes this card** (Fabio): Flow Library → Character Sheet → pick a Render model and a
Blend model → run → judge real sheets, **including at least one on the `klein-9b` blend arm,
which has never been run on this flow.** Also worth one pass with a LoRA loaded in the Blend
model's rack, since phase 2 is new.

If the 9B arm dies with a tensor-shape error, read `Input_Edit_Clip.clip_name` first — that is
the MPI-600 failure and it reads as a LanPaint bug.

Note this card sits on top of **MPI-603**, whose own live run is also still outstanding
(`../MPI-603/validation.md`). One session at the app covers both.
