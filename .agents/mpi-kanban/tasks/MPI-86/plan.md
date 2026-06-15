# MPI-86 Plan — Cancel during in-flight RunPod connect + boot watchdog

App-side only. No Pod image rebuild, no wrapper change.

## Approach

`/remote/pod/delete-active` already does everything Cancel needs server-side:
sets `_starting=false`, deletes the tracked (half-started) Pod (stops billing),
clears the token + ids, flips remote mode OFF. So Cancel is **frontend-driven**:
break the renderer's `_pollEngineReady` loop and call `delete-active`. No new
backend route.

Cancel UI (chosen): **relabel the single Connect button to "Cancel"** while
connecting (enabled), instead of leaving it disabled. Reverts to Connect/
Disconnect when the attempt resolves.

## Parts

1. **Abortable poll** — add a `_connectAbort` flag in setup scope; `_pollEngineReady`
   checks it each tick and returns `false` early. `_connectEngine` checks it after
   the loop to skip the "taking too long" fallback when the user cancelled.

2. **Cancel button** — new `_cancelConnect(root)`: set `_connectAbort=true`,
   POST `/remote/pod/delete-active`, reset status→stopped, re-enable Connect,
   emit `remote:connection {connected:false, phase:null}`. While `_engineBusy`,
   relabel the button to "Cancel" + keep it ENABLED (today it's disabled). The
   click handler routes by label: Cancel→`_cancelConnect`, Disconnect→choice,
   else→`_connectEngine`.

3. **GPU-switch auto-cancel** — in `gpuInst.on('change')`, if `_engineBusy`
   (connect in flight), call `_cancelConnect` first so the in-flight Pod dies,
   then apply the new GPU selection. Existing saved-Pod delete branch stays.

4. **Boot watchdog** — `_pollEngineReady` gains a second threshold
   (`watchdogAfterMs` ~5 min, generous — clears the normal first-boot
   sageattention compile, MPI-64 L3) that fires `onWatchdog` once → hint
   "Taking longer than usual — press Cancel to stop and try another GPU." It
   only PROMPTS; never auto-cancels (healthy slow boots must complete).

## Verify (from brief)

- Pod stuck past threshold → Cancel → Pod deleted, no orphan billing, Connect
  re-enabled.
- Pick a different GPU mid-connect → in-flight Pod auto-cancelled, can Connect
  to the new card.
- Healthy fast boot completes normally — no premature cancel, no spurious prompt.

## Files

- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` (all UI + poll)
- No backend change (delete-active already the cancel path).
