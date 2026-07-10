# MPI-242 — validation

## Thread 0 — docs restructure (2026-07-10) — VERIFIED, auto

Verify mode: `auto` (docs-only, no runtime surface).

| check | result |
|---|---|
| `wc -l docs/krea2/*.md` — every file ≤200 | ✅ 55 / 85 / 94 / 102 / 116 / 119 (571 total) |
| `grep -rn 'krea2\.md' --include=*.md .` — no stale refs | ✅ zero hits |
| `docs/krea2.md` deleted, no stub | ✅ absent |
| all 12 intra-folder markdown links resolve | ✅ 12/12 |
| `docs/README.md` routes into `krea2/` | ✅ 6 rows (L59–64) |
| content survived the move — 18 hard-won facts spot-checked | ✅ 18/18 present |
| stale 2K "open question" removed, live verdict present | ✅ both |

`docs/krea2.md` was **untracked** (`git rm` failed with `did not match any files`), so the
split shows in git as 6 new files + a `docs/README.md` edit, not as a rename.

Content was **moved verbatim**, with three deliberate deltas the user approved or the handoff
required:

1. **The 2K open question is resolved.** Old text: *"If it materially improves at 2K, prefer
   `qualityTiers`… Cheap to test; untested."* Replaced by the live verdict (1024×2048 = 61.04 s
   @ 2.00 MP vs 896×1152 = 28.36 s @ 0.98 MP ⇒ **linear in pixels**), the two ÷16-clean 9-entry
   ratio tables, the `ratios.js:274` early-return note (Chroma needs no gating), and the
   `QUALITY_LABELS` `'1k'` gap. User instruction: *"remove that open question. The question has
   been answered."*
2. **NAG-does-not-work was added** to `conditioning-and-control.md`. It was recorded in the
   handoff traps but never existed in `krea2.md`. It is the reason thread 1 exists.
3. **The `Stylization` slider section was added** to `style-loras.md` (handoff
   `split_plan` explicitly directs this), carrying the naming rationale and the still-open
   trigger-scaling question.

## Thread 1 — negative-prompt gate

Not started.

## Thread 2 — app wiring

Not started.

## 2026-07-10 — thread 0 (controls + Output_prompt capture) + thread 1 (sha256)

### Auto-verified (passed)
- `tests/output-prompt-capture.test.cjs` — NEW. Imports the REAL `readComfyOutputText`
  and `stagesFor` (not mirrors). Mutation-tested: breaking `extraBars` makes it fail.
- Suite: 25 pass / 1 fail. The failure (`runpod-remote-hardening.test.cjs`) was proven
  pre-existing by running it in a temp worktree at pristine HEAD — it fails there too,
  with none of this session's code present.
- `eslint` clean on all 9 edited files (incl. the custom component rules).
- R2: all 12 Krea2 objects present, byte-exact (transformer 13,141,730,784).
  Verified twice — `rclone lsf` AND public HTTP HEAD `content-length`.
- `sha256`: 12/12 written. Zero `sha256: null` remain across all 67 deps.
- Dep cross-ref: 21 deps resolve; all 14 weight deps satisfy
  `url == models.cubric.studio/vision/models/<filename>` and carry 64-hex hashes.

### PENDING — user-ux (the card's verify mode)
1. Controls appear on `t2i`/`i2i`, absent on `upscale`/`detail`.
2. Stylization slider is disabled (dimmed, inert) at style index 0.
3. Hovering the enhance toggle shows its cost text in the status bar.
4. Enhance OFF → output identical to before.
5. Enhance ON → prompt box still shows YOUR text; sidecar + Reuse Prompt return the
   EXPANDED prompt, with no style trigger appended.
6. Status bar shows `N/3` (not `N/2`) on an enhanced run.

### PENDING — not verifiable here
- **Remote/Pod path.** `_reconcileFromHistory` reads `/history`; whether it preserves
  `ui.text` like the live `executed` message is UNVERIFIED. Krea2 cannot run on the Pod
  until MPI-244 (controlnet_aux image rebuild) ships, so this cannot be tested yet.
  [[feedback_check_both_engine_paths]]
- **Prompt drift.** The system prompt (t2i node 60) is the actual deliverable per message
  `ebb3a1a4`. Not yet read or tuned. If enhanced output drifts from intent WITH a
  faithfulness-constrained system prompt, escalate — that would mean 4B is too weak.
- **`Output_prompt` end-to-end.** Never live-fired. The payload shape is proven from
  `nodes_preview_any.py` source, not from a real run.

### 2026-07-10 — placeholder trap closed (user authorized the JSON edit)
- `krea2_turbo_t2i.json` node 201 `Input_Image`: `ComfyUI_temp_duvbo_00001_.png` → `placeholder.png`.
  Scripted edit anchored on TITLE (not node id, per the naming law), asserted the old value
  and the 67-node count before/after. Exactly one node changed. File is untracked (never
  committed), so there is no HEAD to diff — the assertions ARE the verification.
