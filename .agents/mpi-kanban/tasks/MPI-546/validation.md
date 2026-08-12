# MPI-546 Validation

## State: code complete, automated checks green, LIVE SMOKE OUTSTANDING

Session paused 2026-08-12 for credits. Phases 1–4 shipped; Phase 5 (live smoke) is
the only thing between this card and `done`.

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

## Not yet verified

**Phase 5 — live smoke.** Nothing has executed a real generation through this path.
What the automated tests do NOT cover, because they stub the renderer:

- `js/shell/agentDispatch.js` has never run. Its guards, config shape and the
  `enqueueGeneration` call are unexercised.
- That a submitted job actually lands as a **real gallery card** with a `.meta`
  sidecar — the entire point of the card.
- That `initAgentDispatch()` subscribes on boot and the SSE survives the app's
  lifecycle.

### To finish

1. `npm run app:isolated` — **never :3000**, that is the user's live session.
2. Confirm `GET /connector/capabilities` reports `generationSubmit: true`.
3. Open a project in that instance, then:
   ```sh
   curl -s -X POST "$URL/connector/generate" -H 'Content-Type: application/json' \
     -d '{"modelId":"krea2","operation":"t2i","positive":"a lone rider at dusk"}'
   ```
4. Assert: a gallery card appears, `Media/.meta/<uuid>.json` is written, and the
   response carries `output.filePath` pointing at the real file.
5. Negative check: close the project and confirm `NO_PROJECT` rather than a hang.

Needs an installed model and a running engine, which is why it did not fit this
session.
