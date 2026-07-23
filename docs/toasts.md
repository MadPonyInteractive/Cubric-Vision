# Toasts & notifications — the full map

Every user-facing toast/notification in the app, where it fires, and whether it rings the chime.
Source of truth for the toast system; read before touching `MpiToast`, `StatusBar.notify`, the
`ui:*` events, or `notificationService`. Component-internal fine print (DOM-as-truth, overlay-stash
exemption) lives in [component-contracts.md](component-contracts.md) § MpiToast; status-bar
progress lives in [shell.md](shell.md).

## How a toast reaches the screen

Three entry paths, one renderer (`MpiToast` in a shared `.mpi-toast-stack`, cap 2 visible):

1. **`StatusBar.notify(message, variant, duration=6000, opts)`** — direct in-app toast. Callers
   in components/services use this or the `ui:*` events below.
2. **`Events.emit('ui:success'|'ui:warning'|'ui:info', { message, sound })`** — bus events;
   `statusBar.js listen()` relays each to `StatusBar.notify(message, variant, 6000, { sound })`.
   There is also a **`ui:error`** channel — it has NO handler in `statusBar.js`, so it renders a
   **dialog, not a toast** (routed elsewhere). Not counted below.
3. **`notificationService`** — the lifecycle bridge. Listens for `generation:complete` (coalesced),
   `download:complete`, `remote:connection`. Each either fires an **OS notification** (window
   unfocused + pref on) OR an in-app `StatusBar.notify` — never both (split on `document.hasFocus()`).

Backend routes never toast directly — they push SSE events (`/comfy/downloads/stream`,
`/concat/events/stream`) that the frontend service layer converts into `ui:*` emits.

## The sound model — READ THIS BEFORE THE TABLE

The per-call `sound` flag is **not** "does this toast play a sound". The chime
(`assets/sounds/notify.wav`) plays **once per burst** — when a toast lands in an *empty* stack —
and only if the global `Storage.getToastSound()` toggle (Settings → Toast sound) is on. Follow-up
toasts in the same burst stay silent regardless.

So a toast is **sound-eligible** unless its emitter explicitly passes `sound: false`. `sound: false`
is the convention for **immediate feedback of a user click** (Connect, Install, Cue) and for
post-action confirmations (Import, Uninstall, Add-to-project, model-switch) — these must not ring.
Sites that pass it:

| Site | Toast |
|---|---|
| `generationService.js:121` | "Add an image before generating…" (missing media slot) |
| `generationService.js:135` | "Paint a mask before generating…" (missing mask) |
| `downloadService.js:169` | "You're offline — connect to the internet…" (Install while offline) |
| `downloadService.js:178` | "Not enough disk space to install…" (Install, pre-flight) |
| `MpiRunpodSettings.js:469` / `shell.js:757` | "Connecting to your Pod…" / "Creating a Pod…" |
| `MpiModelSettings.js:312`, `MpiSettings.js:536` | "Imported ${filename}." (drop-import confirmation) |
| `MpiModelManager.js:1467-1498` (5 branches) | "${model} updated." / "files kept…" (uninstall confirmation) |
| `MpiAppLibrary.js:272` | "Open apps from the Gallery…" |
| `MpiGalleryBlock.js:356` | "${n} cards added to …" |
| `MpiGalleryBlock.js:564`, `:745` | "Switched to … — continuing/finishing preview." |

Everything else in the tables below is sound-eligible (rings if it's the burst-start and the toggle
is on). The **Sound** column therefore reads **silent** (explicit `sound:false`) or **eligible**.

---

## Lifecycle notifications (`notificationService.js`)

These are the ones that also have an OS-notification path + a preference toggle.

| Event | In-app message | Variant | Sound | OS-notif path |
|---|---|---|---|---|
| `generation:complete` (coalesced; fires when `generationQueueCount → 0`) | `Generation finished.` / `${n} generations finished.` | success | eligible (one chime per batch) | `notify-generation-complete` if unfocused + `notificationPrefs.generation !== false` |
| `remote:connection` rising edge (`connected:true`, no phase) | `${gpuName} connected.` / `Remote engine connected.` | success | eligible | `notify-connection-complete` if unfocused + `notificationPrefs.connection !== false` |
| `download:complete` (real modelId/plugin) | `${modelName} installed.` | success | eligible | `notify-download-complete` if unfocused + `notificationPrefs.downloads !== false` |

