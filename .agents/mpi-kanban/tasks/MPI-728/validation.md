# MPI-728 Validation

## The precondition — PASSED, 2026-09-12

**Question:** both enhancer graphs pass `type: "krea2"` to `CLIPLoader`. Is that a
Comfy CLIP-type string, or a real dependency on the Krea2 model? The whole
"ComfyUI offered on every model" design rests on the answer.

**Answer: a CLIP-type string.** Three independent proofs, not one.

1. **Live, and in the strongest available form.** `comfy_workflows/qwen3vl_4b_prompt_enhancer.json`
   dispatched to the STANDALONE BENCH on 8188 under a GPU lease, with **no generation
   model loaded at all** (GPU idle at 1.9 GB of 16 GB). Injection mirrored
   `buildComfyInjectionParams()` + `COMFY_ENHANCE_OVERRIDES`.

   ```
   queued prompt_id: 7af9b68e-dee1-46e9-a67e-1c9d713cf35f   node_errors: {}
   status: success | completed: True | after 15.0 s
   OUTPUTS: {"4": {"text": ["A man in a worn leather jacket walks his golden
   retriever through an autumn park, leaves swirling like fire around them. …"]}}
   ```

   Input was `a man walking his dog`; the subject survived. Nothing Krea2 was
   resident, so the graph cannot have been borrowing anything from it.
2. **ComfyUI's own source.** `G:\ComfyUi\ComfyUI\comfy\sd.py:1903-1906` selects the
   krea2 text-encoder branch on `clip_type == CLIPType.KREA2 and te_model ==
   TEModel.QWEN3VL_4B` — the first from the CLIPLoader's `type` widget, the second
   detected from the safetensors being loaded. No diffusion model is consulted on
   that path at all.
3. **Our own dispatch.** `llmService.runComfyEnhance()` already passed
   `model: { id: null, mediaType: 'image' }`. The ComfyUI enhance never referenced
   the selected generation model, so model-independence is structural, not lucky.

**Consequence:** both plans stand as written. No rewrite.

## The correction the precondition turned up

`canEnhanceInGraph()`'s surviving reading — "the enhance costs no extra VRAM on
this model" — is true for **two** of its four members, not four. Measured from the
workflows' own `CLIPLoader` nodes:

| model | its CLIPLoader | same ComfyUI cache key as the enhancer graph? |
|---|---|---|
| krea2 / krea2-nsfw | `qwen3vl_4b_abliterated_fp8_scaled` · `krea2` | **yes** — free |
| klein-4b | `qwen_3_4b` · `flux2` | no — different weight AND type |
| klein-9b | `qwen_3_8b_int8_convrot` · `flux2` | no — different weight AND type |

A hint that is wrong on half its members is worse than no hint, so
`canEnhanceInGraph()` and `capabilities.promptEnhance` were both deleted (the plan
pre-authorised that branch). If the hint is wanted back, derive it from the
workflow's CLIPLoader — that is the actual fact — rather than hand-setting a flag.

## Phase 1 — automated, PASSED

- `node tests/llm-service.test.cjs` → **11/11 pass**.
- `node tests/output-prompt-capture.test.cjs` → all assertions pass.
- `npm test` → **944 pass, 0 fail**.
- `npm run lint` and `npm run lint:components` → clean.
- Deletion sweep: `grep -rn "isUncensoredModel\|UNCENSORED_MODEL_ID\|canEnhanceInGraph\|chooseEngineModelId"`
  outside `engine/` returns ONE hit, a comment in `llmService.js` naming the
  deleted function as history. `grep -rn "promptEnhance: true"` returns nothing.