- NEW guard `tests/optional-media-placeholder.test.cjs`: every workflow reachable from an op
  with `requiresImages: 0` must bake a filename in `WORKFLOW_INPUT_DEFAULTS`. The optional set
  is DERIVED from the registry, so new models are covered automatically. Required-image ops
  (Chroma upscaler/detailer, resize, img_auto_mask) are exempt — the injector overwrites their
  widget. The test also cross-checks its STAGED list against routes/comfy.js so the two cannot drift.
- Verified the guard FAILS on the real bug before the fix (named file+node+class+title+remedy)
  and passes after. 16 workflows / 34 media nodes / 0 violations.
- Root cause of the trap: LTX/Wan never rely on memory — their generators stamp the placeholder
  (`generate_ltx.py:76`, `generate_wan5b.py:_stamp_placeholders`). Krea2 has NO template/handler
  (hand-exported straight to comfy_workflows/), so nothing re-applies the stamp on re-export.
  OPEN OPTION: write `generate_krea2.py` (~60 lines) to prevent rather than detect; it would also
  assert `len(MpiPromptList.options) == 9` (playbook §9 — the missing trigger line shipped once).
- ⚠ USER: your pending ComfyUI save will overwrite this file. Set node 201 to `placeholder.png`
  on the canvas before exporting, or the fix reverts. Re-run the guard after saving.

### 2026-07-10 — Krea2 promoted to a GENERATED workflow (user restructured)
User moved the authored graph to `scripts/workflow_generation/krea2_turbo_t2i_template.json`
(the `_template` suffix IS the reminder) and deleted the hand-exported runtime file — which
also deleted the placeholder fix. Correct outcome: the fix now lives in the generator.

- NEW `generate_krea2.py` + `("krea2_", "krea2")` in `registry.py`. No op split (one graph
  serves t2i/i2i/pose via runtime injection), so it emits ONE runtime file. Its job:
  1. `_stamp_placeholder()` — `Input_Image` → `placeholder.png` on every build.
  2. `_assert_style_rack()` — slot N must be gated by `b if a == N`, and
     `len(MpiPromptList.options) == N`. Build FAILS on drift.
- MUTATION-TESTED (all three asserts bite, pristine template builds):
  * 8 triggers / 9 LoRAs      -> REJECTED  (this is the bug that actually shipped once)
  * slot 5 gated by `a == 7`  -> REJECTED  (wrong LoRA would load)
  * `Input_Image` node removed -> REJECTED
- END-TO-END re-export proof: injected a NEW scratch filename into the template, ran
  `orchestrate.py`; it detected the hash change, routed to `krea2`, stamped back to
  `placeholder.png`. The forget-the-placeholder failure mode is now structurally impossible.
- Template retains the user's exported value; only the runtime artifact is stamped.
- Suite 26 pass / 1 pre-existing fail. Placeholder guard: 16 workflows, 34 media nodes, 0 violations.
- Playbook updated: §2 (hand-exported workflows need a handler) + §9 (build-time style-rack assert).

### Verification plan (user, 2026-07-10)
- user-ux verification happens in a SEPARATE session.
- RunPod/remote verification DEFERRED until the RunPod image build (MPI-244) completes.
- => This session ends at a handoff, not at a `done` card.

## 2026-07-10 — session 4: UI + ratio-system fixes (PLAN DRIFT, user-sanctioned)

The handoff said "verification only, do not add features". Attempting the user-ux pass
surfaced four REAL BUGS in the uncommitted code. User's ruling: *"This is just a plan drift
because the plan was misinterpreted"* + *"Fixing wrong things is part of verification."*
None of these are features; each is a defect that BLOCKED the verification checklist.

### Bug 1 — the three new controls were never persisted  ✅ auto-verified
`styleSelect`/`stylization`/`enhancePrompt` are `scope:'perModel'`, which emits
`settings:model:update` with `opName:null`. `projectService` only routes an opName-less
write when the key is in `_MODEL_WIDE_KEYS` — otherwise it logs and DROPS it. All three
were missing. Caught from the user's devtools console:
`[projectService] settings:model:update missing opName for non-model-wide key "enhancePrompt"`.
The control's own comment (`PromptBoxControls.js:75`) already stated the requirement.
- FIX: added all three to `_MODEL_WIDE_KEYS` (`projectService.js:67`).
- GUARD: `tests/permodel-key-allowlist.test.cjs` — parses BOTH files, asserts every
  `perModel` control's key is allowlisted. Mutation-tested (drop a key → fails, names it).

