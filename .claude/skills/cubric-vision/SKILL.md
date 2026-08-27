---
name: cubric-vision
description: Drive a running Cubric Vision desktop app from an agent over its local HTTP API - list and create projects, add and read media, inspect and edit generation metadata, control the ComfyUI engine, and create, monitor and stop a RunPod remote GPU. Use when asked to work with a Cubric Vision project, add or fetch assets from one, check what a project contains, start or stop the engine or a remote pod, read pod cost and disk telemetry, or automate any Vision workflow. Also covers the on-disk project format so a project can be read without the app running - including how to recover the exact prompt, negative prompt, model and settings behind any generated image from its sidecar (they are NOT in the PNG and NOT in project.json), which is the read to do before advising on any prompt. Read this skill before helping a user iterate on a generation: it sets the rule that prompts are handed back whole and pasteable, never as fragments to splice. Dispatches text-to-image and text-to-video generations that land as real gallery cards - see Dispatching a generation (media inputs are not supported yet).
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

## Hand over whole prompts, never fragments

When a user is generating and you are advising, **every prompt you give back is
the complete text, ready to paste over what is in the box** - positive in one
block, negative in a second block, both whole even when only six words changed.

Never hand over a fragment, a diff, a "add this to the end", or a "swap X for
Y". The user is at the app with a pod running. Finding the insertion point in a
400-word prompt costs them more time than reading a full one, gets spliced wrong
under time pressure, and a wrong splice burns a paid generation.

This applies to the negative prompt too, and it applies when the change is
trivial. If you do not have the current prompt text, **read it from the sidecar
first** (see Recovering the prompt behind an image) rather than asking the user
to paste it.

Say what changed in one line *after* the blocks, never instead of them.

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

### Creating a project

```bash
curl -s -X POST "$CUBRIC_URL/create-project" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rider Study"}'
```

Body: `name` (defaults to `Untitled`), plus an optional `folderPath` naming the
**parent** directory. With no `folderPath` the project lands in the default
projects root — `Documents/Cubric Vision/Projects` unless the install overrides
it — which is the only root `/list-projects` scans for free.

Returns `{"success": true, "project": {...}}`. Keep `project.folderPath`: it is
the key every other project endpoint takes, not the id. The route creates
`Media/`, `project.json` and `project.md`, and on a folder-name collision
appends `_<first 8 of the id>` rather than merging into the existing project.

**The folder name is not always the project name.** Each of `<>:"/\|?*` is
replaced with `_` — replaced, not removed — and only in the folder, while
`project.name` keeps exactly what you sent. So `"Rider: Dusk"` is a project
*named* `Rider: Dusk` living in a folder called `Rider_ Dusk`. Never rebuild a
path out of the name you sent; use the returned `folderPath`.

Two things it does **not** do:

- **A custom `folderPath` is not registered.** `/list-projects` scans the default
  root plus a durable registry, so a project made anywhere else is invisible to
  the picker until you `POST /add-project-path` with its **parent** dir.
- **A running app does not notice.** The project exists on disk, but an open
  Vision window keeps its old list until it re-lists (back to the landing
  screen), and the new project does not become the open one.

### Creating a project, then generating into it

`/connector/generate` runs in **whatever project the app currently has open** —
creating a project does not make it that project. Open it explicitly:

```bash
curl -s -X POST "$CUBRIC_URL/connector/open-project" \
  -H 'Content-Type: application/json' \
  -d '{"folderPath":"C:/Users/me/Documents/Cubric Vision/Projects/Rider Study"}'
```

`folderPath` is the key, the same one `/create-project` and `/list-projects` hand
back. It opens the project for real — the app navigates to its gallery, exactly
as if the user had clicked the row — so it is a **visible change to what is on
their screen**. Returns `{"ok": true, "output": {folderPath, name, groupCount}}`
read back from the app's live state, so `groupCount` is a cheap confirmation you
landed where you meant to.

The full sequence:

1. `POST /create-project` → keep `folderPath`.
2. `POST /add-project-path` with the parent dir, if you passed a custom `folderPath`.
3. `POST /connector/open-project` with the `folderPath`.
4. `GET /connector/capabilities`, confirm `generationSubmit`.
5. `POST /connector/generate`.

**Do not skip step 3 and hope.** `NO_PROJECT` is the good outcome; the bad one is
the user having something open, in which case the run succeeds into the wrong
project and the response says `"ok": true` either way.

