# MPI-473 Validation

## What shipped

`Preview_Only` **and its twin `Is_Continue`** removed as standalone injected params.
The preview gate now reaches the graph by exactly one route — the `MpiStageLatents`
widgets `Input_Video_Latent.is_preview` / `.is_continue`.

The twin was NOT in the brief. It was folded in because it is the identical defect on
the adjacent line of the same block: `grep -rl "Is_Continue" comfy_workflows/ --include=*.json`
returns **zero files**, same as `Preview_Only`. Fixing one and leaving the other would
have left the next reader with a half-corrected block claiming a node that does not exist.

| File | Change |
|---|---|
| `js/services/commandExecutor.js:661-686` | `params['Preview_Only']` + `params['Is_Continue']` deleted; the two values become local consts `_isPreview` / `_isContinue` feeding `Video_Latent.is_preview` / `.is_continue` |
| `js/services/commandExecutor.js:833` | canonicalization comment no longer lists `Preview_Only` as a bare key |
| `js/services/comfyController.js:1217-1235` | the whole defensive guard + its `clientLogger.warn` deleted (20 lines) |
| `js/services/generationService.js:690-691` | jsdoc named a param that is never injected |
| `js/services/generationService.js:982-987` | dead `const { Preview_Only: _skip, ...frozenInjection }` destructure → plain spread |
| `js/components/Organisms/MpiPromptBox/PromptBoxControls.js:320` | comment claimed the control sets a boolean node; it returns `{}` |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:1117` | comment named the retired key |
| `js/data/modelConstants/models.js:1250` | **factually wrong**, corrected |
| `js/data/modelConstants/resolveModelDeps.js:232` | **factually wrong**, corrected |
| `comfy_workflows/scripts/workflow_generation/generate_h3.py:14` | header contradicted its own `BAKED_WIDGETS` at line 83 |
| `tests/resolve-model-deps.test.cjs:367` | same wrong H3 claim in a test comment |

## Correcting the record on H3

Three files said MiniMax H3 "picks between passes with `Input_Preview_Only` /
`Input_Is_Continue`". That is **wrong**, not merely stale. `minimax_h3_fl2va.json` node
**320** is an `MpiStageLatents` titled `Input_Video_Latent`, and `generate_h3.py`'s own
`BAKED_WIDGETS` bakes `(STAGE_TITLE, "is_preview", False)` / `("is_continue", False)`.
H3 migrated with everyone else. These were corrected, not deleted.

## PASSED — evidence

| Claim | Evidence |
|---|---|
| No graph consumes the removed keys | `grep -rl "Preview_Only" comfy_workflows/ --include=*.json` → **0 files**. Same for `Is_Continue` → **0 files**. All three video models (LTX, WAN, H3) gate through `MpiStageLatents`. |
| Nothing else produced them | `grep -rn "Preview_Only\|Is_Continue"` over `js/`, `tests/`, `routes/`, `*.cjs`, `*.mjs` → only the surviving explanatory comments and the LTX tombstone guard |
| The deleted guard was doubly unreachable | `commandExecutor.js:839-844` (the `Input_` canonicalization pass) already `delete`d the bare key before dispatch, so `params.Preview_Only !== undefined` could never fire even before this change |
| The live wire is unchanged | Pure temp rename. `_isPreview` holds the identical expression `historyMode === true ? false : (previewOnly === true)`; `_isContinue` holds `isStage2 === true`. `Video_Latent.is_preview` / `.is_continue` still emitted for every `_ms` op. |
| Suite green | `npm test` → **482 pass / 0 fail** (16.8s) |

The LTX tombstone guard in `generate_ltx.py:112` (hard-fails if `Input_Is_Continue` /
`Input_Preview_Only` / `Input_Text_to_video` reappear in a re-export) is **deliberately
kept**, as the brief instructs.

## LIVE VERIFICATION — PASSED (user, 2026-08-07)

Run by Fabio in the app on a real engine, reported passed:

- [x] A multi-stage preview generation still stops at preview
- [x] Preview → Continue still resumes from the staged latent
- [x] The `[comfy] Preview_Only requested but workflow has no matching node` warning is gone from the console

This was the one thing the offline proof could not cover. `_buildParams` is module-private
and `commandExecutor.js` will not import into bare Node (it pulls `/js/utils/icons.js` by
absolute browser path), so there is no offline harness for the gate — the live run was the
only way to exercise it. Recorded as the user's observation in the app; this session did
not read the engine `/history` itself.

## Note — concurrent session

This tree was being written by another session during this work: `js/components/types.js`
and `js/utils/promptReuse.js` changed with no edit from this card, and
`generationService.js` reported modified-on-disk mid-edit. All nine of this card's edits
were re-read off disk afterwards and are intact. Commit by explicit pathspec only.

## Docs + rules — DONE (user granted permission 2026-08-07)

11 live sites across 6 rule files and 5 docs. The `docs/archive/` tree was deliberately
NOT touched — it is the historical record of what shipped at the time.

| File | Change |
|---|---|
| `.claude/rules/comfy_injection.md:85` | the `Input_Preview_Only` title-map row → `~~struck~~ DELETED with its node`, matching the file's own MPI-421 convention on the row above. Covers the `Is_Continue` twin. |
| `.claude/rules/comfy_injection.md:90` | `Output_Preview` fires on `Input_Video_Latent.is_preview=true`, not `Input_Preview_Only=true` |
| `.claude/rules/comfy_injection_multistage.md` (banner) | new bullet under the existing SUPERSEDED banner — the params AND the guard are gone, gate has exactly one route |
| `.claude/rules/comfy_injection_multistage.md:102` | **the worst one.** "Symptom of missing Preview_Only node" told the reader to grep `logs/app.log` for a string that can no longer be emitted. Rewritten to diagnose at the real gate: node title exact, read `is_preview` off the engine `/history`, check `historyMode`. |
| `.claude/rules/component-comfy.md:13,153` | both `previewStage` rows named `"Preview_Only"` (`MpiBoolean.inputs.boolean`) as the target node → the `MpiStageLatents` `is_preview` widget |
| `.claude/rules/component-state.md:47,49` | injected-key names |
| `.claude/rules/component-events-blocks.md:127`, `components.md:23` | `historyMode` forces the gate, named correctly |
| `docs/workflow-authoring/injection.md:71` | "Preview toggle dual-emits" → emits ONE key, on a widget |
| `docs/playbooks/add-model/README.md:92` | the `_ms`-mismatch trap listed the warning as a symptom; the 400 is now the only signal |
| `docs/project-integrity.md:119` | `frozenParams.injectionParams` no longer "excludes `Preview_Only`" |
| `docs/models/h3/README.md:154` | "`_buildParams` emits it" — the key moved |
| `docs/models/ltx/workflow-authoring.md:78` | claimed `generate_ltx.py` stamps `Input_Is_Continue`; it stamps the widgets and BANS that title |
| `docs/builder/research/pod-perf-investigation.md:98` | research finding whose conclusion holds but whose node names don't. Added a dated "mechanism restated" block ABOVE the original rather than rewriting a finding. |

**Left alone deliberately:** the HISTORY body of `comfy_injection_multistage.md`
(lines 52-88). Its own banner already says those sections are kept for the reasoning and
to trust the banner over them; rewriting it wholesale is its own task, as that banner
states.

**Noticed, not actioned:** `comfy_injection_multistage.md:88` ("THE VALIDATION TRAP")
still says `WORKFLOW_INPUT_DEFAULTS` staging is "still in force for latents", which the
MPI-466 paragraph 6 lines below it contradicts outright. Pre-existing drift from MPI-466,
not this card, and inside the banner-covered history body.