### Bug 2 — style picker was the wrong component  ✅ auto-verified, needs user-ux
Prior session shipped `MpiOptionSelector` `variant:'buttons'` (a horizontal chip strip).
Ten long labels overflowed to ~1280px, clipping off-screen. The user never chose that
component — the handoff recorded it as settled fact. Root cause: `.mpi-opt-sel__grid` is
`display:flex` with no `flex-wrap`; the `--number` and `--ratio` variants each override it,
`--buttons` never did.
- FIX: swapped to inline `MpiDropdown` (`direction:'up'`, `wrapLabels`), `Style` label above,
  reusing the slider's own `slider-lbl`/`slider-name` classes so Style/Stylization align by
  construction. Index-0 label `'No Style'` → `'None'` (display-only; the INDEX is injected).
- The `buttons` variant had ZERO consumers at HEAD and is dead again. NOT deleted
  (pre-existing dead code). Its latent `flex-wrap` trap remains for the next user.
- `tests/output-prompt-capture.test.cjs`: loosened the index-0 assertion from the literal
  `'No Style'` to the POSITIONAL contract (label is free text). Mutation-tested.

### Bug 3 — Krea2's 2K was unreachable + the sidecar lied  ✅ auto-verified, needs user-ux
Krea2 declared `qualityTiers:['1k','2k']`, which auto-flipped `RATIO_MODES.krea2` to
`'quality'`. But `t2i`/`i2i` never registered the `qualityTier` control, so the tier
defaulted to `'medium'` — not a Krea2 tier — and `getModelRatios` silently fell through
`declared[Object.keys(declared)[0]]` to the **1k** table. **2K could not be selected.**
Worse: `generationService.js:821` wrote `orientation: null` for any `'quality'` model, and
`promptReuse`'s quality branch never restored orientation. Reusing a 2K landscape Krea2
image would have restored a 1K portrait one, silently, with no error.

User's design (supersedes the prior flat-9-entry table): **two tiers like LTX, and the ratio
popup keeps the SDXL orientation toggle.** No model had both axes.

- NEW `RATIO_MODES` value `'quality-orientation'`; table keyed `[tier][orientation]`.
- `KREA2_RATIOS` MOVED from the ModelDef into `js/utils/ratios.js`, beside
  FLUX/SDXL/WAN/LTX. User's rationale: *"ratios.js is the source of truth for all ratios —
  that's where I go to get resolutions for my tests."* The MPI-174 declared-ratios path had
  exactly ONE user (Krea2) and saved no file edits here, since the new mode forces four
  other files open anyway. ModelDef keeps only `qualityTiers`.
