# MPI-668 - checklist

Connect-time assert: compare the Pod's ComfyUI core against `node_lock.json`.

## The mechanism already exists - do not go looking for one

MPI-669 proved the read on a live Pod (2026-08-31), so this card is wiring, not research:

    GET https://<podId>-8188.proxy.runpod.net/system_stats  ->  .system.comfyui_version

Compare that to `dev_configs/node_lock.json` `comfyui.core.tag` (strip the leading `v`).
On the Pod that unblocked MPI-669 it read `0.34.0` against a pin of `v0.34.0`.

Caveats found while proving it:

- Raw ComfyUI on 8188 is exposed by **`dev_mode` only** (`remotePodLifecycle` logs
  `dev_mode: exposing raw ComfyUI on 8188 (no auth)` at create). A released user's Pod does
  NOT expose it, so the assert has to run through the wrapper or an app route, not this URL.
  That is the one real design question on this card.
- `/system_stats` returned 000 on an older image and works on v0.22.0-dev - treat a single
  failure as inconclusive, not as a version mismatch. Failing the assert OPEN is mandatory:
  a false "your Pod is stale" is worse than the silence this card is fixing.
- `/object_info/<NodeName>` (single class, `{}` when absent) is the second-line check if a
  version string ever proves unreliable. `python_module: comfy_extras.*` in the response
  means CORE - no custom-node install can supply it.

## Why the card exists

The DEV Pod image sat on ComfyUI 0.31.0 for three weeks while `node_lock` said v0.34.0.
Nothing anywhere compared them, so the drift surfaced as four workflows rejecting mid-job on
a rented GPU with an error blaming a custom node. The whole gap is one string comparison at
connect time.

- [ ] Decide the transport (wrapper endpoint vs app route) - `dev_mode` URL is dev-only.
- [ ] Compare `comfyui_version` to `node_lock.json` `comfyui.core.tag` at connect.
- [ ] Fail OPEN on an unreadable version; warn, never block, on a mismatch.
- [ ] Surface it where the user already looks - the Settings remote-engine panel.
