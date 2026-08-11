---
name: cubric-vision
description: Drive a running Cubric Vision desktop app from an agent over its local HTTP API - list and create projects, add and read media, inspect and edit generation metadata, control the ComfyUI engine, and create, monitor and stop a RunPod remote GPU. Use when asked to work with a Cubric Vision project, add or fetch assets from one, check what a project contains, start or stop the engine or a remote pod, read pod cost and disk telemetry, or automate any Vision workflow. Also covers the on-disk project format so a project can be read without the app running. Does NOT dispatch generations - see the Known gap section.
user-invocable: true
metadata: {"openclaw":{"emoji":"👁️","os":["win32","darwin","linux"],"requires":{"anyBins":["curl"]},"primaryEnv":"CUBRIC_URL"}}
---

# Cubric Vision

Cubric Vision runs an Express backend on loopback. Everything below is reachable
with plain HTTP from any agent on the same machine, no SDK and no MCP server.

This skill is one of a family. Cubric Studio is the agentic hub that orchestrates
the Cubric apps through skills like this one; each app gets its own, in the same
shape.

## Before anything else

**Base URL**: `http://127.0.0.1:3000`, overridable with `CUBRIC_PORT`. Resolve
`$CUBRIC_URL` first if it is set, otherwise use the default.

**Almost every endpoint is `POST` with a JSON body**, including the ones that
only read. `/list-projects` and `/get-project` are POSTs. Do not assume REST
conventions; use the verbs in the tables below.

**Check the app is up before doing anything else.** A connection refused means
Vision is not running, and nothing here will work:

```sh
curl -s -m 3 http://127.0.0.1:3000/comfy/status
```

There is no auth on loopback. Remote-pod tokens are attached server-side and
never reach a client, so never ask a user for one.

## Projects

| Verb | Path | Purpose |
|---|---|---|
| POST | `/list-projects` | Every known project with id, name, folder path |
| POST | `/get-project` | One project's full record including `itemGroups` |
| POST | `/create-project` | New project |
| POST | `/update-project` | Write a project record back |
| POST | `/update-project-settings` | Settings only |
| POST | `/validate-project` | Integrity check |
| POST | `/delete-project` | Remove a project |
| POST | `/add-project-path` | Register an existing folder |
| POST | `/remove-project-path` | Unregister without deleting |
| POST | `/project/cleanup-assets` | Drop orphaned media |
| POST | `/project-notes`, `/project-notes/save` | Read and write `project.md` |

Start with `/list-projects` to get an id, then `/get-project` for its contents.

## Media

| Verb | Path | Purpose |
|---|---|---|
| GET | `/project-media/:projectId` | List a project's media |
| GET | `/project-media/:projectId/download/:filename` | Fetch one file |
| DELETE | `/project-media/:projectId/:filename` | Delete one file |
| POST | `/project-media/:projectId/upload` | Add media |
| POST | `/project-media/:projectId/upload-raw` | Add media, raw body |
| POST | `/project-media/:projectId/update-meta` | Edit a media item's metadata |
| POST | `/project-media/:projectId/extract` | Extract a frame |
| POST | `/project-media/:projectId/probe-videos` | Probe video metadata |
| GET | `/project-media/:projectId/validate-preview-assets` | Check preview assets |
| POST | `/project-data/:projectId/upload` | Upload project data |
| GET | `/project-file?path=<urlencoded absolute path>` | Serve any project file |

`/project-file` is how the app itself refers to media internally, and the stored
`filePath` values are already in that form with a `&v=<timestamp>` cache buster.
To turn a stored `filePath` into a real path, URL-decode the `path` query
parameter.

## The on-disk format

A project is a folder and it can be read with no app running, which is often the
faster move for bulk analysis.

```
<project folder>/
  project.json        the record: id, name, folderPath, itemGroups
  project.md          free-text notes
  Media/
    t2i_017.png       generated and imported media, named by operation
    .meta/
      <uuid>.json         one per generation: prompt, settings, timings
      <uuid>.thumb.jpg    small preview, cheap for an agent to read
```

**`project.json` → `itemGroups[]`** is the gallery. Each group is one card:

```json
{
  "id": "bf6c9b34-…",
  "type": "image",
  "name": "t2i_017",
  "customName": "Marshall",
  "selectedIndex": 2,
  "favourite": false,
  "history": ["7381e330-…", "4424ffef-…", "bc7071c0-…"]
}
```

