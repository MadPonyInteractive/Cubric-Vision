# MPI-677 Validation

Verify mode: `auto`, with one exception — **step 1c (the overlay) is `user-ux`**.
Step 1d is Fabio's measurement on the GPU and gates nothing.

## Step 1a — the enhance service (2026-09-08)

Built. **Both backends are now proven live; one bullet is owed a GPU run and is
recorded as owed, not rounded up.**

### What ran

| Check | Command | Result |
|---|---|---|
| Whole suite | `npm test` | **907 pass / 0 fail** |
| New tests | `node tests/llm-service.test.cjs` | **13 pass / 0 fail** |
| Lint | `npm run lint` | clean, `--max-warnings=0` |
| Harness still imports its backends | `node -e "import('./scripts/recipe-engines.mjs')"` | resolves all 7 exports |
| Server boots with the route | `CUBRIC_PORT=3199 node server.js` | `Server started at http://127.0.0.1:3199` |

### The live one-shot call (the bullet's own verify)

Against the booted server, port 3199 so it could not attach to a running app:

```
GET  /llm/status  -> {"deepinfra":{"hasKey":false},"ollama":{"running":true},"defaultBackend":"ollama"}
POST /llm/enhance -> {"ok":true,"text":"The lighthouse glowed at dusk.","backend":"ollama","model":"gemma4:e4b"}
```

**Honest state is real, not a field that is filled in optimistically:** `backend`
and `model` come off the engine's own result, so the reply names `gemma4:e4b` on
Ollama because that is what answered. Two negative paths were exercised in the
same run and both return a usable sentence rather than a stack trace:

```
POST /llm/enhance (empty prompt)      -> {"ok":false,"error":"Write a prompt first, then Enhance."}
POST /llm/enhance (abliterated model,
                   backend=deepinfra) -> {"ok":false,"error":"\"Gemma 4 Abliterated 12B (Uncensored, local only)\" has no deepinfra variant."}
```

### The cloud path, live (2026-09-08, second boot)

Fabio supplied a key. Re-booted on 3199 with `DEEPINFRA_API_KEY` exported from
that file — **the key is not in this repo, not in `.env`, and must never be
committed**; its location is in the handoff, not here:

```
GET  /llm/status  -> {"deepinfra":{"hasKey":true},"ollama":{"running":true},"defaultBackend":"deepinfra"}
POST /llm/enhance -> {"ok":true,"text":"A solitary lighthouse stands sentinel against the bruised
                      purples and burning ambers of a dying twilight.",
                      "backend":"deepinfra","model":"google/gemma-4-26B-A4B-it"}
```

So the whole decision chain runs end to end: a key exists → `defaultBackend`
resolves to `deepinfra` → the request goes to the cloud with no `backend` named →
the reply carries the model that actually answered. **Ollama was running at the
same time and was not used**, which is the point — the default is the cloud when
a key is present, not "whatever is reachable".

### The VRAM release, measured rather than asserted

`GET /api/ps` immediately after that enhance returned **`[]`** — the `keep_alive:0`
release in the route's `finally` actually ran. This is MPI-14's rule on Vision's
side of the family: a local LLM must not sit on VRAM the generator is about to
want, and on a 16 GB card an idle LLM alongside a video generation took a
sub-10-second render past three minutes.

### Owed, and why it is owed

- **The ComfyUI-encoder backend has NOT been run end to end.** `runComfyBackend()`
  is written and dispatches the existing `promptEnhance` operation with the
  injected recipe, and a test proves every injection key addresses a real node
  title in `qwen3vl_4b_prompt_enhancer.json` — but the bullet's own verify ("an
  enhance on `krea2` with no DeepInfra key and no Ollama returns text matching the
  `krea-2` recipe's shape") needs the app running and the button, which is **step
  1b**. It also needs the GPU: the lease was held by MPI-591's bench at the time
  (`gpu_lease.py status` → `GPU 0 busy … pid 23504`), and loading an encoder
  alongside a live generation is the exact contention this repo documents.
- ~~No live DeepInfra call.~~ **Closed the same day** — see "The cloud path,
  live" above. What is still untested on that path is the key coming from
  `secretsStore` rather than the environment: the fork-bridge round trip is unit
  tested (`testForkBridgeAnswersDeepInfraRequests`), but no one has yet typed a
  key into a settings field, because there is no field until step 1b/1c.

### Recorded for step 1d, because it changes what that measurement means

