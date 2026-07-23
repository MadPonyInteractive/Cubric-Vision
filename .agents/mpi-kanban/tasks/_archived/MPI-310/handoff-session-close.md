# MPI-310 — session close + next-session handoff

Written 2026-07-19. Previous handoff: `validation.md` (the 5 checks). **All 5 now pass.**

## What happened this session

App restarted clean (ghost sweep first — every `node.exe` was VS Code tooling / MCP
servers / Adobe, NOT app instances; `taskkill //F //IM node.exe` would have been
wrong. Command-line inspection over blunt kill: `feedback_kill_spawned_app_instances`
wants the check, not the sledgehammer).

### Validation — all 5 checks PASS (user-driven, in Electron)

1. **Plugins row** — renders, filters/search behave, count line unaffected. ✅
2. **Describe from gallery card** — caption to prompt box, no history item, no gallery card. ✅
3. **Describe from history item** — same. ✅
4. **Negative-mode flip** — box flips to positive and shows the caption. ✅ (the subtle one)
5. **Uninstall frees 5.24GB** — row flipped to `INSTALL (5.24GB)`; right-click menu
   correctly degrades to a toast: *"Image Describer is not installed — add it from the
   Model Library (Plugins)."* ✅

**Caveat on #5:** the on-disk byte delta was NOT captured between uninstall and
reinstall — the re-download overwrote the evidence before it was read. UI transition +
toast are the evidence. Baseline was 5,242,481,504 bytes / 56.55GB free. If you want
the hard number, capture it between the two clicks next time.

### Shipped this session (5 files, UNCOMMITTED)

| File | Change | Verified |
|---|---|---|
| `MpiModelManager.css` | Plugin row `var(--surface-2)` → `var(--lib-card)` + tile border, dropped `border-radius` (tiles are square); added `__text` / `__desc` | ✅ user |
| `MpiModelManager.js` | Row markup: name stacked over description | ✅ user |
| `pluginsRegistry.js` | `description` field on PluginDef | ✅ user |
| `generationService.js` | `promptExcerpt` falls back to `plugin.title` — Cue read "No prompt text" on text ops | ✅ user |
| `commandRegistry.js` | **Removed `'enhancePrompt'` from `krea2Edit` components** | ❌ NOT verified in UI |

Both unit checks still green: `tests/plugin-dep-gc.test.cjs`, `tests/text-op-completion.test.cjs`.

## The enhancer findings (the substantive part)

### t2i enhancer — FIXED, but lives only in the user's ComfyUI graph

Symptom: abliterated Qwen3-VL leaked reasoning into `Output_prompt` (`Step 1: Identify
the subject…`, then later `No, wait — I need to reframe this.`).

Root cause was the **system prompt**, not `thinking`/template: it literally said
*"Think step by step about the request before writing the answer"* and listed numbered
considerations. The model complied and never stopped. Abliteration also weakens
commit-to-an-answer behaviour → self-correction.

Fix, both parts needed:
1. Rewrote the system prompt — removed the reasoning scaffold, put "Output ONLY that
   paragraph" first, added an 80–150 word target (this is the real speed brake;
   `max_length: 512` is a ceiling, not a target). Dropped the old dignity/clothing rule
   as a refusal instruction working against the point of the abliterated swap.
2. Added **rule 9: "First attempt is final. Never correct, restart, or comment on your
   own draft."**
3. **temperature 0.7 → 0.5.** 0.7 still leaked. Do NOT go to 0.2 — that's right for the
   *descriptor* (one correct answer) and wrong for the *enhancer* (invention is the job).

> ⚠️ **THIS PROMPT IS NOT IN THE REPO.** `comfy_workflows/raw/krea2_t2i_template.json`
> was last written **Jul 18 03:21**, before this session. The working prompt exists only
> in the user's open ComfyUI tab. **Confirm it was saved + raw→runtime synced** before
> anything else. If lost, the recipe is above: no reasoning scaffold, rule 9, temp 0.5.

Also settled: the censorship the user hit was in the **enhancer LLM**, not the CLIP.
The refusal text came out of `Output_prompt`, downstream of `Generate Text`. Swapping
the text encoder was never the fix.