`history` is the iteration chain in order, each entry a uuid naming a
`.meta/<uuid>.json`. `selectedIndex` is which one is currently shown, so
**`history[selectedIndex]` is the live version** — not the last element. Reading
the wrong one is the most common mistake here. `customName` is the user's label
and `name` is the generated one; prefer `customName` when it exists.

**`.meta/<uuid>.json`** carries everything about one generation:

| Field | Notes |
|---|---|
| `displayName` | e.g. `t2i_017`, matches the file in `Media/` |
| `filePath` | `/project-file?path=…` form, URL-decode to get the real path |
| `thumbPath` | same form, points at the `.thumb.jpg` |
| `operation` | `t2i`, `inpaint`, `detail`, … |
| `prompt`, `negativePrompt` | exact text used |
| `modelId` | e.g. `krea2` |
| `seed` | `-1` means randomised |
| `generationSettings` | dimensions, ratio, LoRA slots, quality tier, injection params |
| `pixelDimensions` | `{ w, h }` |
| `generationMs` | wall-clock for that generation |
| `createdAt` | ISO timestamp |

**Read the `.thumb.jpg` files, not the PNGs, when surveying a project.** Sources
are frequently 3 to 5 MB each; the thumbnails are 15 to 45 KB and are enough to
judge composition, colour and framing. Only open a full-size file when the
question genuinely needs detail.

To map a project's media to its prompts without the app:

```sh
cd "<project>/Media/.meta" && for f in *.json; do
  echo -n "$f | "; grep -o '"displayName": "[^"]*"' "$f"
done
```

## Engine control

| Verb | Path | Purpose |
|---|---|---|
| GET | `/comfy/status` | Engine up, and the readiness probe for this skill |
| POST | `/comfy/start`, `/comfy/stop` | Engine lifecycle |
| POST | `/comfy/unload` | Free VRAM; body `{ "deep": true }` for a deep release |
| POST | `/comfy/needs-restart` | Whether a restart is pending |
| POST | `/comfy/refresh-models` | Re-scan model folders |
| GET | `/comfy/list-files`, `/comfy/model-folders`, `/comfy/extra-folders` | Model inventory |
| POST | `/comfy/models/check`, `/comfy/models/check-local` | Presence checks |
| POST | `/comfy/import-model` | Import weights |
| GET | `/comfy/get-path`, POST `/comfy/set-path` | Models root |
| GET | `/comfy/events/stream` | Server-sent events for live progress |

`/comfy/events/stream` is an SSE endpoint and the right way to watch a long
operation rather than polling.

**`/comfy/set-path` rewrites a single global `extra_model_paths.yaml`.** Two
processes touching it concurrently will race. Do not call it as a side effect of
anything else.

## RunPod remote engine

Vision drives a remote GPU while the app stays local. It deploys a Cubric-owned
Secure Cloud pod running a FastAPI wrapper in front of ComfyUI, reached through
RunPod's HTTP proxy. Community Cloud is unsupported.

| Verb | Path | Purpose |
|---|---|---|
| GET, POST | `/remote/mode` | Read or set remote mode |
| GET | `/remote/pod/specs` | Available pod specs |
| POST | `/remote/pod/create` | Create a pod |
| POST | `/remote/pod/reconnect` | Reattach to a running pod |
| POST | `/remote/pod/stop-active` | Stop, keeping the volume |
| POST | `/remote/pod/delete-active` | Delete |
| POST | `/remote/pod/teardown`, `/cleanup-orphans` | Clean up |
| GET | `/remote/pod/stats` | RAM and VRAM telemetry |
| GET | `/remote/pod/disk` | Volume bytes used |
| GET | `/remote/pod/ls` | File listing plus an `accounting` block |
| GET | `/remote/comfy/status` | Remote engine health |

**A pod bills while it exists.** Treat `create` and `delete-active` as actions
that spend the user's money, confirm before calling either, and tell the user
plainly when a pod is left running. `stop-active` keeps the volume, which still
costs something; `delete-active` does not.

`/remote/pod/stats` and `/remote/pod/disk` are the honest source for how long a
session ran and what it used, which is worth more than an estimate when a cost
figure is going to be quoted anywhere.