Errors: `BAD_REQUEST` (no `folderPath`), `NO_SUCH_PROJECT` (nothing readable
there — the message carries the underlying reason), `APP_UNAVAILABLE` (no window
listening).

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
| `thumbPath` | same form. `.thumb.jpg` for a video (256px first frame), `.thumb.webp` for an image (512px, alpha-preserving) |
| `thumbPathLg` | image only, and only when the source is WIDER than 1280 — the 1280px `.thumb.1280.webp` a large gallery card mounts. Absent means the ORIGINAL is that tier |
| `proxyPath` | video only, and only when the clip is TALLER than 720p — the `.proxy.mp4` the gallery hovers. The viewer and every export still read `filePath` |
| `operation` | `t2i`, `inpaint`, `detail`, … |
| `prompt`, `negativePrompt` | exact text used |
| `modelId` | e.g. `krea2` |
| `seed` | `-1` means randomised |
| `generationSettings` | dimensions, ratio, LoRA slots, quality tier, injection params |
| `pixelDimensions` | `{ w, h }` |
| `generationMs` | wall-clock for that generation |
| `createdAt` | ISO timestamp |
| `notes` | Free text from the gallery's Card notes. Absent until first saved. |

### Naming and notes land in two different files

Both are easy to get wrong from outside the app, and both matter whenever a
document elsewhere has to point at an image.

**A generation's filename is not the user's to choose.** Vision names its own
output by operation — `t2i_052.png`, `inpaint_007.png` — and that is the name on
disk, permanently. Renaming a card in the gallery sets `customName` on the
**group in `project.json`** and moves nothing; the sidecar's `filePath` still
resolves to the original file.

So **anything outside the app must cite the app's filename**, and no script may
assume a user-chosen name exists on disk. A card renamed to "Marshall" is still
`t2i_017.png`. Only files a user saves into `Media/` by hand — composites built
in a graphics editor, recorded audio — carry names the user picked.

**Card notes are per generation, not per card.** The gallery writes them to the
card's *selected history item*:

```sh
curl -s -X POST "$CUBRIC_URL/project-media/$PROJECT_ID/update-meta?folderPath=<urlencoded project folder>" \
  -H 'Content-Type: application/json' \
  -d '{"itemId":"<uuid>","updates":{"notes":"…"}}'
```

**`folderPath` goes in the query string here, not the body.** Corrected
2026-08-12 on the first live run against a running app. The handler reads
`req.query.folderPath` and `req.body.{itemId, filename, updates}`, so sending it
in the body returns a bare `400 folderPath, updates and (itemId or filename)
required`, which reads like a missing field rather than a misplaced one. It is
also inconsistent with `/project-notes` and `/project-notes/save` below, which
both take `folderPath` **in the body**. Check which one you are calling.

They land in `Media/.meta/<uuid>.json` and travel with the folder when a project
is shared. The consequence: **iterate that card again and the new history item
has no notes.** Notes written before a re-roll do not follow the card forward.
When the text describes the card rather than the take, re-apply it to the new
selected item or keep it in `project.md`.

`project.md` is the project-wide equivalent — free text at the project root, one
file, read and written by `/project-notes` and `/project-notes/save`. Whole
project in `project.md`, one image in that image's notes.

For a project that will be published or handed to somebody, fill both in
deliberately. A reader in the gallery sees card notes without leaving the app,
which makes them the only documentation that reliably gets read.

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

### Recovering the prompt behind an image

The most common read this skill gets asked for, and the one with the most wrong
turns. **The prompt lives only in `Media/.meta/<uuid>.json`.** It is not in
`project.json`, and Vision writes **no PNG metadata at all** - `im.info` on a
`t2i_*.png` comes back empty, which reads like a stripped or corrupt file rather
than a design choice. Opening the PNG first is wasted work every time. Measured
2026-08-12, chasing the prompt behind `t2i_059`.

Given the name the gallery shows, e.g. `t2i_059`, write a small script to a file
and run it by path - never a heredoc on Windows:

```python
import json, glob
want = "t2i_059"                       # displayName, what the gallery shows
for f in glob.glob(r"<project>\Media\.meta\*.json"):
    d = json.load(open(f, encoding="utf-8"))
    if d.get("displayName") == want:
        print("PROMPT:\n" + (d.get("prompt") or ""))
        print("\nNEGATIVE:\n" + (d.get("negativePrompt") or ""))
        print("\nmodel:", d.get("modelId"), "seed:", d.get("seed"))
```

Going the other way, from a gallery card to its live sidecar, honour
`selectedIndex`: the card in `project.json` gives `history[selectedIndex]`, and
that uuid names the `.meta` file. The last element of `history` is a different
take.

A card the user renamed matches on `customName` in `project.json`, never on a
filename - see the naming rule above.

The same sidecar is the record of **what a setting was actually set to**:
`generationSettings.injectionParams` carries the real width, height, ratio label,
stylization strength and turbo flag for that take. When a user asks why two
generations differ, diff two sidecars before theorising.

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

## Dispatching a generation