- **RED-on-HEAD proved BY SCRIPT, not by eye** (MPI-677's round-3 rule).
  `scratchpad/prove_red_on_head.cjs` loads `git show HEAD:js/services/llmService.js`
  as CJS and runs the two new test bodies against it:

  ```
  --- HEAD (pre-swap): every new assertion must be RED ---
    RED (correct)  testComfyIsOfferedOnEveryModel
    RED (correct)  testTheModelCardNoLongerSteersTheBackend
        the id "sdxl-nsfw" changed the backend
    HEAD carries UNCENSORED_MODEL_ID / isUncensoredModel / canEnhanceInGraph /
    chooseEngineModelId  (all deleted in the working tree)
  --- working tree: the same assertions must be GREEN ---
    ok  testComfyIsOfferedOnEveryModel
    ok  testTheModelCardNoLongerSteersTheBackend
  ```

## Phase 2 — driven live, PASSED (the browser half)

Run on an OWN isolated instance (`CUBRIC_AGENT_PROFILE` set to a copy — the shared
agent profile was held by a live peer, which is the documented single-instance
collision, not a broken app). Port 64867, never :3000. Instance torn down after.

- **`GET /llm/models`** answers with the asymmetric coverage the picker filters on:
  `gemma-4-e4b` and `gemma-3-12b` both; `dolphin3-abliterated` and
  `gemma-4-abliterated-12b` ollama-only; `deepseek-v3.2` and `qwen3.6-35b-a3b`
  cloud-only. `defaultModelId: gemma-4-e4b`.
- **The section mounts** into `#mpiSettingsEnhancementMount` and renders its copy.
- **The backend dropdown carries the placement framing**, each entry with its cost:
  `Automatic · Cloud when a key is saved, otherwise Ollama` / `DeepInfra (cloud) ·
  No VRAM, needs a key` / `Ollama (local) · A second runtime, its own VRAM` /
  `ComfyUI (local) · Reuses the engine already running`.
- **BOTH branches of the dep gate exercised.** With `qwen3vl-abliterated-clip`
  present, ComfyUI is selectable. With the dep status forced to `false`, the same
  entry renders `ComfyUI (local) :: Install the Image Describer plugin :: DISABLED`.
- **The model select is filtered to the chosen backend.** Under Ollama it lists
  `['', gemma-4-e4b, gemma-3-12b, dolphin3-abliterated, gemma-4-abliterated-12b]`;
  under DeepInfra `['', gemma-4-e4b, gemma-3-12b, deepseek-v3.2, qwen3.6-35b-a3b]`.
  An Ollama-only pin shows as `Default` under DeepInfra rather than as a value that
  backend cannot honour, and the pin itself survives switching back.
- **Both choices persist across a close/reopen** (`onOpen` re-reads):
  `Ollama (local)` + `Gemma 4 Abliterated 12B`.
- **The key field takes its browser branch correctly** —
  "Saving a key requires the desktop app." `secretsClient.isAvailable()` is false
  outside Electron, which is the disabled path working.
- **Zero console errors.** The single warning is a deliberate probe (below).

### End to end, through the real service

- A pin the chosen backend cannot serve fails BY NAME, with no silent substitution:
  `{"ok": false, "error": "\"DeepSeek V3.2 (Cloud only)\" has no ollama variant."}`
  — which proves `enhancerModelPreference()` reaches the route in place of the
  deleted `chooseEngineModelId()`.
- A real enhance on an `-nsfw` card now runs on the USER'S choice and the registry
  default, where HEAD would have forced the abliterated build:
  `{ ok: true, backend: "ollama", model: "gemma4:e4b", recipeId: "sdxl",
     fellBack: false, text: "candid photography, man walking his dog, casual,
     walking, full body, sunny suburban street, golden hour, eye level, Sony A7 III…" }`

## Round 2 — Fabio's screenshot review, 2026-09-12

He compared the section against the RunPod one and rejected three things, all
correct. Plus two scope calls.

### The three UI defects, and the fix for each

1. **A field label with no field under it.** `.mpi-enhancement-settings__row`
   declared `display: flex`, and ANY display declaration beats the UA
   `[hidden] { display: none }` — so `row.hidden = true` was inert and "Enhancer
   model" sat there alone whenever the backend was Automatic. **My first probe
   missed this because it read the `hidden` PROPERTY rather than the computed
   style**, which is the whole lesson: `el.hidden === true` says nothing about
   whether the user can see it. Now asserted as
   `getComputedStyle(...).display === 'none'`.
2. **The cost metas truncated to "CLOUD W…" / "NO VRAM…".** Those labels are the
   entire reason the control reads as a placement choice, so ellipsising them
   defeated the card. RunPod already had the remedy (MPI-620): stack the meta on
   its own line and drop the 11ch cap. Lifted into `.mpi-dropdown--stacked`,
   named for the shape rather than for one consumer. Verified live per option:
   `scrollWidth > clientWidth` is false on all four, `grid-template-columns` is a
   single `410.391px` track.
3. **The wrong layout for Settings.** Label-left / control-right, capped at 22rem,
   where the house pattern is `mpi-settings__form-group` — label ABOVE, control
   full width, hint below. Rebuilt on the house pattern; screenshot compared
   against the RunPod section.

### The two scope calls

- **A new "Remote" slide-over, and both sections MOVED into it** — not duplicated.
  Settings is about this machine; the language models and the RunPod engine are
  about somebody else's. Nav is now Models · Flows · Settings · **Remote** ·
  Hotkeys · About.
- **The section is about the LANGUAGE MODEL, not about one button.** It was
  written entirely around prompt enhancement; an LLM already writes image
  descriptions too, and the agent is a third job later. Renamed
  `MpiEnhancementSettings` → `MpiLlmSettings`, retitled **Language Models**,
  restructured as one row PER JOB with the copy generalised. Image descriptions
  ships with its one honest option (ComfyUI) and says why — every model in
  `MODEL_REGISTRY` is text-only, so nothing hosted can look at an image. MPI-737
  grows that row; the agent slots in as a third without rearranging anything.

### Re-verified after the restructure

- `npm test` **944 pass / 0 fail**; `npm run lint` + `lint:components` clean.
- Nav renders `[Models, Flows, Settings, Remote, Hotkeys, About]`.
- Remote opens with exactly two sections: **Language Models**, **RunPod Remote
  Engine**, at `#mpiRemoteLlmMount` and `#mpiRemoteRunpodMount`.
- **The move is a move.** Settings now lists only its eight local sections
  (Update, Engine health, App Behavior, Desktop Notifications, Display, Audio
  Input, Reuse Prompt, External Connections) and neither mount id resolves in it.
- The hidden model group computes `display: none` (the real check, not `.hidden`).
- Option metas: zero truncation, full cost text on every entry.
- `tests/desktop/runpod-settings-extract.spec.js` retargeted to the Remote panel
  and extended to assert the move left nothing behind in Settings. **NOT RUN** —
  it is an Electron desktop spec, and this session has no evidence it passes.
- Zero console errors across the whole pass.

## Round 3 — 2026-09-12 (`da3b23bc`)

### The owed spec ran, and it was the red on master

- `npx playwright test --config=playwright.desktop.config.js tests/desktop/runpod-settings-extract.spec.js`
  → **FAILED at `:89`**: `.mpi-slide-over` "resolved to 2 elements", then 1, never 0.
- Master CI was red on `fef67f9d`, `d0787f13`, `865b8a7a`, `b079624f` and
  `d04a11d4`. Run `34710215955`'s only failure is this spec at `:89`.
- Cause is the SPEC. `MpiSlideOver._doClose` removes the node on `transitionend`
  with a 400ms backstop, and `_openSlideOver` guards `_active === instance`, so
  the manager is correct. `document.querySelector('.mpi-slide-over')` returned
  the Remote node still sliding out, already `_closed`, so `close()` no-oped.
- Fix: `.mpi-slide-over[aria-expanded="true"]` → PASS.

### Round-3 changes, verified

- `npm test` → **949 pass / 0 fail**. `node tests/llm-service.test.cjs` → 10/10,
  including the new `testComfyIsTheDefault`. On HEAD `chooseBackend()` returned
  `'ollama'` (the old `serverDefault = 'ollama'` fallback), so that assertion is
  red on HEAD by construction.
- `npm run lint` + `npm run lint:components` → clean.
- `runpod-settings-extract.spec.js` + `popup-contract.spec.js` → **2 passed**. The
  first now also asserts the ComfyUI default label, exactly three backend options,
  and DeepInfra `is-disabled` on a keyless profile. The second asserts
  dropdown→dropdown and dropdown→tree-picker exclusivity.
- **NOT proven RED on HEAD:** the exclusivity asserts. Stash is guard-git-banned
  and the red master came first. The defect itself is Fabio's screenshot plus the
  `stopPropagation()` reading of all three picker triggers.
- CI on `da3b23bc`: run `34711900706` → **`success`** (`tests: success`). Master
  is green again; the five red runs before it all failed on this spec alone.

## Fabio's desktop check (`Verify mode: user-ux`) — PASSED, 2026-09-12

In the desktop app, by Fabio. Earlier in the round he had already seen the Remote
nav entry, the section, and **Save** on the key field ("API key is saved." in his
screenshot). Then, on his own words "I cleared the key and did all four steps.
Everything checks out":

1. **Clear** → the status line changes and DeepInfra greys out in the backend list. ✔
2. With no key: DeepInfra listed but unpickable; ComfyUI selected by default. ✔
3. **Open DeepInfra dashboard** opens `https://deepinfra.com/dash`. ✔
4. Opening one dropdown while another is open closes the first. ✔
5. **Placement, not ranking:** his "there's no cost in the dropdown" meant exactly
   that. Confirmed ("yes, that's what I meant"). ✔

**Phases 1+2 have no open verification.** A new, unbuilt ask came with it: show a
price ("maybe price per token would suffice"). See `plan.md` § Current State.

## Phase 3 — NOT STARTED

The Ollama lifecycle (MPI-8 / MPI-17 ported from Cubric-Prompt) is untouched. A
user with Ollama running but without the model still gets a raw 404.