`/remote/pod/ls` returns `accounting` with `blockBytes`, `apparentBytes` and
`phantomBytes`. During a large download the two byte figures diverge because a
partial `.part` file counts toward one and not the other. **Both halves must come
from the same response** — `/remote/pod/disk` caches its measurement for 60
seconds, which at pod download rates is gigabytes of drift.

## Connector

Vision answers capability-shaped requests from other Cubric apps.

| Verb | Path |
|---|---|
| GET | `/connector/capabilities` |
| POST | `/connector/enhance` |

Capabilities present today: `prompt.enhance`, `system.memory.release`,
`system.shutdown`. Request envelopes look like:

```json
{
  "schemaVersion": 1,
  "requestId": "req-1",
  "from": { "appId": "cubric.prompt" },
  "to": { "appId": "cubric.vision" },
  "capability": "system.memory.release",
  "input": { "deep": true }
}
```

Call `/connector/capabilities` rather than trusting that list; it is the live
answer and this file is a snapshot.

## System

| Verb | Path | Purpose |
|---|---|---|
| GET | `/system/stats` | Host stats |
| GET | `/system/gpu-info` | GPU |
| GET | `/system/list-components` | Installed components |
| GET | `/system/platform-config` | Platform config |
| POST | `/open-folder`, `/reveal-item`, `/choose-folder` | Shell integration |
| GET | `/logs/read`, `/logs/download` | Logs |
| POST | `/github/create-issue` | File an issue |

`/choose-folder` opens a **blocking OS dialog** on the user's desktop. Never call
it in an unattended run.

## Known gap: generations cannot be dispatched over HTTP

**There is no endpoint that submits a prompt and creates a gallery card.** This
is the one thing agents most want and it is genuinely absent, not undocumented.

Dispatch lives in the renderer: `generationService.js` `startGeneration`,
`commandExecutor`, `generationStore`, and the PromptBox. The Express surface
proxies ComfyUI and manages projects, models and pods, and never creates a card.

The consequence in practice: a graph POSTed straight to `/proxy/prompt` **will
run on the engine and produce nothing in the UI** — no card, no history entry, no
`.meta` record. The picture exists and the project does not know about it.

Two honest paths forward, neither built:

1. **A connector capability**, say `generation.submit`, alongside the existing
   three. This is the native shape, it reuses the envelope, and it is what Cubric
   Studio would call.
2. **Drive the real UI** with the existing Playwright/Electron harness
   (`npm run test:desktop`, specs in `tests/desktop/`, helpers `launch.js` and
   `shellWindow.js`). Everything already works because it is the real app. The
   catch: Playwright launches its **own** Electron instance with its own profile,
   so it cannot drive an app the user already has open.

Until one exists, an agent preparing generation work should write prompts and
stage reference media, and hand the actual dispatch to the user.

## Reference slots are positional

When a user stages reference images in the PromptBox, they become `<Picture 1>`,
`<Picture 2>` and so on **in load order**, and there is no name-based element
system. A prompt that says `<Picture 2>` means whatever was loaded second.

So any prompt handed to a user must be accompanied by an explicit numbered load
list. Never write a prompt citing picture numbers without saying, in order, which
file each number is.

## Tests

```sh
npm test               # unit suite, node --test, ~9s
npm run test:desktop   # Playwright/Electron UI specs, ~1.2 min
```

`node --test tests/` does **not** work; Node reads the bare directory as a module
and fails. Use `npm test` or the glob form `node --test tests/*.test.cjs`.

Neither suite runs a ComfyUI workflow, has a GPU, or dispatches a graph. Green
tests do not mean generation works.

Test **files** run in parallel, so anything writing global on-disk state races.
A new test that writes engine state must set `CUBRIC_ENGINE_ROOT` to its own temp
directory before requiring the comfy routes.

## Docs worth reading before deep work

In the Vision repo, all under `docs/`: `runpod-remote-engine.md`,
`generation-lifecycle.md`, `data.md`, `flows.md`, `testing.md`,
`project-integrity.md`, `model-library.md`, `events.md`.

Verify a named file, route or field still exists before relying on it. This file
is a snapshot of a moving app, and the live answers are `/connector/capabilities`
for capabilities and the route files under `routes/` for everything else.