### krea2 EDIT enhancer — REMOVED, and why it can't be prompted around

Enhancing an edit prompt confuses the model. Investigated upstream
(`lbouaraba/comfyui-krea2edit`, pinned `17af8833` in `dev_configs/node_lock.json:100`;
cloned locally at `G:/ComfyUi/ComfyUI/custom_nodes/comfyui-krea2edit`).

**No prompt-phrasing guide exists upstream** — but `KREA2_EDIT_TEMPLATE` (`__init__.py:161`)
explains why. The instruction is encoded *together with the source image's vision tokens*,
in a turn whose system message is *"Describe the image by detailing the color, shape,
size, texture… of the objects and background:"*. So the text carries only the **delta** —
appearance comes from the frame=1 source latent. An enhancer expanding that delta into a
standalone scene paragraph fights the grounding.

Edit adherence is tuned by `grounding_px` (README: *"lower = stronger edit adherence,
higher = stronger identity/likeness"*), NOT prompt length.

Also: edit verbs are **load-bearing**. Community (coyotte, Discord): *"'Replace' will
often make a drastic change, same as 'convert'. 'Change' can be softer."* A paraphrasing
enhancer silently flips edit strength. That's user intent — it belongs in UI hints or
docs, never in an LLM rewriting the user's words.

**Tried and failed:** a "clarify, don't expand" edit-mode enhancer prompt. Two
independent failures → the layer is wrong, not the wording.

**Fix:** dropped `'enhancePrompt'` from `krea2Edit.components` (`commandRegistry.js:201`).
Declarative — the per-op components array is the existing gate, double-gated by
`capabilities.promptEnhance`. `Input_Enhance_Prompt` is only ever injected from
`PromptBoxControls.js:1248` (the control's own `getInjectionParams()`), so no control
mounted = param never injected = the graph's baked `false` stands. The graph node stays
wired on purpose — `krea2Edit` shares the t2i graph, so removing it would break t2i.

## Next session — TODO

1. **Confirm the plugin re-download finished.** Was at 4,937,220,096 / 5,242,481,504
   (94%) at close. Verify:
   `ls -la "G:/CubricModels/text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors"`
   → must be exactly **5242481504** bytes. Short = interrupted, re-install.
2. **Verify the krea2Edit enhancer removal in UI** (Ctrl+R): enhancer toggle GONE on
   Krea2 Edit, still PRESENT on t2i/i2i/Depth.
3. **Confirm the t2i enhancer prompt was saved** (see warning above).
4. **Krea2 edit 1.2** — we're on 1.1. Check the node pin AND the LoRA version separately.
5. **Heretic LoRA** into the Krea2 template.
6. **Shared-dep uninstall re-test** — once KREA2 depends on this weight, uninstalling the
   plugin must KEEP the file. Tests `_pluginRequiredDepIds(excludeUninstallId)` in the
   shared case; so far only the single-owner case has run. The uninstall dialog already
   claims *"Files shared with other installed models will be kept"* — that sentence is
   currently UNTESTED. Verify behaviour matches the copy.
7. **Progress bar on the plugin row.** Plumbing exists: `_pluginTile()` already finds the
   job (`state.downloadJobs.find(j => j.modelId === pluginDepKey(plugin.id))`) and computes
   `busy`, but renders a static "Installing…" and throws the percentage away. Reuse the
   tile's `.mpi-tile__prog` markup. Check: is that CSS scoped to `.mpi-tile__*` (needs a
   shared class or row variant), and does the row's flex layout give the bar a sane slot.

## Still open from validation.md (unchanged)

- Video "Describe current frame" NOT built — loader reads an OS path, not a blob. Related MPI-287.
- RunPod/remote engine untested for the describer; weight NOT baked into the Pod image
  (deliberate). `feedback_runpod_not_local_engine_proof` applies.
- `runImageDescribe()` in `js/services/commandExecutor.js` is dead code, left deliberately.
- Caption not persisted — prompt box only, out of scope per the card.
