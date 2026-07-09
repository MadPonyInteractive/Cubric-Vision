# MPI-88 — Plan: No-GPU "download mode" Pod

Investigation done 2026-06-15. All four brief open-questions resolved. App-only — no `mpi-ci` / wrapper change.

## Open-question resolutions

**(a) CPU-only Pod supported?** YES. Same `POST https://rest.runpod.io/v1/pods` endpoint our `client.createPod`
already uses (`runpodRemote.js:32,147`). Set `computeType:"CPU"` + `cpuFlavorIds:["cpu3c"]`; GPU fields
(`gpuTypeIds`/`gpuCount`) are ignored per the RunPod schema. NO new API path.
Source: https://docs.runpod.io/api-reference/pods/POST/pods

**(b) UI affordance:** No new button. Prepend a sentinel option **"No GPU — download only"**
(`value:"__cpu__"`) to the existing GPU dropdown (`MpiSettings.js:_buildGpuOptions`). Selecting it sets
`runpodConfig.gpuType="__cpu__"`, which satisfies the existing Connect guard
(`MpiSettings.js:488` needs `gpuType` + `volumeId`) and reuses the whole Connect flow unchanged.
(User decision 2026-06-15: "first option of the existing dropdown should be a non-GPU pod.")

**(c) Gate generation OFF:** Mirror the existing Pattern B in `comfyController.js:_ensureRemoteReady` (~L267):
emit `ui:info` toast + throw `err.code='pod_no_gpu'` when the connected Pod has no GPU. Needs a `noGpu`
flag plumbed `_mode → /remote/comfy/status → renderer`.

**(d) Idle-watchdog:** Already works unchanged. CPU spec keeps the `RUNPOD_API_KEY` env backstop that
drives the wrapper self-stop. No work.

**Wrapper (mpi-ci) — VERIFIED no change needed.** `start.sh:71-78` already detects `nogpu` via
`torch.cuda.is_available()`, skips sageattention, keeps SDPA fallback, and boots ComfyUI + wrapper anyway.
`wrapper.py:29` documents no-GPU local dev. `/health.comfy_ready` goes true on CPU (ComfyUI auto-CPU
fallback); `/wrapper/models/install` is pure HTTP+disk → works with no GPU. Card stays app-only.

**Teardown (user decision):** CPU→GPU switch DELETES the CPU Pod and creates a fresh GPU Pod on the same
volume. Already implemented by the GPU-switch path at `MpiSettings.js:903` (selecting a new value while a
podId exists → `/remote/pod/delete-active` + clear podId). The sentinel rides this path for free.

## Sentinel: `'__cpu__'`

Sticks in `runpodConfig.gpuType` like any RunPod card id. No localStorage schema change. All existing
guards/persistence/switch logic treat it as "a picked GPU".

## Steps

1. **Backend CPU spec branch** — `routes/remoteProxy.js`
   - `_createPodInternal` (~L278): `const noGpu = gpuTypeId === '__cpu__'`. If `noGpu`, build CPU spec
     (`computeType:'CPU'`, `cpuFlavorIds:['cpu3c']`, no `gpuTypeIds`/`gpuCount`); keep volume mount, ports, env.
     Image: reuse cu124 (broad-compat; wrapper boots GPU-less). Pass `noGpu` into `setRemoteMode`.
   - `_mode` (L81) gains `noGpu`; `setRemoteMode`/`getRemoteMode` carry it.
   - `/remote/comfy/status` (~L208) payload gains `noGpu` from `_mode`.
   - `podImageForCard('__cpu__')` → return the cu124 image (already the unknown-card default; confirm).
   - verify: CPU Pod creates; `/remote/mode` + `/remote/comfy/status` report `noGpu:true`; wrapper `/health` ready.

2. **Gen gate** — `js/services/comfyController.js` `_ensureRemoteReady` (~L267)
   - After the status fetch, if `check.noGpu`: `Events.emit('ui:info',{message:'This Pod has no GPU — connect a GPU to generate.'})`,
     then `throw Object.assign(new Error(msg), {code:'pod_no_gpu'})`. (Pattern B — no bug-reporter.)
   - verify: in download-mode, Cue → toast, no dispatch, no `ui:error` modal.

3. **Dropdown sentinel** — `MpiSettings.js` `_buildGpuOptions` (~L929)
   - Prepend `{ value:'__cpu__', label:'No GPU — download only', meta:'CPU instance · model downloads, no GPU billing' }`.
   - verify: option appears first; Connect enables with sentinel + a volume; switching to a real GPU later
     deletes the CPU Pod (existing L903 path).

4. **Download-mode hint** — `MpiSettings.js`
   - When `gpuType==='__cpu__'` and connected: `_setEngineHint(root, 'Download mode — install models, then pick a GPU to generate.')`.
   - verify: hint visible while CPU Pod active.

## End-to-end verify (brief "Verify")
User picks "No GPU — download only" → Connect → CPU Pod (volume cost only) → install a large model to the
volume → switch dropdown to a GPU → Connect → fresh GPU Pod, model present (no re-download), generation works.
Generation blocked with the toast while the CPU Pod is active.