`POST /connector/generate` submits a prompt and lands a **real gallery card** —
history entry and `.meta` sidecar included — because it goes through the same
queue the PromptBox uses (MPI-546).

```bash
curl -s -X POST "$CUBRIC_URL/connector/generate" \
  -H 'Content-Type: application/json' \
  -d '{"modelId":"krea2","operation":"t2i","positive":"a lone rider at dusk"}'
```

Body: `modelId` and `operation` are required; `positive`, `negative` and
`injectionParams` are optional. **The request resolves when the generation
finishes**, not when it is queued, so expect it to block for as long as the run
takes (a queued video can be minutes; the route gives up after 30 and the
generation carries on in the app regardless).

**`modelId` is the ModelDef id, and it is not the name.** They come from
`js/data/modelConstants/models.js` (grep `id: '`) - `klein-4b`, not `klein`;
`minimax-h3-ref2va`, not `minimax-h3`. A wrong one returns `UNKNOWN_MODEL`,
which reads like the model is not installed when it is only misspelled.

**`injectionParams` keys are logical names, not node titles.** `Width`,
`Height` and `Ratio_Label` for size. A control that shares one node with
another addresses its own widget through a dotted key - the style rack is
`Input_Style_Selector.selector` (an integer index into the model's
`styleLoraLabels`) and `Input_Style_Selector.strength_model` (the stylization
float). The authority is each control's `getInjectionParams()` in
`js/components/Organisms/MpiPromptBox/PromptBoxControls.js`.

Raw `injectionParams` always wins over anything the app resolves, which makes
it the escape hatch for a parameter with no named form yet. **It does not
reach the sidecar's `controlState`**, so a generation steered this way records
the project's saved controls instead of the ones it ran with, and Reuse
restores the wrong thing (MPI-556).

Success returns the item, so a follow-up run can consume it:

```json
{ "ok": true, "output": { "itemId": "...", "groupId": "...", "type": "image",
  "filePath": "C:/.../out.png", "seed": 12345, "pixelDimensions": {"w":1024,"h":1024},
  "generationMs": 8410 } }
```

Failure returns `{"ok": false, "error": {"code": ..., "message": ...}}`:

| Code | Meaning |
| --- | --- |
| `APP_UNAVAILABLE` | No Vision window is listening. The app must be OPEN. |
| `NO_PROJECT` | No project is open. The run uses whatever project the app has open — it never switches for you. |
| `UNKNOWN_MODEL` | No model with that id. |
| `OP_UNAVAILABLE` | The model does not support that operation, or its weights are not installed. |
| `MEDIA_UNSUPPORTED` | The operation needs image/video input, which this endpoint cannot supply yet. |
| `CANCELLED` | Cancelled, or produced no output. |
| `TIMEOUT` | No result in 30 minutes. The generation may still be running. |

Check `generationSubmit` in `GET /connector/capabilities` to confirm a window is
listening before submitting.

### What it does not do yet

- **No media inputs.** Text-to-image and text-to-video only — an op with a
  required image/video slot is rejected by name with `MEDIA_UNSUPPORTED`.
- **No job status or cancellation.** One submit, one result.

Project switching is no longer on this list — `POST /connector/open-project`
covers it (see Creating a project, then generating into it).

### Still true: do not POST a graph to `/proxy/prompt`

It **runs on the engine and produces nothing in the UI** — no card, no history
entry, no `.meta` record. The picture exists and the project never learns about
it. Use `/connector/generate`.

## Reference slots are positional

When a user stages reference images in the PromptBox, they become `<Picture 1>`,
`<Picture 2>` and so on **in load order**, and there is no name-based element
system. A prompt that says `<Picture 2>` means whatever was loaded second.

So any prompt handed to a user must be accompanied by an explicit numbered load
list. Never write a prompt citing picture numbers without saying, in order, which
file each number is.

**To recover the load list from a finished generation**, read
`generationSettings.mediaItems` in its sidecar: entries carry `role`
(`inputImage`, `inputImage2`, `inputImage3`, or `startFrame` for i2i) in slot
order. But `originalUrl` often points into `Media/.preview-assets/<64 hex>.png`
rather than at a source file, because staging copies the image.

**That hex name is the sha256 of the staged file's own bytes**, and staging is
byte-exact, so the source is recoverable: hash every `Media/*.png` and match.
Verified 2026-08-12 on `ref2v_ms_005`, which resolved to `i2i_004.png`,
`inpaint_005.png` and `t2i_050.png`.

```python
import glob, hashlib, os
want = "bd98dd04...full 64 hex from the originalUrl..."
for f in glob.glob(r"<project>\Media\*.png"):
    if hashlib.sha256(open(f, "rb").read()).hexdigest() == want:
        print(os.path.basename(f))
```

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
