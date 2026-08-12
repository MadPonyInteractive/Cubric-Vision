# MPI-546 Validation

## State: COMPLETE — automated checks green, live smoke passed

All five phases shipped and verified 2026-08-12. The live smoke also found and fixed
a duplicate-dispatch bug (commit `99ea5767`).

## Passed

- `npm test` — **575 passed, 0 failed** (2026-08-12, full suite).
- `tests/agent-generation-relay.test.cjs` (new, 6 tests) — drives the real router
  over a real socket with a fake renderer: job frame delivery, result settling the
  held caller, error pass-through, `APP_UNAVAILABLE` with no renderer, required-field
  400s, unknown job id as a no-op, and `generationSubmit` tracking subscription.
- `tests/connector-responder.test.cjs` (3 added) — `handleGenerationSubmit` posts to
  `/connector/generate`, forwards the route's error rather than inventing one, and
  returns a `RUNTIME_ERROR` envelope when the route is unreachable.
- `npx eslint js/shell/agentDispatch.js js/shell.js --max-warnings=0` — clean.

## Live smoke attempt 2026-08-12 — partial, and it FOUND A BUG

Ran against an isolated instance (`npm run app:isolated`), user's app on :3000
untouched throughout (verified 200 at every step). Profile reported
`hasApiKey:false`, so it could not reach the user's paid RunPod Pod — local engine
only, confirmed before any submit.

**Proven live:**
- `GET /connector/capabilities` → `generationSubmit: true`, i.e. `initAgentDispatch()`
  runs at boot and the renderer subscribes. Phase 2 is wired.
- The full round trip works: request → SSE frame → `agentDispatch` → result POST →
  the held HTTP response settles. This is the relay's whole job and it does it.
- Guards fire live with the right codes: `NO_PROJECT`, `BAD_REQUEST`.

**Bug found and fixed (commit `99ea5767`):** the relay broadcast each job to EVERY
subscribed renderer. Two renderers ⇒ both dispatch ⇒ the user pays for two
generations and sees one result, since the first reply settles the caller and the
rest are discarded. It surfaced as a deterministic `NO_PROJECT` (4/4) because the
Electron window, subscribed first with no project open, always answered. Now
delivered to the newest live subscriber only, pinned by a test that fails under
the old behaviour.

**Not proven: no generation has actually run.** The submit never reached
`enqueueGeneration` with a project open, so a real gallery card has still never
been produced by this path. Blocked on instance churn, not on the code: repeated
kill/relaunch cycles left the fixed-profile instance wedged mid-boot (`app:isolated`
uses one fixed profile, so a killed instance's remnants collide with the next
launch). The user's own app was never a candidate for any kill.

## Live smoke PASSED 2026-08-12 (instance on :50478)

Unblocked by pointing the isolated instance at the real weights, Fabio's suggestion:
`CUBRIC_MODELS_ROOT="G:/CubricModels" npm run app:isolated`. **No code change was
needed** — the launcher already forwards its env, and `main.js` resolves
`CUBRIC_MODELS_ROOT` into the server env. The user's own app is already pointed at
that same folder (`/comfy/get-path` -> `G:\CubricModels`, `isDefault:false`), so this
matches production rather than inventing a config.

Worth knowing WHY the isolated profile failed before, because it was not what I
assumed: the ENGINE is already shared (`c:/AI/Mpi/Cubric-Vision/engine`, the repo
default, since no `.engine-config.json` exists), and its `extra_model_paths.yaml`
already sets `base_path: G:/CubricModels`. ComfyUI could always see the weights. What
was missing was the APP-side dep state that `isOperationInstalled` reads — which is
what produced `OP_UNAVAILABLE`.

**Evidence:**

- `/comfy/get-path` -> `G:\CubricModels`; `/connector/capabilities` ->
  `generationSubmit: true`; `/comfy/status` -> running + ready.
- `isOperationInstalled('krea2','t2i')` -> **true** (the previous blocker).
- `POST /connector/generate` `{krea2, t2i, "a lone rider at dusk..."}` -> **`ok:true`**
  in **97.8s**; output `t2i_003.png`, 768x1344, itemId `d38147d8`, groupId `94891b2e`.
- On disk: `Media/t2i_003.png` (1,000,891 bytes), `Media/.meta/d38147d8-….json`
  carrying the exact prompt / modelId / operation / `generationMs`, plus its
  `.thumb.jpg`.
- **`project.json` carries group `94891b2e` with `history: [d38147d8]`** — the project
  LEARNED about the image. That is precisely what a `/proxy/prompt` POST fails to do,
  and it is the whole reason this card exists.

Every phase of the card is verified live. Nothing outstanding.

## Superseded — what was outstanding before the smoke

**Phase 5 — live smoke.** Nothing has executed a real generation through this path.
What the automated tests do NOT cover, because they stub the renderer:

- `js/shell/agentDispatch.js` has never run. Its guards, config shape and the
  `enqueueGeneration` call are unexercised.
- That a submitted job actually lands as a **real gallery card** with a `.meta`
  sidecar — the entire point of the card.
- That `initAgentDispatch()` subscribes on boot and the SSE survives the app's
  lifecycle.

### To finish

**Do it in the user's own app, not an isolated instance.** The isolated profile has
no models installed, so a `t2i` there fails on `OP_UNAVAILABLE` for reasons that say
nothing about this code — and `app:isolated`'s fixed profile makes kill/relaunch
cycles wedge. The user's app has the engine and the weights; it needs one restart to
pick up the new routes. Keep exactly ONE renderer open (no dev browser tab), or the
newest-subscriber rule decides which one gets the job.

1. Restart the user's app so `routes/connector.js` and `js/shell/agentDispatch.js` load.
2. Confirm `GET /connector/capabilities` reports `generationSubmit: true`.
3. Open a scratch project (`mpi-546-smoke` already exists), then:
   ```sh
   curl -s -X POST "$URL/connector/generate" -H 'Content-Type: application/json' \
     -d '{"modelId":"krea2","operation":"t2i","positive":"a lone rider at dusk"}'
   ```
4. Assert: a gallery card appears, `Media/.meta/<uuid>.json` is written, and the
   response carries `output.filePath` pointing at the real file.
5. Negative check: close the project and confirm `NO_PROJECT` rather than a hang.

Needs an installed model and a running engine, which is why it did not fit this
session.
