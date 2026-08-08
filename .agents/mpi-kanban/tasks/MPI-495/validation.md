# MPI-495 — validation

**No Pod, no app restart, no remote connect.** The GPU smoke matrix owns the app and the only
remote engine for the whole of this work. Everything below is source-read or a synthetic run
in bare Node.

## Root cause (read, not guessed)

ComfyUI validates a prompt **per output node** and fails the *request* only when **every**
output is invalid:

- `G:\ComfyUi\ComfyUI\execution.py:1247` — `validate_prompt` returns `(True, None, good_outputs,
  node_errors)` as soon as one output survives. The refused nodes are still collected into
  `node_errors`, and `:1229` logs `Output will be ignored`.
- `G:\ComfyUi\ComfyUI\server.py:1132` — that success path answers **HTTP 200** with
  `{prompt_id, number, node_errors}`, having already queued the prompt.

`node_errors` is therefore present on **every** 200 — `{}` when the graph is fully valid.
`runWorkflow` destructured `ack.prompt_id` and dropped the rest, so a graph whose style-LoRA
branch failed `value_not_in_list` was queued, rendered from a sibling output, and resolved
`{success: true}` — an unstyled image, no toast, nothing in `app.log`.

**The separator bug (MPI-467) was one trigger, not the defect.** Any reason a value misses the
enum reproduces it.

## Both engines carry it — all four hops read

| hop | behaviour |
|---|---|
| ComfyUI | `200 {prompt_id, number, node_errors}` (`server.py:1132`) |
| wrapper `/wrapper/prompt` | `return JSONResponse(r.json())` — verbatim (`cubric-vision-pod/wrapper/wrapper.py:960`) |
| Express `/proxy/prompt` | `_passthrough` — status + content-type + body verbatim (`routes/remotePodState.js:170`) |
| renderer | `comfyController.runWorkflow` |

Consequence: unlike the 400 path, a 200 carries **structured `node_errors` on remote too**, so
the existing carrier→engine mapping (`node_errors` = local, text = remote) is invalid here. The
fix tags by the engine instead — otherwise a remote drop would show the local toast's
"add it in Settings" advice, which is wrong for a Pod.

## The fix

`js/services/comfyController.js`

- `partialValidationError(nodeErrors, isRemote)` (module scope, exported for the test) — turns
  the `node_errors` of an accepted prompt into an error tagged with the **existing** codes
  (`lora_missing_local|remote`, `weights_missing_local|remote`), so `commandExecutor`'s warning
  toasts fire with **no new UI wiring**. Anything else stays untagged and reaches the bug
  reporter naming the node, which is correct — the app compiled a graph the engine refused.
- Dispatch guard right after the ack: non-empty `node_errors` → `clientLogger.error` with the
  full payload, best-effort `deleteQueueItem(promptId)` so the doomed run does not burn the GPU,
  then throw. No listener is registered, so nothing is left claiming a live generation.

**Style-rack detail that a naive fix misses:** an `MpiStyleLoras` bank names its inputs
`lora_1..lora_5` (MPI-359), not `lora_name` — confirmed at
`c:\AI\Mpi\ComfyUi-MpiNodes\loras.py:215`. The shared `findRejectedFile(nodeErrors,
['lora_name'])` matches **none** of the ten dropped krea2 styles. The offending input names are
collected by shape (`/^(lora_name|lora_\d+)$/`) and fed to the shared reader.

## Evidence

`tests/prompt-partial-validation.test.cjs` — drives the **real** `runWorkflow` (the controller
imports in bare Node); `fetch`, `connect`, `ensureServerRunning`, `deleteQueueItem` stubbed.

- 7/7 pass.
- **Mutation check** (guard replaced with `const partial = null`, backup by file copy — never
  `git restore` on this tree): the acceptance test fails in 3.8ms with
  `AssertionError: Missing expected rejection` — i.e. the run reported success, which is
  precisely the defect. Restored from the copy and re-verified.
- The healthy `node_errors: {}` ack is pinned as its own test: a truthiness-only check there
  would fail **every** generation in the app.
- Full suite: **519 pass, 0 fail** (`npm test`).

## Not proven / residual risk

- **No real-engine run.** Reproducing on the Pod was ruled out by instruction (the matrix owns
  it) and would prove nothing anyway — the trigger is fixed, so the matrix now shows zero
  `value_not_in_list`.
- **A graph that legitimately ships an output the engine refuses would now fail instead of
  degrading silently.** That is the intended trade, but it is the one way this could bite: no
  such graph is known, and the 2026-08-08 matrix showing zero `value_not_in_list` fleet-wide is
  the evidence that healthy ops send empty `node_errors`. If an op starts failing with
  "ComfyUI ignored part of this graph", that is this change telling the truth about a graph
  that was already broken.

## Handed off, not fixed here

`scripts/smoke-workflows.mjs:552` has the **identical** blind spot — `const { prompt_id } = await
app('/proxy/prompt', ...)`, then PASS at `:569` on media count alone. That is why the matrix
scored krea2-nsfw PASS while ten style LoRAs were dropped. The file is MPI-467's and sits in
`pending_file_states`, so it was left untouched and filed as an `mpi-message` to MPI-467
(`state/messages/33bb2dbb-8518-4609-866d-bc678c66495d.json`).
