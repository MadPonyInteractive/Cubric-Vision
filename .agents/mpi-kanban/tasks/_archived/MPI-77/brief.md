# MPI-77 Brief — RunPod card-dropdown RAM accuracy (per-DC lowestPrice)

Found live 2026-06-14 during MPI-64/remote testing (branch RunPod). The Settings → RunPod GPU
picker dropdown shows system RAM that is far below reality. User's live A4500 Pod has ~57GB RAM;
the dropdown advertised only **29GB**.

## ROOT CAUSE (confirmed)

`routes/runpodRemote.js:112` (`gpuTypes()`) queries:

```graphql
lowestPrice(input:{gpuCount:1}) { minMemory minVcpu }
```

`minMemory` is the **global RAM floor** of the cheapest single-GPU offering across ALL clouds and
ALL datacenters — not the RAM of the DC the user picked, and not the Secure-Cloud-only floor. It is
flattened to top-level `g.minMemory` and rendered by the picker at
`js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js:938`:

```js
const ram = (typeof g.minMemory === 'number' && g.minMemory > 0)
  ? ` · ${g.minMemory}GB RAM${g.minMemory < 64 ? ' ⚠ video' : ''}` : '';
```

So the picker shows a global floor while the UI has a per-DC dropdown — the number doesn't even
track the selected DC.

## LIVE PROOF (probe run by user against RunPod GraphQL, key never exposed)

| Query | Input | minMemory |
|---|---|---|
| Q1 (current behavior) | `lowestPrice(input:{gpuCount:1})` | **29** ← wrong |
| Q2 (the fix)          | `lowestPrice(input:{gpuCount:1, dataCenterId:"EU-RO-1", secureCloud:true})` | **62** ← matches the ~57GB Pod |

`dataCenterId` + `secureCloud` are accepted args on the `lowestPrice` input (proven by Q2 returning
a value, not an error). GraphQL introspection is disabled on RunPod's Apollo server, so we could not
dump the full input/output schema — but the fix args are confirmed working.

Note: the floor still rounds up (62 vs the Pod's 57). Close enough; it is honest and per-DC.

## FIX — Approach A (chosen)

Re-query GPU RAM per selected datacenter:

1. `routes/runpodRemote.js` — `gpuTypes(apiKey, dataCenterId)` takes the selected DC and injects
   `dataCenterId` + `secureCloud:true` into the `lowestPrice` input. `availability()` /
   `/runpod/gpu-availability` thread the DC through (query param). Keep the global call as a fallback
   when no DC is selected yet.
2. `MpiSettings.js` — when the Data Center dropdown changes, re-fetch availability for that DC and
   re-render the GPU picker so RAM reflects the chosen DC. Scope the edit strictly to the GPU-picker
   RAM/data-center lines.

Approach B (fetch-all-DCs-upfront + cache) was considered and rejected for v1: more calls at open,
heavier, not needed.

Keep the `< 64` video warning logic — 62GB still (correctly) warns for EU-RO-1 A4500.

## COORDINATION / FILE OWNERSHIP

- Coordination task: `state/tasks/7c05a0ac-...json`; session `state/sessions/f7a4b6c5-...json`.
- Claimed files: `routes/runpodRemote.js` (clean) + `MpiSettings.js` (**SHARED** — MPI-73 agent has
  uncommitted edits to status bar / hero card / connect gate on the same file).
- **Do NOT edit MpiSettings.js until** MPI-73 commits its work AND the next session coordinates
  scope with this agent via an MPI message. runpodRemote.js is independent and safe to start.

## STATUS

Investigation complete. Fix proven viable live. **No code written yet** — gated on MPI-73 commit +
cross-agent scope agreement on the shared file.