The shipped enhancer graph leaves `use_default_template: True` on `TextGenerate`
*and* hand-rolls its own ChatML, so an injected recipe lands inside the default
template's user turn. The Stage 1 harness measures the opposite — template off,
ChatML hand-rolled (`services/llmEngines.mjs`). Both configurations are proven,
on different instruments: the graph's shape returned a correct French translation
from an injected recipe on 2026-08-19, and the harness's shape produced every
recorded green. **So a `comfy`-backend enhance is not the configuration any
recipe went green on.** It is left alone deliberately; flipping the widget on a
hunch would change the instrument without a measurement.

### One structural change the plan did not name

`scripts/recipe-engines.mjs` moved to **`services/llmEngines.mjs`** and the old
path is now a pure re-export. Reason: **`scripts/` is excluded from the portable
build** (`scripts/build-portable.mjs:135`), so a route importing the backends from
there works in dev and is absent in the shipped app. Nothing in the file was
edited — every constant the sweeps were measured on travelled verbatim, which is
what keeps the app and the harness on one implementation instead of two that
drift.

## Step 1b — the control (2026-09-08)

Built and **exercised in a running app against a live cloud backend**. Six of the seven
bullets are proven; the seventh needs the GPU and is recorded as owed, not rounded up.

### What ran

| Check | Command | Result |
|---|---|---|
| Whole suite | `npm test` | **915 pass / 0 fail** (was 907; +1 new file, +7 asserts) |
| New tests | `node tests/enhance-control.test.cjs` | **7 pass / 0 fail** |
| Lint | `npm run lint` | clean, `--max-warnings=0` |
| Server boots | `CUBRIC_PORT=3199 node server.js` with the key exported | `/llm/status` → `{"deepinfra":{"hasKey":true},…,"defaultBackend":"deepinfra"}` |

### The live run, in the app, on port 3199

**Three enhances, three models, one code path.** Typed into the real prompt box and the
real button pressed:

| Model | key → recipe | Output (first words) |
|---|---|---|
| the project's SDXL card | `sdxl` (exact) | `POSITIVE PROMPT: landscape photography, lighthouse, weathered stone…` |
| `krea2` | `enhanceRecipe: 'krea-2'` | `A lone lighthouse stands tall against a darkening sky in this wide shot…` |
| `chroma-flash` | `type: 'chroma'` | `A wide shot captured on a Hasselblad X2D 100C depicts a weathered stone lighthouse…` |

Every one toasted **"Prompt enhanced."** with no `note`, so all three resolved EXACTLY —
none fell through to `FALLBACK_RECIPE_ID`. Three different recipes, and the control's own
code never branched: the same button, the same handler, `resolveRecipe()` doing the work.

**THE BROKER IS OUT OF THE PATH, measured rather than asserted.** The network log across
those three presses shows three `POST /llm/enhance → 200` and, under `?connector`, only
`GET /connector/jobs/stream` — the SSE relay step 2 deliberately KEEPS. Zero
`/connector/enhance`, zero `/connector/capabilities`. The capability probe and its
10×3 s poll are gone with the import: the button is unconditional because there is no
longer a second app for it to be conditional on.

### The operation gate, live

`workspace:set-operation` driven through five ops on one card, reading the slot each time:

```
t2i: buttons=1 hidden=false | qwenEdit: buttons=0 hidden=true | control: buttons=1 hidden=false
kleinEdit: buttons=0 hidden=true | i2i: buttons=1 hidden=false        (inpaint: buttons=0 hidden=true)
```

`control` keeping the control is the non-obvious half and it is the correct half: the
reference constrains STRUCTURE, so the prompt still carries the creative load. That is
why Qwen Image Edit is not wholly exempt — **the exemption is per OPERATION, never per
model**, which is the whole content of Cubric-Prompt MPI-21.

### The in-graph enhancer is off, and it needed no graph edit

