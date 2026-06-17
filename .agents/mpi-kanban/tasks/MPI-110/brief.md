# MPI-110 Brief — Auto-retry GPU connect

## Goal
User wants a SPECIFIC GPU that may be low/no stock now. Instead of "couldn't connect, pick another", keep trying in the background until that GPU frees, then connect. User does other work meanwhile. Beat the apps that snipe Pods in the reconnect window by retrying just as fast — but only commit (create a billed Pod) the instant stock appears.

## The control
New checkbox in Settings → RunPod: **"Auto-retry connection"**, persisted in `runpodConfig` (alongside `autoConnectOnStart` / `deleteOnQuit`).

- **Off (default):** zero behavior change. Picker shows available GPUs only; Connect is one-shot (today's flow).
- **On (two effects):**
  1. GPU dropdown ALSO lists 0-stock GPUs, tagged `Unavailable — will wait` (today they're filtered out at MpiSettings.js:1191, `availMap.has(g.id)` where availMap only holds `g.available`).
  2. Connect becomes a background retry loop instead of one-shot.

## The wait loop (heart of it)
On Connect with auto-retry on:
1. **Availability poll, NOT a create.** Loop calls `/runpod/gpu-availability` (scoped to picked GPU+DC) every 15s. NO Pod created, NO remote-mode flags set, **`phase` stays `null`**.
2. Button flips to **Cancel** (reuse existing `_cancelConnect` wiring); hint shows `Waiting for <GPU> — checking every 15s…`. Settings-only UI.
3. Stock appears (stock>0) → **hand off to the existing `_connectEngine` create path verbatim.** From here: normal `phase: 'connecting'`, "Creating a Pod…" toast, blocking begins, poll-to-ready, "Remote engine ready."
4. Create 400s on the race (sniped between poll and create) → swallow silently, drop back to step 1, keep waiting. No toast.
5. Cancel → break loop, back to local · offline. No Pod was created, so nothing to tear down (cheaper than today's cancel).

## CRITICAL constraint (user, verbatim)
**While retrying, do NOT enter the blocking "connecting" state.** Local generation must stay unblocked. Only flip to "connecting" once a slot is won and the real create kicks off.

Blocking mechanism = `Events.emit('remote:connection', { phase: 'connecting' })`. Gated on in:
- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js:1070` (`_remoteTransitioning`)
- `js/services/comfyController.js:37-39` (`_remoteTransition`)

So the wait loop MUST keep `phase: null` the whole time it polls. Win path uses existing `_connectEngine` which already emits `connecting` correctly.

## Restart behavior
Wait loop resumes on boot **only if BOTH** `autoConnectOnStart` AND `autoRetry` are on. Auto-retry alone = session-only (re-press Connect). Compose with existing boot path `_initRemoteBoot` in `js/shell.js`.

## Scope
Covers failure A (out-of-stock / low-stock / sniped) ONLY. Failure B (bad-host EXITED, boot-timeout) keeps today's one-shot handling — those don't self-heal by waiting.

## Interval
15s fixed (hardcoded). Not configurable (YAGNI).

## Key files
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — checkbox, picker filter (~L1191), `_connectEngine` (~L632), `_cancelConnect` (~L850), wait-loop wrapper in front of `_connectEngine`.
- `js/shell.js` — `_initRemoteBoot` (~L394) boot resume gating.
- `routes/runpodRemote.js` / `routes/remoteProxy.js` — availability endpoint already exists (`/runpod/gpu-availability`); create 400 race already returns refusable. No new backend route likely needed.

## Open / decided
- Interval 15s — DECIDED.
- Restart resume gated on both checkboxes — DECIDED.
- Race 400 swallowed silently — DECIDED.
