# MPI-546 Plan — `generation.submit`: let an agent dispatch a real generation

## Problem

The loopback HTTP surface reads projects, writes notes, enhances prompts, reads Pod
stats and shuts the app down — and never dispatches. Dispatch lives entirely in the
renderer (`generationService.startGeneration`, `commandExecutor`, `generationStore`,
PromptBox). POSTing a graph to `/proxy/prompt` runs on the engine and produces
**nothing in the UI**: the picture lands on disk, the project never learns it exists,
so no card, no history entry, no `.meta` sidecar.

## Design

### The seam: the HTTP route is the contract, the relay is disposable

`POST /connector/generate` is the durable surface. Behind it, v1 relays the job to the
renderer over SSE because that is where dispatch lives. If dispatch is ever extracted
server-side, **the route stays and its body swaps** — callers never see the relay.

This is load-bearing for the CLI direction (see `research/cli-anything.md`): a generated
CLI codes against the route, never the transport. It only holds while the relay stays
dumb. One job shape in, one result shape out. Media staging, job status, cancellation
and queue introspection belong in the route, server-side, where they survive the swap.

### Why not the alternatives

- **Extract dispatch to the server (headless).** `generationService` imports `MpiToast`,
  `PromptBoxControls.resolveControlDefaults` and `ce` from dom utils; `commandExecutor`
  pulls `state`, `Events`, `downloadService`, `progressAggregator`. 3,670 lines
  irreducibly renderer-bound. A separate project, not a step.
- **Piggyback `/comfy/events/stream`.** Opened *per generation* by `commandExecutor`,
  not always-on. Cannot carry inbound commands.
- **Main-process IPC.** Three hops (`server` fork → `process.send` → main →
  `webContents.send`), and dead in the dev browser.
- **Polling.** Worse than SSE for no gain.

### Precedent to copy

`js/services/flowService.js` is already a headless producer into the queue: builds a
config, calls `enqueueGeneration(config, cb, { scope: 'gallery' })`, real card lands on
completion, no Block involved. Agent submit is a third producer of the same shape.
Going *through* `enqueueGeneration` (never around it) is what keeps the dispatch guards
and the lane/store contract intact.

## Scope for v1

- Runs in **whatever project is currently open**; clean error when none is. An agent
  switching the user's project out from under them is a bigger decision than this card.
- **No media inputs** — text-to-image / text-to-video ops only. Staging media by
  reference is the natural follow-up, tracked in `## Follow-ups`.

## Phases

### Phase 1: Server job relay
`routes/connector.js` — always-on SSE `GET /connector/jobs/stream`, `POST
/connector/generate` (hold the response until the renderer answers or times out),
`POST /connector/jobs/:id/result`. Clean error envelope when no renderer is subscribed.
**Verify:** unit test drives the relay with a fake subscriber; no app needed.

### Phase 2: Renderer dispatch listener
New `js/shell/agentDispatch.js` modelled on `flowService`: subscribe to the stream,
resolve `getModelById`, guard project-open + op-installed, build config, call
`enqueueGeneration(..., { scope: 'gallery' })`, POST the outcome back. Booted from
`js/shell.js` beside `initFloatLatentBridge()`.
**Verify:** unit test on the config-building + guard logic.

### Phase 3: Connector capability
`generation.submit` in `resources/cubric/connector-manifest.json`; handler in
`services/connectorResponder.js` POSTing to `/connector/generate`, exactly as
`handleMemoryRelease` POSTs to `/comfy/unload`. Thin wrapper — plain HTTP stays the
primary entry so it works with no broker running.
**Verify:** extend `tests/connector-responder.test.cjs`.

### Phase 4: Docs + skill
Kill the "Known gap" section in `.claude/skills/cubric-vision/SKILL.md`, document the
endpoint. Add the third-producer seam to `docs/generation-lifecycle.md`.
**Verify:** re-read; no stale claim that dispatch is impossible.

### Phase 5: Live smoke
`npm run app:isolated` (never :3000 — that is the user's session). POST a real submit,
confirm a gallery card appears, `.meta` sidecar written, project knows about the image.
**Verify:** the card and the sidecar on disk.

## Verification

**Verify mode:** auto

- `npm test` green (incl. connector responder + new relay tests).
- Live smoke on an isolated instance produces a real gallery card + `.meta` sidecar.

## Follow-ups (not this card)

- Media inputs by reference (staging path, roles) — the obvious v2.
- Job status / cancellation over the route.
- Evaluate `/cli-anything` against the finished surface — see `research/cli-anything.md`.

## Current State

Phase 1 starting.