All four graphs ALREADY bake `boolean: false` on their `Input_enhance_prompt` MpiIfElse
(`krea2_t2i_sfw` #241, `krea2_t2i_nsfw` #241, `klein_t2i` #8, `klein_9b_t2i` #8) —
verified by reading the JSON. The only thing that ever set it `true` was the
`enhancePrompt` control's `getInjectionParams()`, so **deleting the control forces false
and no workflow file was touched.** Confirmed live: `getRunPayload().injectionParams` on
a `krea2` t2i now contains no key matching `/enhance/i` at all.

Both halves are asserted in `tests/output-prompt-capture.test.cjs` — nothing offers the
toggle AND every graph bakes false — because either alone is a false green.

### Owed, and why

- **The ComfyUI-encoder backend end to end — STILL OWED, same reason as step 1a.**
  `gpu_lease.py status` → `GPU 0 busy … MPI-591 … pid 4592`, so the local path could not
  be exercised. The cloud path is what ran above. This is now the ONLY thing standing
  between step 1a's last open bullet and closed.
- **Character Sheet and Music Maker were not RUN**, for the same lease. What was checked
  is the half that does not need a GPU: all three enhance declarations still collect
  through `_enhanceDecls`' filter, Music Maker still carries its 1,940-character
  `Input_System_Prompt` and its three-marker `to` map, and Character Sheet still
  correctly carries none (its recipe is baked in the graph). Dispatch shape is shared
  code now; the run is owed.

### One thing that LOOKS like a regression and is not

An `sdxl` enhance returns `POSITIVE PROMPT: …\nNEGATIVE PROMPT: …` as one blob and the
whole blob lands in the positive field. **The broker path did exactly the same** —
Cubric-Prompt has no splitter anywhere in `src/main/` (grepped), so its responder
returned the labelled text as `prompt` and left `negativePrompt` undefined, and Vision
wrote `result.negativePrompt ?? negativeValue`, i.e. the negative unchanged. So this is
PARITY, not something 1b broke, and it is step 1c's own bullet ("the lower box mirrors
the model's fields"). Splitting it silently here would pre-empt a UX decision that is
Fabio's: which channel the negative block lands in is something the user should see and
approve in the overlay, not something the control does behind them.

Corroborated independently and already written down: `pony.recipe.js:216-227`
reached the same conclusion from the other side while deciding not to emit a
negative block at all, and named `sdxl` as carrying the same defect. Its pointer
said "fixing the split is MPI-27's" — a card in the repo this work retires — and
has been repointed at step 1c.

### The scope call worth recording

**"Fold in the two Flow-internal enhance buttons" was read as ONE DISPATCH, not one
backend**, and the difference is load-bearing. Routing the flows to the cloud default
would have dropped three post-processing nodes they depend on — `Replace Text` strips
newlines, `Input_Scrub_Negation` deletes "no …" clauses, `Input_Tidy` eats the trailing
full stop because a character phrase is spliced into the middle of a longer sentence —
on two flows that were tuned by real GPU runs against that chain. That is changing the
instrument without measuring it. So `MpiBaseFlow._runEnhance`'s near-copy of the
`enqueueGeneration` call was deleted and both flows now call `runComfyEnhance()`, which
is the single dispatch to that graph in the app; the op name and the "not in this build"
guard moved with it, which is why the declarations no longer carry `op: 'promptEnhance'`
and the plan's literal grep passes.

**The seed rule is why this mattered rather than being tidiness.** `Input_Seed` must be
spread LAST so no caller can pin it; it was written twice, in two files, and a test now
asserts the ordering in the one place it survives.

## Step 1c — the overlay (2026-09-10)

Built. **The verify mode is `user-ux`, so this section does NOT close the step** — it
records what is proven underneath the UI so that Fabio's pass is about the UI and
nothing else.

### What ran

| Check | Command | Result |
|---|---|---|
| Whole suite | `npm test` | **916 pass / 0 fail** (was 915; +1 new file) |
| New tests | `node tests/enhance-overlay.test.cjs` | **10 pass / 0 fail** |
| Repointed test | `node tests/enhance-control.test.cjs` | **7 pass / 0 fail** |
| Lint | `npm run lint` | clean, `--max-warnings=0` |
| Server boots with the key | `CUBRIC_PORT=3199 node server.js` | `/llm/status` → `{"deepinfra":{"hasKey":true},…,"defaultBackend":"deepinfra"}` |

### The shape

`MpiEnhanceDialog` (a new Compound: `MpiModal` + `MpiInput` ×3 + `MpiButton`). Short
prompt above, **Enhance**, the enhanced text editable below, OK / Cancel. The prompt
box keeps only the short prompt and holds the approved enhancement beside it as
`_enhanced = { source, positive }`.

**The iteration loop is structural, not a rule.** Enhance always reads the UPPER box,
so editing the short prompt and pressing Enhance again re-runs the recipe on the
user's own words — there is no code path by which an enhancement can be fed back into
the enhancer. That was the actual defect in the shipped control: it wrote its result
over the user's words, so the second press enhanced an enhancement.

**ONLY THE POSITIVE IS HELD BACK.** A `separate-field` recipe's negative half is
written into the box's own negative field, where it is visible and editable. "Lands in
its own channel" means the user can SEE it, not that a second hidden value rides along
— and it leaves the submit path with one source of truth for the negative instead of
two that can disagree.

**No Enter-to-confirm, deliberately.** `MpiModal` binds `modal.confirm` with
`allowWhileTyping: true`, so a dialog that listens for it turns the newline key of a
multi-line editor into OK. This one never subscribes to `confirm`.

### The negative-channel split, measured live rather than reasoned about

Step 1b recorded the labelled blob landing whole in the positive field as **parity, not
a regression**, and deliberately left it for this step. It is now cut — and the cut was
proven against the real cloud backend on the booted server, not against a fixture:

| Recipe | `negativeHandling` | Result |
|---|---|---|
| `sdxl` | `separate-field` | `POSITIVE PROMPT: landscape photography, lighthouse…` / `NEGATIVE PROMPT: bad hands 5, bad dream…` → **split, both halves clean** |
| `kling-3.0` | `separate-field` | prose scene, then `Negative Prompt: morphing textures, warped limbs…` → **split** |
| `chroma` | `none` | prose → **not cut**; the raw text stays in the positive channel |

**THE FOUR `separate-field` RECIPES DO NOT AGREE ON A FORMAT, and a splitter written
to `sdxl`'s shape is wrong for half of them.** Found by the test sweeping every
`separate-field` recipe's own `examplePrompts` rather than by reading one recipe:

- `sdxl` labels **both** halves, and its system prompt states the contract literally.
- `kling-3.0` writes an **unlabelled** positive and a **trailing `Negative Prompt:`
  block** — a different label, a different case, no positive label at all. An
  `sdxl`-shaped regex reads that as prose and welds the negative into the positive,
  silently, which is precisely the defect being fixed.
- `pony` and `illustrious` declare the field and **emit no negative block at all** —
  the author's baseline negative is a constant ladder, and a constant needs no LLM to
  write it. They parse to `null` and keep their raw text, which is correct.

So the splitter anchors on the **negative** label alone and treats everything before it
as the positive half, stripping a positive label if one is there. It is called only
when the recipe DECLARES two channels: a prose recipe that happens to write the words
"negative prompt" is not offering a second field, and cutting there would delete half
the prompt.

### Staleness is detected, never announced

The box shows the short prompt and the submit path carries the enhanced one, so an edit
to the short prompt orphans the enhancement — **and the user cannot see that, because
the thing that changed is not the thing on screen.** Storing the SOURCE the
enhancement was made from is what makes it checkable at all; the textarea's input
handler re-checks on every keystroke and the control simply drops back to un-enhanced.
No toast, no dialog — the state is the message.

### Reuse carries both texts, and the ABSENCE of one is the signal

`sourcePrompt` runs `getRunPayload()` → `startGeneration` → the sidecar
(`routes/projects.js`) → `buildPromptReusePayload()` → `injectPrompts({ enhanced })`.
Both Blocks forward it. **Every card generated before this shipped, and every
un-enhanced run, has no `sourcePrompt`** — so `positive` falls through to `prompt` and
`enhanced` is null, and reuse behaves exactly as it always did. Both branches are
asserted.

`project.json` stores only uuid strings, so the sidecar is the durable half — without
the `routes/projects.js` line, Reuse would hand back the enhancement but never the
words it was made from, and only after a reload, which is the worst kind of bug to
find.

### Owed, and why

- **FABIO'S USER-UX PASS IS THE GATE.** Nothing under the UI is left owed; what is
  owed is a person looking at it. The 18+ splash blocks any browser-driven check and
  an agent must not click it — it is an age/responsibility affirmation.
- **The ComfyUI-encoder backend end to end — STILL OWED**, and no longer for the
  reason it was owed twice: `gpu_lease.py status` reads `GPU 0 free`. What blocks it
  now is that Vision's own engine (`:48188`) is not running and the run is a UI flow
  behind the splash. It batches with the user-ux pass.
- **Character Sheet + Music Maker RUN — same batch, same reason.**

### One thing that looks like scope creep and is not

`tests/enhance-control.test.cjs`'s "the prompt box imports the local service" assertion
was **repointed, not deleted**. Step 1c moved the CALL one layer down — the overlay
owns it, the box owns the button and the approved result — so the test now asserts the
box reaches the dialog AND the dialog reaches the service, and that NEITHER carries
`connectorOps` or a capability probe. The property under test is unchanged: whatever
runs the enhance runs it locally.
