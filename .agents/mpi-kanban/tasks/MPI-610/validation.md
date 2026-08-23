# MPI-610 validation — graph half

Run 2026-08-23. All against the on-disk files, none taken on trust.

## 1. Link-graph integrity (LiteGraph source)

The same validator run against the PRE-surgery backup and the post-surgery file, so a
pre-existing complaint could not be mistaken for damage.

| check | result |
|---|---|
| duplicate link ids | none |
| link → node/slot resolves both ends | all 138 |
| `input.link` round-trips to a link naming that node+slot | all |
| `output.links` round-trips to a link starting at that node+slot | all |
| every `GetNode` variable has a `SetNode` | yes |
| `last_node_id` / `last_link_id` ≥ max in use | 782 / 1597 |
| duplicate `Input_*` titles | none |
| unconnected non-widget inputs | **15, all pre-existing** — identical set in the backup (`MpiAnySwitch.any_3..5`, `SAM3_Detect` bbox/coords, `MaskDetailerPipe` opt inputs, `MpiMath.b/c`) |

Node/link count 145/175 → 124/138.

## 2. Conversion

`node scripts/workflow-to-api.mjs comfy_workflows/raw/flow_character_sheet.json` — exit 0,
no stderr. API 95 → 84 nodes. Diff is exactly the intended set:

```
removed: 56 72 77 143 160 162 245 282 283 290 311 312 436 440 560 617 619 621
added  : 775 776 777 778 779 780 781        (782 Get_klein vae is virtual, collapsed)
```

Spot-checks in the API output:

```
55  UNETLoader  Input_Edit_Model  {"unet_name": "flux-2-klein-4b-int8-convrot.safetensors", ...}
69  CLIPLoader  Input_Edit_Clip   {"clip_name": "qwen_3_4b.safetensors", "type": "flux2", ...}
141 Input_Lora_1                  {"model": ["55", 0]}
777 CFGGuider                     {"cfg": 1, "model": ["139",0], "positive": ["51",0], "negative": ["57",0]}
776 Flux2Scheduler                {"steps": 4, "width": ["771",0], "height": ["772",0]}
493 MpiClearVram                  {"passthrough": ["781", 0]}
```

## 3. Injection rules

```
node scripts/validate-injection-rules.mjs comfy_workflows/flow_character_sheet.json
✓ comfy_workflows/flow_character_sheet.json
All 1 file(s) conform to the injection rules.
```

## 4. Engine validation (stand-in for ComfyUI's `validate_prompt`)

84 nodes checked against the live `/object_info` on 127.0.0.1:8188:

- every `class_type` installed
- every REQUIRED input present
- every link resolves to a node that really has that output slot
- no node consumed by nothing that is not an output node

`OK` on all four. This is static — it proves the graph is dispatchable, **not** that the
sheet looks good.

## 5. Test suite

```
node --test "tests/inject-params-titles.test.cjs"   14/14 pass
node --test "tests/*.test.cjs"                      725 tests, 722 pass, 3 fail
```

The 3 failures are all in `tests/flow-model-choice.test.cjs`, all the DESCRIPTOR half's,
and all in a file a live peer holds:

1. `every modelParams title EXISTS in the flow workflow` — `flowsRegistry` still names
   `Input_Base_Model`.
2. `the Character Sheet arms match the weights and the twin graph` — hardcodes
   `Input_Base_Model` + `Input_Bypass_Filter_Lora` + the `krea2_t2i_nsfw.json` twin.
3. `the injector can actually WRITE both arms` — the same two titles.

Nothing is committed; the graph must land with the descriptor or master goes red.

## NOT validated

**No sheet has been generated.** No Klein sheet has been compared against a Krea 2 sheet,
at either size. That comparison is what closes this card and it is Fabio's, not a
test's — Krea 2 was chosen for a reason and nobody has re-tested that choice.
