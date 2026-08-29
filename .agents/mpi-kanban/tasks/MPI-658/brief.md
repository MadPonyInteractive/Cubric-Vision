# MPI-658 — Flow dispatch over the connector, and agent-supplied audio

## The finding

The ask was "the cubric-vision skill does not document text-to-speech". The skill was
not the problem. `POST /connector/generate` required `modelId`, and a Flow dispatches
with `model.id: null` — it is an operation, not a model. So **no Flow was reachable
from an agent at all**, and both TTS surfaces are Flows:

- `flowChatterBox` — "Text to Speech". Requires a voice sample (`audio1`). Its
  `MpiLoadAudio#54` carries `block_if_empty`, so a run with no voice returns an
  ExecutionBlocker: zero output, and ComfyUI reports **SUCCESS**.
- `flowDramaBox` — "DramaBox". Voice reference optional; prompt-only arm supported.

Documenting a capability that does not exist would have been the wrong deliverable.

## What shipped (43623fa8)

`flowId` + `fields` + `media` on the same route, as an **alternative** to `modelId`
rather than a merge — sending both is refused, because whichever won would run
something the caller did not fully describe and still answer `ok: true`.

Fields resolve through `resolveFlowFieldValues` (`js/utils/declaredFields.js`), the
same declared-field dialect the flow frame renders from, so `derived` is computed
after the caller's overrides exactly as it is under a click. A third implementation
of that vocabulary would have re-opened the failure MPI-607 built `derived` to close:
a mis-derived arm returns audio, in the wrong language, with no error.

Media is **by reference, never bytes**. `place-preview-asset` already accepted a plain
absolute path, so the caller stages its own file and passes back the returned
`/project-file?path=…` url. That keeps "media staging belongs in the route,
server-side" true instead of growing the SSE relay the route is meant to outlive.

## Why it is not `done`

Agent-verified end to end, but the *point* of the card is a sibling-repo agent Fabio
already has waiting in MadPony-Identity with its own voice sample. Until that agent
drives it, the cross-repo half is proven only from inside this repo.

## Deliberately not built

The shipped 56-voice library has no HTTP listing, so an agent supplies its own sample
rather than naming a stock voice. Recorded in the skill under "Not covered yet".
