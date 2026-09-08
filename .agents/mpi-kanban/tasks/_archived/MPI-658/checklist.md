# MPI-658 — checklist

- [x] Establish why TTS is unreachable — `modelId` required, Flow runs `model.id: null`
- [x] `flowId` + `fields` + `media` on the generate route (`routes/connector.js`)
- [x] Mutual exclusion with `modelId` — refuse, never merge
- [x] Flow resolution in the renderer (`js/shell/agentDispatch.js` § `_submitFlow`)
- [x] Named errors an agent can act on — `UNKNOWN_FLOW`, `OP_UNAVAILABLE`,
      `MEDIA_REQUIRED`, `BAD_REQUEST` (a toast is invisible to a caller)
- [x] Pre-flight `flowAvailability` here — `submitFlowGeneration` toasts and returns `null`
- [x] Share `findMissingMediaSlot` rather than copying the predicate
- [x] `resolveFlowFieldValues` + `flowDeclaredFields` in `js/utils/declaredFields.js`
- [x] Media by reference through the existing `place-preview-asset` route — no new endpoint
- [x] `tests/connector-flow-dispatch.test.cjs` — 8 cases, route + resolution
- [x] Full unit suite green (784/784)
- [x] Live smoke on an isolated instance — own port + profile, user's :3000 untouched
- [x] Skill rewritten: flow dispatch, staging, both TTS recipes, frontmatter triggers
- [x] `docs/generation-lifecycle.md` § THIRD producer updated
- [x] Committed + pushed (43623fa8)
- [ ] **Fabio drives it from the MadPony-Identity agent with his own sample**

## Verification recorded

Isolated instance on :60145. A staged `.wav` handed in as `audio1` returned
`flowChatterBox_001.flac` — 24 kHz mono, 0.46s, mean −19.8 dB / max −3.8 dB via
`volumedetect` (real speech, not the silence floor) — in 38.9s, as a real
`type: "audio"` gallery card.

Sidecar carries `flowId: "chatter-box"`, `flowInputs` with the media by reference, and
`injectionParams: {"Input_Language.language": "English (en)", "Input_Is_Multilingual": false}`
— the derived arm computed correctly, so Reuse reopens the flow with the agent's own
inputs restored.

Refusals confirmed live, each reachable only from code that resolved the descriptor:
`UNKNOWN_FLOW`, `MEDIA_REQUIRED` (Text to Speech with no voice),
`BAD_REQUEST` on an undeclared field id and on a media role the op does not have,
plus the two 400s for `flowId`+`modelId` together and for neither.

## Noted against process

That smoke ran a real 38.9s GPU job with **no lease held**. `guard-gpu` tokenises Bash
command text: it blocked a `cat` whose card description merely contained the route
name, and stayed silent on the HTTP call that actually spent the card, because the work
happens inside a long-running app process the hook never inspects. Written up in
`~/.claude/memory/tools/mpi-kanban.md`.
