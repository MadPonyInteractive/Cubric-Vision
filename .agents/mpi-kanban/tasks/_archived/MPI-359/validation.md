# MPI-359 — validation

Commits: `891d4415` (build assert), `d61e84f5` (raw sources, by the sync script),
`86460c82` (graphs + app + docs + guards).

## Done

| acceptance | state | evidence |
|---|---|---|
| krea2_t2i_sfw/nsfw on the new rack | ✅ | one `MpiStyleSelector` titled `Input_Style_Selector`, 2 chained `MpiStyleLoras`, 10 trigger lines |
| qwen_edit migrated | ✅ | same shape, 7 lines, slots 8–10 `None` |
| index alignment vs `styleLoraLabels` | ✅ | every lora filename AND trigger line is byte-identical to the old rack, slot for slot (diffed `HEAD:` vs the new files) — the labels were aligned to the old rack, so they stay aligned |
| `_assert_style_rack` rewritten | ✅ | bites on: wrong selector title, linked selector/strength widget, bank off the chain, forked chain, more lines than slots, a LoRA past the last line. Passes: legal `None` slot inside range, a trailing empty bank slot |
| `tests/inject-params-titles.test.cjs` selector guard | ✅ | passes on all 3 migrated files; negative control (retitle `Input_Style_Sel`) fails it |
| legacy `Input_Style` / `Input_Stylization` keys removed | ✅ | no graph carries those titles; both controls emit only the dotted keys |

Full suite: 201/210 pass. The 9 failures are **pre-existing** — reproduced identically
in a clean worktree at `HEAD` before this work (permodel-key-allowlist ×3 — stale since
MPI-336 replaced `_MODEL_WIDE_KEYS` with `modelWide:true`; optional-media-placeholder;
resolve-model-deps `LTX_t2v.json` case; runpod-remote-hardening ×4).

## Found on the way (fixed here)

`comfyController` step 3b healed path separators for a fixed key list containing
`lora_name`. `MpiStyleLoras` names its slots `lora_1..lora_5`, so the migration would
have silently dropped the heal for every style LoRA — baked `krea-2\style\x` shipped to
a Linux Pod 400s with `value_not_in_list`. Now matched by shape (`/^lora_\d+$/`);
`tests/lora-path-separator-heal.test.cjs` covers both directions.

## Closed (2026-07-27)

1. **`dev_configs/node_lock.json` bumped** `aaa1d2d9` → **`69a43336`** (`origin/main` tip,
   carries `MpiStyleSelector` + `MpiStyleLoras`; the running bench loads that exact tree and
   `/object_info` serves both nodes, so the pack imports at this pin). No Pod rebuild —
   `installRequirements: false`, the `.mpi_node_commit` drift ladder reinstalls on both
   engines. `tests/node-drift.test.cjs` 23/23.
2. **Live verification: USER-VERIFIED** — style picker + Stylization confirmed working on the
   migrated models.

## Not touched (deliberate)

`_findNodeErrorLora` still keys the missing-LoRA toast on `input_name === 'lora_name'`, so a
missing STYLE lora surfaces as a plain 400 instead of the download dialog. Style LoRAs are
model deps (they cannot go missing without a broken install) and the dialog targets user
LoRAs — out of scope here.