OS-notif handlers in `main.js` (`showOsNotification`) re-gate on `!mainWindow.isFocused()` — a
double focus gate (renderer + main).

---

## Generation & command toasts (`services/`)

| File:line | Trigger | Message | Variant | Sound |
|---|---|---|---|---|
| `generationService.js:121` | Cue/Run, required media slot empty | Add a/an ${noun} before generating… | warning | **silent** |
| `generationService.js:135` | Cue/Run, op needs a mask, none painted | Paint a mask before generating… | warning | **silent** |
| `generationService.js:888` | imageDescribe returned no text | No description was returned. | warning | eligible |
| `commandExecutor.js:383` | Upscale model file missing → SIAX fallback | Upscale model "…" was not found… Using the default… | warning | eligible |
| `commandExecutor.js:577` | Remote pre-flight: hot-store has pending files to stage | Preparing the cloud engine for a faster generation… | info | eligible |
| `commandExecutor.js:619` | "Stage all on connect" on + Pod connected | Warming the cloud engine — staging ${n} model(s)… | info | eligible |
| `commandExecutor.js:1100` | On-demand GPU-arch weight install failed | Could not install the ${label} weight — generation aborted. | warning | eligible |
| `commandExecutor.js:1332` | LoRA/upscale model missing in folders (pre-flight) | "…" was not found in your LoRA/upscale folders… | warning | eligible |
| `commandExecutor.js:1357` | Media slot assigned but stranded (upload/resolve) | Could not load the input ${type}… | warning | eligible |
| `commandExecutor.js:1374` | "Run locally" on, model not installed locally | "…" is not installed on your local engine… | warning | eligible |
| `commandExecutor.js:1998` | `engine_restarting` (remote OOM self-restart) | Remote engine is restarting after a memory spike… | warning | eligible |
| `commandExecutor.js:2009` | 409 `pod_incompatible` | (backend message) | warning | eligible |
| `commandExecutor.js:2019` | `lora_missing_remote` | "…" isn't installed on the remote Pod… | warning | eligible |
| `commandExecutor.js:2035` | `lora_missing_local` | "…" was not found in your LoRA/upscale folders… | warning | eligible |
| `commandExecutor.js:2048` | `input_asset_deleted` | (backend message) | warning | eligible |
| `commandExecutor.js:2061` | OOM (CUDA / MemoryError) | Ran out of memory processing this… | warning | eligible |
| `comfyController.js:300` | Cue during remote connect/disconnect transition | Disconnecting/Connecting the remote engine — wait… | info | eligible |
| `comfyController.js:327` | Local ComfyUI auto-restart (new nodes) | Restarting ComfyUI — new custom nodes were installed. | info | eligible |
| `comfyController.js:452` | Dispatch to a no-GPU (download-only) Pod | This Pod has no GPU — it is for downloading models only… | info | eligible |
| `comfyController.js:465` | Remote needs restart (new nodes) | Loading new nodes — restarting the remote engine… | info | eligible |
| `comfyController.js:501` | Remote restart didn't come ready in time | The remote engine is still loading the new nodes… | info | eligible |
| `comfyController.js:521` | Binary-preview WS not ready in 15s | Still connecting to the remote engine… | info | eligible |
| `comfyController.js:544` | Pod still booting on all status retries | Still connecting to the remote engine… | info | eligible |
| `comfyController.js:569` | No Pod connected → local fallback (once/session) | No Pod connected — running locally… | info | eligible |
| `comfyController.js:974` | Gen recovered from /history after WS blip | Generation recovered — the result was retrieved… | info | eligible |
| `comfyController.js:1654` | Uploading a LoRA/node file to the Pod (once/file) | Uploading "…" to the cloud… | info | eligible |
| `projectService.js:519` | All 4 project.json save retries failed | Could not save the project to disk… | warning | eligible |

