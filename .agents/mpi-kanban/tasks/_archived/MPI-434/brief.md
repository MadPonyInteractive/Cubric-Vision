# MPI-434 — Our ComfyUI must not share port 8188 with the user's own ComfyUI

## The report

User "micha" (the MPI-427 reporter), Windows 11, **v1.3.1** portable on `D:`, RTX 3070 Ti.
Every generation dies instantly with:

```
Node 'Input_Seed' not found. The custom node may not be installed.
```

He reported it as "1.3.1 did not fix me". It is a **different bug**. 1.3.1's fixes worked.

## What the error actually is

Not our string — ComfyUI's own `execution.py:1146`, thrown by `validate_prompt` when a
`class_type` is absent from `NODE_CLASS_MAPPINGS`:

```python
"message": f"Node '{node_title}' not found. The custom node may not be installed.",
```

`Input_Seed` is the `_meta.title` of node `503`, class **`MpiInt`** — defined in
`ComfyUI-MpiNodes/logic.py`. `Input_Seed` sits in ~every workflow we ship, so nothing
generates at all. Nothing to do with weights, Krea2, or the blocked model host.

## MPI-427's fix worked — proved by his own log

`app-20260803-154751.log` shows MpiNodes installing cleanly from github.com (the host his
ISP does NOT block):

```
15:30:09.869  Extracting zip: ...\custom_nodes\ComfyUI-MpiNodes.zip
15:30:09.923  Renamed ComfyUi-MpiNodes-69a4333... -> ComfyUI-MpiNodes
15:30:09.924  node commit marker stamped for ComfyUI-MpiNodes
```

So the node IS on disk, at the pinned commit, before any of the failed generations. Do not
re-open MPI-427 for this.

## Root cause — the prompt never reached OUR engine

Four dispatches across two app sessions, every one impossibly fast after the app asked for
a ComfyUI start:

| Start requested | Error returned | Delta |
| --- | --- | --- |
| 15:47:49.487 | 15:47:49.552 | **65 ms** |
| 15:48:59.206 | 15:48:59.252 | **46 ms** |
| 15:48:59.206 | 15:49:02.100 | 2.9 s (mid-boot) |

No embedded Python boots in 65 ms. ComfyUI registers custom nodes **before** it binds the
port — `main.py:508` runs `nodes.init_extra_nodes(...)` to completion inside
`start_comfyui()`, and only the `start_all()` at `main.py:542` serves HTTP. So a process
that answers `/prompt` has already finished its custom-node scan. The responder was
therefore **already warm**, and it was not ours.

Corroborating: neither log ever prints `Import times for custom nodes`, `Loading node pack`
or `Starting server`. Across three spawns, our ComfyUI never finished booting — it loses
the port bind to the incumbent and dies quietly.

He had his own ComfyUI running on the default 8188. That install has no MpiNodes.

## Why the app happily talked to a stranger

`routes/comfy.js:190` — readiness is "does ANYTHING answer on this port":

```js
const ready = await ax.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, { timeout: 1000 })
    .then(() => true).catch(() => false);
```

Its only other guard is `processState.activeComfyProcess`, which `routes/comfy.js:419` sets
the instant we `spawn()` — long before the child is listening. Port is hardcoded at
`routes/shared.js:134`, and the spawn path never checks occupancy. So: incumbent answers
`/history` -> we call ourselves ready -> we dispatch into his ComfyUI -> no `MpiInt`.

Known trap, already in memory as `tool_verify_through_the_app` ("hardcoded port +
idempotent launcher = the app silently dispatches into the user's bench"). It bit us in
testing; now it has cost a user his whole install.

## The fix — two parts, both small

1. **Move our engine off the ComfyUI default.** `COMFYUI_PORT` 8188 -> **48188**. Below the
   Windows ephemeral floor (49152), not IANA-assigned to anything common, and not a port a
   second hand-run ComfyUI lands on (8189/8190/8288 all are). Dodges the collision in the
   case that actually happens: the user runs stock ComfyUI on stock 8188.
2. **Refuse to adopt an engine we did not start.** A port move alone does not fix the
   class — `ready` still means "someone answered". Probe before spawn: if the port already
   answers and we have no live child, fail with a plain message naming the port instead of
   silently dispatching into it.

Part 2 is what keeps this from being a symptom patch. Part 1 is what makes it never fire.

## Blast radius — swept, and it splits by machine

**LOCAL — must move (all four, or ComfyUI 403s every call):**

- `routes/shared.js:134` — `COMFYUI_PORT`, the source of truth.
- `js/services/comfyController.js:164` — `serverAddress: "127.0.0.1:8188"`. The RENDERER
  talks to ComfyUI directly; this feeds `httpBase()` and the `ws://` URL at line 818.
- `js/shell/memoryOps.js:27` — direct `/extra/unload_models` fallback.
- `main.js:324/326/335` — the Electron Origin spoof + CORS injection, matched on the
  literal `:8188`. Miss this one and ComfyUI's CSRF check rejects everything with
  "request with non matching host and origin".

**REMOTE — must NOT move.** The Pod runs its own ComfyUI on 8188 *inside the container*,
on a different machine, with no possible collision:

- `routes/remotePodLifecycle.js:700` — `spec.ports.push('8188/http')`
- `js/components/Compounds/LandingPages/MpiRunpodSettings/MpiRunpodSettings.js:277` —
  `https://<podId>-8188.proxy.runpod.net`

**DEV SCRIPTS — leave.** `scripts/workflow-to-api.mjs`, `sync-raw-workflows.mjs`,
`validate-injection-rules.mjs` default to `http://127.0.0.1:8188`, which is Fabio's
hand-maintained `G:\ComfyUi` authoring bench, not the app engine. They already honour
`COMFY_URL`. After this change the two are on different ports, which is strictly better —
it ends the "am I probing the bench or the app?" ambiguity.

**Cosmetic copy** (user-visible or JSDoc, cheap to keep honest): `js/pages/components.js:938`,
`js/components/types.js:1469`, `routes/projects.js:1757`, `js/services/comfyController.js:241`.

## Guard

The four local sites are four separate literals with no shared import (CJS backend, ESM
renderer, CJS main process). That is exactly the half-wire shape this repo keeps getting
burned by, so a test reads the four REAL source files and asserts they all carry the same
port — a mirrored copy would pass while a shipped file regressed.