- **`'1k': FLUX_RATIOS`** (user's suggestion). The two are byte-identical — verified — so
  they are now SHARED BY REFERENCE and cannot drift. This created an aliasing hazard:
  `Object.freeze` is shallow, so `KREA2_RATIOS['1k'].portrait` stayed writable. PROVEN by
  pushing to `FLUX_RATIOS.portrait` and watching Krea2's 1k tier grow to 6 entries. Fixed
  with `deepFreeze` over all seven tables; both mutations now throw `TypeError`.
- `usesOrientation()` / `usesQualityTier()` / `clampQualityTier()` now live in `ratios.js`.
  `clampQualityTier` MOVED OUT of `MpiOptionSelector` — `promptReuse` imported it from a UI
  component, which pulled `MpiButton → icons.js` on a browser-absolute path and made the
  module unloadable under Node. Its `'very_high'` fallback is now `tiers[last]`.
- Sidecar (`generationService`) + reuse (`promptReuse`) now carry BOTH axes.
- `qualityTier` registered on `t2i`/`i2i`, gated on `usesQualityTier(model.type)` — NOT a
  new capability flag, because the ratio table already states it and a second source
  would drift. SDXL/Chroma/Flux never mount it.

### Bug 4 — three regressions I introduced, caught before shipping
1. My first `getModelRatios` fell back to `tiers[0]`, silently downgrading **LTX** from
   `medium` (512px) to `very_low` (384px) on an unknown tier. Fixed: fall back to the
   model's own `'medium'` when it has one. Verified wan/ltx/wan5b return pre-change values.
2. The exhaustive guard caught **four** `mode === 'orientation'` sites my manual sweep
   missed — including `MpiOptionSelector.js:487`, the RUNTIME twin of the header gate.
   `updateUI()` re-renders on every change, so the orientation toggle would have vanished
   on first interaction even though the template drew it.
3. `deepFreeze` initially referenced `SOCIAL_RATIOS` before its `const` — a TDZ
   `ReferenceError` at import. Moved below all declarations.

### Pre-existing bugs found in passing (NOT caused by this work, now fixed)
- `promptReuse.js:6` hardcoded `QUALITY_TIERS = ['very_low'…'very_high']` — no `'2k'`/`'4k'`.
  **LTX 4K clips already lost their tier on Reuse Prompt**, before Krea2 existed. Now
  searches `qualityTiersFor(type)`. Guarded.
- `clampQualityTier` fell back to `'very_high'`, a tier **wan5b does not have** (its tiers
  are low/medium/high). Now clamps to the target's real max.
- `MpiOptionSelector.js:521` `Math.min(currentIdx, len-1)` with `currentIdx === -1` from a
  `findIndex` miss → indexes off the end. Now clamped at 0; newly reachable because Krea2's
  labels differ across orientations.

### Auto-verified (this session)
| check | result |
|---|---|
| full suite | 127 tests / **123 pass / 4 fail** |
| the 4 failures | ALL `runpod-remote-hardening.test.cjs`; **all four fail at pristine HEAD** in a temp worktree, none of this code present |
| eslint (9 changed files, incl. custom component rules) | clean |
| `tests/permodel-key-allowlist.test.cjs` (NEW, 2) | pass, mutation-tested |
| `tests/ratio-modes-exhaustive.test.cjs` (NEW, 5) | pass, mutation-tested |
| `tests/krea2-ratio-roundtrip.test.cjs` (NEW, 6) | pass, mutation-tested |
| 2K reachable | `getModelRatios('krea2','landscape','2k')[0]` = 1472×1472 |
| all 18 Krea2 dims ÷16-clean, every landscape a transpose twin | verified |
| `KREA2_RATIOS['1k'] === FLUX_RATIOS` (identity) | true |
| deep-freeze closes the aliasing hole | both mutations throw `TypeError` |
| gates: sdxl/chroma no tier radio; ltx/wan no orientation toggle | verified via runtime probe |
| no regression: wan/ltx/wan5b/sdxl/flux/chroma/social ratio resolution | all pre-change values |

**NOTE on the handoff's test claim:** it said "26 pass / 1 fail". That was FILE-level. At
test level the suite was 114 tests with **4** failures, not 1 — all four the same
pre-existing RunPod bug. Corrected here so the next session doesn't chase three phantoms.

### PENDING — user-ux (unchanged; nothing below has been seen in a running app)
Everything from the prior session's list, PLUS the new surfaces:
1. Style picker: `Style` label, inline dropdown reading `None`, `Stylization` slider beneath.
2. Slider dimmed + inert at `None`; live on any other style.
3. Dropdown opens UPWARD, 10 entries, long names wrap (no horizontal overflow).
4. **Quality radio `1K`/`2K` appears on Krea2 t2i/i2i** — and NOT on SDXL/Chroma.
5. **Ratio popup keeps the orientation toggle on Krea2** (it must survive `updateUI()`).
6. Selecting `2K` changes the ratio dimensions (1:1 → 1472², not 1024²).
7. Flipping orientation at 2K keeps the tier (16:9 → 1936×1088, not 1024×1024).
8. Per-tier hints in the radio flip with orientation.
9. Positive/negative toggle ABSENT on Krea2 (`negativePrompt:false`, first production use).
10. Style/stylization/enhance survive a reload (the `_MODEL_WIDE_KEYS` fix).
11. Sidecar + Reuse Prompt carry tier AND orientation on a 2K landscape gen.
12. Then the original list: enhancer OFF ≡ pre-change output; enhancer ON → prompt box keeps
    YOUR text, status bar reads N/3, Reuse returns the EXPANDED prompt with no style trigger.

### PENDING — not verifiable here (unchanged)
- Remote/Pod path. Blocked on MPI-244. `_reconcileFromHistory` + `ui.text` still unverified.
- Prompt drift. **Node 60 WAS read this session** (the handoff wrongly said it never was).
  It already carries nine faithfulness rules — rule 1 "Faithfulness First", rule 5
  "Avoid Over-Specification", rule 7 "Respect Existing Detail", rule 9 "Preserve User Medium".
  Two DEFECTS found, left in place at the user's instruction (*"let's run as is and see"*):
  * Rules 7 and 9 each contain a `U+FFFD` replacement char where an em-dash belongs
    (`heavily expanding � preserve`, `to avoid difficulty � match`). Lossy — a non-UTF-8
    round-trip. One-char fix each, in the TEMPLATE, then `python orchestrate.py`.
  * Node 58 sets `thinking:false`, but node 60's text says "Think step by step", "Style
    Planning Stays Internal", and "one cohesive paragraph **after the thinking block**".
    With thinking off there IS no thinking block — the model may inline its planning into
    the visible answer, which would LOOK exactly like over-expansion. **If step 12 shows
    drift, suspect this before concluding the 4B model is too weak.**
  * `use_default_template:true` is NOT moot: node 60's string does not start with
    `<|im_start|>`, so the escape hatch is disengaged and the system prompt rides as
    user-turn text (the standard Qwen3-VL workaround). Correct as-is.
- `Output_prompt` end-to-end. Still never live-fired.

## 2026-07-10 — session 5: user-ux pass (in-app), 4 more defects

The app ran. Checks 1–10 passed by eye except where noted. The user drove; the
findings below came from a real generation + a real sidecar, not from tests.

### VERIFIED IN-APP (checklist items closed)
- `Output_prompt` **LIVE-FIRED** for the first time. Enhancer ON → status bar read
  **3/3** (not 3/2), Reuse Prompt returned the enhanced text. Items 12 (partial) closed:
  the capture contract works end-to-end on the local engine.
- Full-width QUALITY block + `1K`/`2K` radio render; ratio + batch moved to bottom-left.

### Bug 5 — fresh Krea2 project opened on 2K  ✅ auto-verified
`PROMPT_CONTROL_DEFAULTS.qualityTier` is the cross-model `'medium'`. Krea2 has no
`'medium'`, so `clampQualityTier` fell back to `tiers[last]` = **`2k`**. That fallback is
CORRECT for its real job (a reused 4K clip must clamp to the target's max, never drop to
mid) — but a fresh project has no intent to preserve.
- FIX: new `defaultQualityTier(modelType)` in `ratios.js` → falls back to `tiers[0]`.
  `clampQualityTier` UNTOUCHED. Both call sites in `PromptBoxControls` (the tier radio AND
  the ratio popup — they must agree or the popup sizes for 2k while the radio reads 1k)
  now branch: saved tier → clamp; nothing saved → `defaultQualityTier`.
- Verified: krea2→`1k`; ltx/wan/wan5b→`medium` (unchanged); `ltx 4k→wan5b`=`high`,
  `ltx 2k→wan`=`very_high` (reuse clamp still climbs).

### Bug 6 — the style rack never reached the sidecar  ✅ auto-verified, needs user-ux
THE USER'S OBSERVATION: "reusing a prompt did not set the style... nor the stylization
slider." Confirmed from the real sidecar `d42128fe`: `injectionParams` carried
`Input_Style: 3` / `Input_Stylization: 1`, but `controlState.model` held ONLY
`loras`/`upscaleModel`/`qualityTier`. Reuse reads `controlState`, so it restored nothing.
- ROOT: `generationService` builds `controlState.model` from a hardcoded **allow-list**.
  MPI-242's three perModel controls were added to `_MODEL_WIDE_KEYS` (so they PERSIST) but
  never to this **second** list (so they never SNAPSHOT). Same failure shape as bug 1.
- `promptReuse`'s legacy fallback had the same 2-key omission → dropped `qualityTier` too.
- FIX: `generationService` snapshots `styleSelect`/`stylization`/`enhancePrompt`;
  `promptReuse` legacy path copies all four and now runs `_clampReusedTier`.
- GUARD: `permodel-key-allowlist.test.cjs` +1 test — every `scope:'perModel'` control must
  appear in `controlState.model`. Mutation-tested (dropped `stylization` → failed by name).
  NOTE the old guard's blind spot: it proved the keys PERSIST and everyone assumed that
  meant they ROUND-TRIP. It never looked at the sidecar.
- `qualityTier` was a FALSE ALARM: it IS snapshotted and IS restored (proven by running
  `buildPromptReuseSettings` against the real sidecar). It read `1k` because the sidecar
  said `1k`. Reuse was never broken for the tier.

### Bug 7 — sidecar recorded batch 1 for a batch-2 run  ✅ auto-verified
Sidecar `controlState.shared.batch = 1` while `injectionParams.Batch_Size = 2`. `batch` is
`scope:'shared'`, and `settings:shared:update` debounces 300ms — clicking batch then
generating inside that window snapshots the stale count. The ratio reconcile right above it
already guarded this exact race; batch didn't.
- FIX: reconcile `_shared.batch` from `injectionParams.Batch_Size` (the rendered truth).

### Bug 8 — `Input_Batch` never injected (KREA2 **and** CHROMA)  ✅ fixed by re-title
THE USER'S OBSERVATION: "batch of two... only created one image."
The workflow node was titled **`Input_Batch`**. `_buildParams` dual-emit produces
`Batch_Size` (tier-1) + `Input_Batch_Size` (tier-2 alias = `Input_` + bare key). Neither
matches `Input_Batch`, and **injection silently skips unmatched keys** — no error, no log.
- `Chroma_t2i.json` node 2608 has the SAME wrong title → **Chroma's batch is broken on
  shipped code**, independent of Krea2. User is re-titling it.
- FIX (per `.claude/rules/comfy_injection.md`: workflows are read-only for agents; the
  naming law says tier-2 title = `Input_` + bare name): USER re-titled Krea2 template node
  243 → `Input_Batch_Size`; agent re-ran `orchestrate.py`. **Zero JS change.**
- Rejected: adding an explicit `Input_Batch` emit (the `LoadLatent→Input_Video_Latent`
  rename precedent). That entrenches two names for one concept; this is a prefix slip,
  not a rename.
- Verified: node 243 `Input_Batch_Size` → `EmptyLatentImage.batch_size` (node 76);
  emitted `Input_Batch_Size` matches the title case-insensitively → injects 2.
- LESSON: the injector's silent-skip is the trap. A title typo = a dead control with NO
  diagnostic (same family as MPI-217's `Ouptput_Image`).
- `NVIDIA_PID.json` has NO batch node and NO `batch` component — consistent, not a bug.

### STILL OPEN
- Pose Reference is NOT a registered operation. The graph has it (node 207 `MpiIfElse`
  `Input_pose_reference`, switching depth-ControlNet branch 203 vs passthrough 139,
  sharing `Input_Image` node 201 with i2i). The user has asked for this across FOUR
  sessions and it was repeatedly logged as a verification *check*, never built.
  User's ruling this session: fold into MPI-242, build after the UI fixes.
- Suite: 100/100 pass excluding `runpod-remote-hardening.test.cjs` (4 pre-existing fails,
  unchanged). Running the whole glob in ONE process inflates this to 9 fails / 116 tests —
  the RunPod suite's `withServer` cross-contaminates. Run it file-by-file.

### Pose Reference — BUILT (user-sanctioned fold into MPI-242)  ✅ auto-verified, needs user-ux
Asked for across FOUR sessions, never built. User: *"Pose Reference is an operation and
needs to be added to the Operation drop-down and registered as an operation."*

GRAPH (already authored, no workflow edits):
`Input_Image` (201 LoadImage) → `AIO_Preprocessor` (200, depth) → `Krea2ControlImageEncode`
(205) → `Krea2ControlApply` (203). `Input_pose_reference` (207 MpiIfElse) selects 203 vs the
plain LoRA chain (139) and feeds `ToBasicPipe` (143). Pose conditions the **model**;
`Input_Is_i2i` (229) swaps the **latent source**. They compose. Same `Input_Image` as i2i.

### Bug 9 — `Input_Is_i2i` was NEVER injected. Krea2's i2i ran as t2i.  ✅ fixed
Grepping for `Is_i2i` found it in **comments only** (models.js:195, commandRegistry:93,
progressStages:53). Node 229 is baked `false` and nothing in `js/` ever set it, so i2i
ignored the input image entirely. Checklist item 14 would have failed. Found while wiring
pose, because pose needed the identical mechanism and none existed.

FIX — one declarative mechanism serving both, no per-op branching:
- NEW `CommandDef.injectParams` (commandRegistry): constant params an op always injects,
  keyed by node title. `i2i: { Input_Is_i2i: true }`, `poseReference: { Input_pose_reference: true }`.
- `commandExecutor._buildParams` merges `COMMANDS[op].injectParams` BEFORE `injectionParams`
  (so a user control can still override). Two lines.
- `poseReference` op registered: `requiresImages:1`, required `Input_Image` slot, same
  components as i2i. `models.js`: added to `supportedOps` + `workflows.poseReference`
  (same file). The ModelDef **already advertised** "a depth-guided pose reference" in its
  description and documented both booleans in a comment — only the wiring was missing.
- `progressStages` needs NO entry: it is keyed by FILE, and pose shares `krea2_turbo_t2i.json`.
  (Comment updated. If the depth preprocessor surfaces its own tqdm bar, it needs a per-op split.)
- `types.js` needs no change (it names a default op, not a union).

VERIFIED (simulating `_buildParams` against the real graph):
  t2i           → neither boolean (both stay baked-false)
  i2i           → `Input_Is_i2i=true`         → node 229 ✅
  poseReference → `Input_pose_reference=true` → node 207 ✅

GUARD: **`tests/inject-params-titles.test.cjs` (NEW, 2 tests)** — asserts every
`injectParams` title exists in every workflow its op can run, and pins the three Krea2
branch/batch titles. Mutation-tested (`Input_pose_reference`→`Input_Pose` → fails naming
op → file → missing title). This is the diagnostic the injector never gives: **it silently
skips unmatched titles**, which is the single root cause of bugs 8 AND 9.

Suite now **113/113** excluding `runpod-remote-hardening` (4 pre-existing, unchanged).
eslint clean on all 9 changed files.

### PENDING — user-ux for this session's work
- Pose Reference appears in the op dropdown ONLY with an image present (`requiresImages:1`).
- A pose run visibly follows the reference image's pose/depth; a t2i run does not.
- i2i now actually uses the input image (it previously did not).
- Batch 2 → 2 images, 2 cards (Krea2; Chroma after the user re-titles node 2608).
- Reuse Prompt restores style + stylization + enhance + tier + batch.
- Fresh project (no saved tier) opens Krea2 on 1K.

## 2026-07-10 — session 5b: user-ux round 2

### USER-VERIFIED IN-APP ✅
- **Pose Reference works.** Op appears in the dropdown with an image present; the samurai
  output follows the reference couple's pose. First live proof of the ControlNet branch.
- **Reuse Prompt fully restores**: image injected, quality tier, style, stylization — "setting
  everything". Bugs 6 + 7 confirmed fixed in the app, not just in tests.
- **Upscale works.** Batch/quality-tier UI as designed.

### Bug 10 — i2i had no denoise slider  ✅ auto-verified, needs user-ux
USER: *"Image-to-image should have the denoise slider, and it doesn't."* Correct — an omission
in the session-5 registry edit. The graph exposes `Input_denoise` (MpiFloat node 228).
TRACED before wiring: 228 reaches sampler 72 **only** through `MpiIfElse` 230, whose boolean is
`Input_Is_i2i` (229). So denoise is live on i2i and INERT on t2i/poseReference — it belongs on
i2i alone.
- FIX: `commandRegistry.i2i.components += 'denoise'`, `defaults: { denoise: 0.30 }` (the graph's
  baked value). Verified: only i2i mounts it.

### Gap — `poseReference` was missing from the operation registry  ✅ fixed
The playbook (§8 checklist) requires every new op in `js/core/operationRegistry.js`. Added
`poseReference: { latestVersion: '1.0', appVersionIntroduced: '1.2.0' }` (APP_VERSION 1.2.0,
same precedent as `pid` @ 1.0.0). `operation_registry.json` is GENERATED by `/mpi-version-bump`
and its header forbids hand-editing — it will lag until that skill runs. Cross-checked: every
non-stub command now has a registry entry.

### Two PRE-EXISTING bugs found and CARDED (not fixed here)
- **MPI-246** — auto-mask broken on Windows-local. `Prompt outputs failed validation`;
  Comfy: `model_name: 'bbox\face_yolov8n.pt' not in ['bbox/face_yolov8n.pt', …]`. MPI-229's
  Windows-local inverse path-heal (`/`→`\`) applies to a blanket `PATH_INPUTS` that includes
  `model_name`, but Impact Pack's `UltralyticsDetectorProvider` builds its enum with FORWARD
  slashes, unlike `folder_paths`-backed loaders. PROVEN against the live engine's /object_info:
  `lora_name` → `"CHROMA\…"` (backslash), `model_name` → `"bbox/face_yolov8n.pt"` (slash).
  Also seen at 14:15 on `t2i / sdxl-nsfw`, before any of this session's code loaded.
- **MPI-247** — PromptBox silently reverts the chosen op. `setModelList` re-runs
  `_pickOpForModel` on EVERY list refresh (workspace nav), which re-derives the op from the
  media state and takes the first match in `supportedOps` order. Simulated against the real
  registry: image chip → `t2i` reverts to `i2i`; no chip → i2i/pose/upscale/detail all revert
  to `t2i`. PRE-EXISTING (SDXL has the same shape); pose just adds another casualty.
  SCOPE SPLIT: the Gallery-side revert is PROVEN; the History-workspace revert after an upscale
  is NOT — MpiGroupHistoryBlock has its own gating/auto-switch and was never read. May be a
  separate card. Do not assume one root cause.

### Playbook updated (user request — he is rolling i2i across every image workflow)
`docs/add-model-playbook.md` **§11 "One graph, several ops — branch booleans + i2i denoise"**:
the `injectParams` mechanism; the silent-skip trap that hid `Input_Is_i2i` and `Input_Batch`;
the alias is a PURE PREFIX (`Batch_Size`→`Input_Batch_Size`, never abbreviated); i2i's denoise
control + the "trace the gate before mounting it" rule; progressStages is keyed by FILE not op;
operationRegistry vs the generated JSON. Two new lines on the master checklist. Points at
MPI-247 so nobody "fixes" it inside a model card.

Suite: **113/113** excluding `runpod-remote-hardening` (4 pre-existing). eslint clean.

## 2026-07-10 — session 5c: enhance reorder + CARD-LEVEL VALIDATION LEDGER

### Bug 11 — enhance toggle orphaned by the denoise slider  ✅ auto-verified, needs user-ux
Adding `denoise` to i2i pushed the `enhancePrompt` toggle into the middle of the panel
(between Stylization and Denoise). USER: *"move the Enhance prompt button down again on the
right-hand side of the batch."*
- FIX: `enhancePrompt` moved to the END of `components` on ALL THREE ops (t2i / i2i /
  poseReference), so it rides the bottom row after ratio + batch. Array order IS mount order
  (`MpiPromptBox._refreshOpSlot` appends in sequence; no CSS `order:` override — the
  `.mpi-prompt-box__col--enhance` rule is on the prompt-box BAR, a different element).
  Final order:
    t2i           : qualityTier, styleSelect, stylization, ratio, batch, enhancePrompt
    i2i           : qualityTier, styleSelect, stylization, denoise, ratio, batch, enhancePrompt
    poseReference : qualityTier, styleSelect, stylization, ratio, batch, enhancePrompt

### operationRegistry gap closed
`poseReference` added to `js/core/operationRegistry.js` (`appVersionIntroduced: '1.2.0'`).
`operation_registry.json` is generated by `/mpi-version-bump` and STILL LAGS — it must be
synced at the next version bump (it is NOT hand-edited; header forbids it).

---

# ★ MPI-242 OUTSTANDING VALIDATION LEDGER (card stays doing/validating — DO NOT move to done)

Everything below must be validated before this card closes. Grouped by what unblocks it.

## A. USER-UX — validate NOW in the app (local engine)
- [ ] **Pose Reference** end-to-end (op appears with image; output follows the pose). ✅ user-confirmed 2026-07-10, re-confirm after the enhance reorder didn't disturb it.
- [ ] **i2i actually uses the input image** — `Input_Is_i2i` had NEVER been injected before this session (ran as t2i). Confirm the denoise slider changes how far the result departs from the source.
- [ ] **Denoise slider** present on i2i ONLY (not t2i, not pose), default 0.30.
- [ ] **Enhance toggle** sits at the far right of the ratio/batch row on all three ops (t2i/i2i/pose). ← the session-5c fix, NOT yet seen by the user.
- [ ] **Batch** N → N images / N cards (Krea2). Chroma after the user re-titles node 2608.
- [ ] **Reuse Prompt** restores style + stylization + enhance + tier + batch. ✅ user-confirmed; re-confirm batch now that the node injects.
- [ ] **Fresh project** (no saved tier) opens Krea2 on **1K** (needs a NEW project — existing Krea2 Test has 1k saved).
- [ ] **QUALITY block** full-width; ratio+batch bottom-left; matches LTX/SDXL.
- [ ] **Enhancer ON** → status bar N/3, prompt box keeps YOUR text, Reuse returns EXPANDED prompt with NO style trigger. ✅ 3/3 + reuse user-confirmed.
- [ ] **negativePrompt toggle ABSENT** on Krea2.

## B. BLOCKED on the detail/auto-mask fix — validate after that lands
- [ ] The **detail** operation on Krea2. Detail depends on auto-mask, which is currently
      BROKEN on Windows-local (**MPI-246** — the Ultralytics `model_name` backslash heal).
      Do NOT validate detail here until MPI-246 (and any follow-on detail-op card) ships.
      Per the user's instruction this validation stays on THIS card even though the fix
      lives elsewhere. [[MPI-246]]

## C. BLOCKED on MPI-244 (Pod image rebuild) — validate REMOTE later
- [ ] Connect the remote engine; run one Krea2 **t2i** with enhancer ON; confirm
      `Output_prompt` round-trips via `_reconcileFromHistory` (/history may NOT preserve
      PreviewAny `ui.text` like the live `executed` msg — UNVERIFIED, silent-fallback risk).
- [ ] Run Krea2 **poseReference** on the Pod. Two Pod-specific risks, both UNTESTED:
      (1) the depth-ControlNet LoRA path `krea-2\control\depth-control-lora.safetensors` is
          baked with BACKSLASHES; the Pod heal (`\`→`/`, PATH_INPUTS includes `lora_name`)
          MUST flip it. `Krea2ControlLoRALoader` is a custom node — confirm the heal reaches it.
      (2) `AIO_Preprocessor` → `DepthAnythingV2Preprocessor` auto-downloads its weight inside
          `comfyui_controlnet_aux` on first use — the Pod needs network on cold start for it.
- [ ] Run Krea2 **i2i** and **batch>1** on the Pod (the injectParams booleans + Batch_Size
      alias must inject identically on the remote path). [[feedback_check_both_engine_paths]]
- [ ] MPI-244 build info CONFIRMED STILL CORRECT after this session: node_lock pins
      `comfyui_controlnet_aux` (e8b689a) + `ComfyUI-Krea2-ControlNet` (79ebfd3) unchanged;
      the depth-ControlNet weight (`krea2-lora-depth-control`) is a declared dep already on
      R2. This session added NO new deps/nodes — only JS + one workflow regen. The Pod image
      requirement is exactly what MPI-244 already targets.

## D. System-prompt tuning (deferred by user — "run as is and see")
- [ ] Template node 60: two U+FFFD chars (rules 7, 9) + the `thinking:false` vs "think step
      by step" contradiction. IF enhanced output drifts, suspect the thinking contradiction
      BEFORE blaming the 4B model. Fix in the TEMPLATE, then `python orchestrate.py`.

## Suite / lint at session-5 close
127→116 test files; **113/113 pass excluding `runpod-remote-hardening.test.cjs`** (4
pre-existing fails, proven at pristine HEAD). New guards this session:
`inject-params-titles.test.cjs` (2), extended `permodel-key-allowlist.test.cjs` (+1).
eslint clean on all changed files.