## Download / install toasts (`services/downloadService.js`)

| File:line | Trigger | Message | Variant | Sound |
|---|---|---|---|---|
| `downloadService.js:169` | Install clicked while offline | You're offline — connect to the internet… | warning | **silent** |
| `downloadService.js:178` | Install, out-of-space pre-flight | Not enough disk space to install ${model}… | warning | **silent** |
| `downloadService.js:217` | Install POST never acked (revert timer) | Install didn't start — try again. | warning | eligible |
| `downloadService.js:291` | Remote uninstall unsupported (warming/old image) | Remote uninstall unavailable right now… | warning | eligible |
| `downloadService.js:552` | `download:failed` SSE, out-of-space, job matched | Not enough disk space to install ${model}… | warning | eligible |
| `downloadService.js:563` | `download:failed` SSE, out-of-space, no job match | Not enough disk space to install this model… | warning | eligible |

## Shell / project / describe (`shell/`, `utils/`, `data/`)

| File:line | Trigger | Message | Variant | Sound |
|---|---|---|---|---|
| `shell.js:757` | Auto-connect-on-start announce | Reconnecting to your Pod… / Creating a Pod… | info | **silent** |
| `shell/navigation.js:287` | Nav to gallery on a download-only Pod | This is a download-only Pod (no GPU)… | warning | eligible |
| `shell/projectUI.js:56` | Same download-only guard (projectUI copy) | This is a download-only Pod (no GPU)… | warning | eligible |
| `shell/projectUI.js:297` | Clean up cached assets — success | Removed ${n} cached asset(s). | success | eligible |
| `shell/projectUI.js:300` | Clean up cached assets — failed | ${err.message} | warning | eligible |
| `utils/describeAction.js:34` | Describe on item with no filePath | No source image to describe. | warning | eligible |
| `utils/describeAction.js:40` | Describe on a video | Describing video frames is not supported yet. | warning | eligible |
| `utils/describeAction.js:49` | Describe, image-describer plugin not installed | ${title} is not installed… | warning | eligible |
| `utils/describeAction.js:68` | Describe succeeded, caption injected | Description added to the prompt. | success | eligible |
| `data/modelRegistry.js:173` | Models-check reports bakedDrift (once/file/session) | Pod image is stale — rebuild needed (${key}) | warning | eligible |

## RunPod connect/disconnect (`MpiRunpodSettings.js`)

All fire from the Connect/Cancel/Disconnect flow. Row 1 is `sound:false` (click feedback); the rest
are eligible.

| Line | Trigger | Message | Variant | Sound |
|---|---|---|---|---|
| 469 | Connect clicked (feedback) | Connecting to your Pod… / Creating a Pod… | info | **silent** |
| 509 | GPU unavailable in DC | Selected GPU unavailable — pick another. | warning | eligible |
| 518 | Offline pre-flight | You're offline — check your internet connection. | warning | eligible |
| 539 | RAM floor missed, auto-retry on | Waiting for a host with ≥${n} GB RAM… | info | eligible |
| 545 | RAM floor missed, auto-retry off | No ≥${n} GB host available… | warning | eligible |
| 555 | GPU not in RunPod create enum | This GPU can't be deployed — pick another card. | warning | eligible |
| 572 | Generic connect failure | Could not connect to a Pod. | warning | eligible |
| 594 | First-time engine setup (slow-show) | Setting up the engine for your GPU (one time)… | info | eligible |
| 600 | Boot watchdog timeout | Pod taking too long — you can Cancel… | warning | eligible |
| 630 | Pod exited/terminated before ready | Pod failed to start on host… | warning | eligible |
| 644 | Host entered maintenance drain | Host under maintenance — Connect again… | warning | eligible |
| 651 | Pod ready poll timed out | Pod still preparing — try Connect again shortly. | warning | eligible |
| 683 | WS handshake incomplete | Almost ready — finishing the connection. | info | eligible |
| 712 | Fully ready | Remote engine ready | success | eligible |
| 729 | Connect endpoint threw | Could not reach the Pod connect endpoint. | warning | eligible |
| 779 | Cancel during auto-retry wait | Stopped waiting for the GPU. | info | eligible |
| 796 | Cancel mid-create (Pod deleted) | Connection cancelled. | info | eligible |
| 859 | Terminate failed | Could not terminate the Pod. | warning | eligible |
| 862 | Terminate ok (kept warm) | Pod terminated (kept warm) | success | eligible |
| 894 | Delete failed | Could not delete the Pod. | warning | eligible |
| 897 | Delete ok | Pod deleted | success | eligible |

