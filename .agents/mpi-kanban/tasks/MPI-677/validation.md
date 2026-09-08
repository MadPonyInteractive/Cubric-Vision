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