## Apps, canvas, model settings, gallery (`components/`)

| File:line | Trigger | Message | Variant | Sound |
|---|---|---|---|---|
| `appService.js:33` | App submit, app id unresolved | That app could not be found. | warning | eligible |
| `appService.js:47` | App submit, deps not installed | ${title} needs ${what} installed first… | warning | eligible |
| `appService.js:120` | App-card Reuse, model not installed | ${title} needs its model installed… | warning | eligible |
| `MpiCanvasViewer.js:283` | Detect while Cue busy | Auto detection is unavailable while Cue has running or queued jobs | warning | eligible |
| `MpiCanvasViewer.js:368` | Auto-mask, no image selected | No image selected | warning | eligible |
| `MpiCanvasViewer.js:390` | Auto-mask detected nothing | Nothing detected | warning | eligible |
| `MpiCanvasViewer.js:581` | Auto-mask picks expired on item switch | Auto-mask picks expired — re-run detect | warning | eligible |
| `MpiBaseApp.js:471` | Drop on app slot, no project open | Open a project first. | warning | eligible |
| `MpiBaseApp.js:481` | Drop on app slot, place failed | Could not add ${type} file. | warning | eligible |
| `MpiBaseApp.js:1053` | App Run with no inputs and blank prompt | ${title} needs at least one input… | warning | eligible |
| `MpiModelSettings.js:312` | LoRA/upscale drop-import success | Imported ${filename}. | success | **silent** |
| `MpiSettings.js:536` | Settings folder drop-import success | Imported ${filename}. | success | **silent** |
| `MpiModelManager.js:1467-1498` | `download:uninstalled` (5 branches) | ${model} updated. / files kept variants | success/info | **silent** |
| `MpiAppLibrary.js:272` | Open app card off the Gallery page | Open apps from the Gallery, inside a project. | info | **silent** |
| `MpiFolderDrop.js:85` | Import POST not ok | Import failed: ${reason} | warning | eligible |
| `MpiFolderDrop.js:118` | Dropped a non-model extension | "…" is not a model file (.safetensors/.ckpt/…) | warning | eligible |
| `MpiFolderDrop.js:125` | Import threw | Import failed: ${err.message} | warning | eligible |
| `pages/components.js:530` | Dev preview: notify test, non-Electron | Desktop notifications require Electron. | warning | eligible |

### Gallery Continue/Finish/Reuse (`MpiGalleryBlock.js`) — eligible unless noted

`333` no other projects · `356` cards added **(silent)** · `508` disarm Loop before Continue ·
`513/518/526/530` Continue validation blocks · `538` Finish already in flight · `564` switched model,
continuing **(silent)** · `643` latent missing, stage-1 fallback · `667` stage-1 didn't rebuild latent ·
`694` disarm Loop before Finish · `699/704/712/716` Finish validation blocks · `722` pending stage-2
jobs · `745` switched model, finishing **(silent)** · `787` full-workflow finish fallback · `1154`
reuse: model not installed · `1208` some input media missing.

---

## Known problems (as of this audit)

- **Coalescer double-fires across non-concurrent batches.** `notificationService` counts every
  `generation:complete` in `_doneCount` and flushes on `generationQueueCount → 0`. If two gens run
  back-to-back but the count dips to 0 and back up between them, the flush timer + refill logic can
  emit "1 finished" then "1 finished" instead of one summary — the user reported two completion
  toasts for gens that were never queued together.
- **"Creating a Pod…" appears from two sites** (`shell.js:757` auto-connect, `MpiRunpodSettings.js:469`
  manual Connect) — different flows, not a true double, but worth knowing when debugging duplicates.
