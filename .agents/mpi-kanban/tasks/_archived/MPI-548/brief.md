# MPI-548 — a local-only LoRA blocks a generation while a Pod is connected

## Symptom (Fabio, 2026-08-12)

Pod connected. A Klein generation could not run. Two toasts stacked:

```
HEADS UP
"NSFW_party_time_v2.0_klein4b.safetensors" isn't installed on the remote Pod.
Install it there, or switch to the local engine to use it.

INFO
Preparing the cloud engine for a faster generation...
```

## RE-DIAGNOSED 2026-08-18 — the original root cause is DISPROVEN

The first pass on this card (2026-08-12) blamed `state.availableLoras` not being
derived per engine, and routed the failure through the pre-dispatch missing-LoRA
guard. **Three reads disprove that chain.** The asset-list gap is real (§ Defect B)
but it is a *different* defect and cannot have produced these toasts.

### 1. `lora_missing_remote` is NOT the pre-dispatch guard

It is set at [comfyController.js:1658](js/services/comfyController.js#L1658), from a
ComfyUI **`value_not_in_list` 400 returned by the Pod** — and by its twin at
[comfyController.js:164](js/services/comfyController.js#L164) for the 200-ack
`node_errors` carrier. Either way the compiled graph **reached the engine and was
rejected there**. The pre-dispatch `_findMissingModel`
([commandExecutor.js:352-393](js/services/commandExecutor.js#L352-L393)) is
mode-agnostic by design and has different copy ("was not found in your LoRA/upscale
folders"), so it never fired here.

Together with the hot-store toast — gated
`engine === 'remote' && forceLocal !== true` at
[commandExecutor.js:1518](js/services/commandExecutor.js#L1518) — the pair proves the
frozen engine ([commandExecutor.js:1267](js/services/commandExecutor.js#L1267)) was
`'remote'`, i.e. `payload.forceLocal` was false for this dispatch.

### 2. The named LoRA never passes through `state.availableLoras`

`NSFW_party_time_v2.0_klein4b.safetensors` is not a user LoRA. It is a **shipped
dep**, `klein-lora-nsfw` ([loraDeps.js:502](js/data/modelConstants/loraDeps.js#L502),
`loras/flux2-klein/`), **baked** into `comfy_workflows/klein_t2i.json` node **38**
(`LoraLoaderModelOnly`, `lora_name: "flux2-klein\\NSFW_party_time_v2.0_klein4b.safetensors"`,
strength from the MpiMath keyword gate on node 44).

Baked loader values go straight to `/prompt` through the separator heal at
[comfyController.js:1444-1486](js/services/comfyController.js#L1444-L1486) — they never
touch `/comfy/list-files`, `state.availableLoras`, or any dropdown. So no change to the
asset list can affect this toast.

Note also: node 38 is **core `LoraLoaderModelOnly`**, which validates its `lora_name`
enum at `/prompt` time regardless of strength. The dep's own comment ("never loads on a
clean prompt") is true about *loading weights* and false about *validation* — the file
must exist on whichever engine runs Klein, always.

### 3. The pre-dispatch op gate had it in scope and passed anyway

Verified offline 2026-08-18 (bare-Node registry import, `docs/testing-harnesses.md` § 1):

```
resolveDeps(klein-4b, ['t2i'], null, 'remote', { arch: 'modern' })
  → 21 deps, includes 'klein-lora-nsfw'   (same for 'local')
```

So `isOperationInstalled(klein-4b, 't2i')` — the gate at
[commandExecutor.js:1375](js/services/commandExecutor.js#L1375), fed by
`syncModelInstalled()`'s per-dep cache which routes to `/comfy/models/check` vs
`/check-local` off `effectiveEngine()`
([modelRegistry.js:163-164](js/data/modelRegistry.js#L163-L164)) — covered this dep and
still let the dispatch through. That is the hole: **the app believed the Pod had a file
its ComfyUI then refused.**

Ruled out while chasing this:

- Separator: the heal turns the baked `flux2-klein\…` into `flux2-klein/…` for a remote
  dispatch ([comfyController.js:92-95](js/services/comfyController.js#L92-L95)), and the
  wrapper mirrors the app's subfoldered layout (`_model_dest`, MPI-141), so both sides
  agree on the relative path.
- Hot-store: staged copies land in `COMFY_MODELS_DIR` which ComfyUI scans *before* the
  volume `extra_model_paths`, so the volume file is still enumerated. A 180MB LoRA is far
  under the 15GB stage floor anyway.
- `_uploadRemoteModels` ([comfyController.js:1819](js/services/comfyController.js#L1819))
  only walks `params` for `{lora_name,…}` objects — it never sees a baked node input, so
  it is not involved either way.

## The two defects, separated

### Defect A — the reported bug: `forceLocal` was threaded by hand (ROOT-CAUSED, FIXED)

**Fabio confirmed 2026-08-18: the toggle showed the LAPTOP icon — the override was ON.**
So the dispatch went to the Pod with "Run locally" active, and the question is only where
`state.engineOverride` stopped being read.

Answer: it was never *lost*. It was **never passed**. `forceLocal` is threaded as an
`opts` field from each dispatch site, so honouring the override was every call site's job
to remember — and 8 of the 10 sites do not:

| site | path | passed `forceLocal`? |
|---|---|---|
| `MpiGalleryBlock:1349` | PromptBox Cue / Q (via `getRunPayload`) | yes |
| `MpiGroupHistoryBlock:1430` | PromptBox Cue in group history | yes |
| `flowService:91` | Flow dispatch (own `state.engineOverride` read) | yes |
| `MpiGalleryBlock:618` | **Continue → stage-2 branch** | no |
| `MpiGalleryBlock:669` | Continue cold fallback → stage-1 rerun | no |
| `MpiGalleryBlock:796` | **preview:finish** | no |
| `MpiGroupHistoryBlock:1447` | `_runVideoTool` | no |
| `MpiGroupHistoryBlock:1473` | `_runImageTool` | no |
| `MpiGroupHistoryBlock:1516` | `_handleResizeApply` | no |
| `agentDispatch:151` | agent / CLI dispatch | no |
| `describeAction:55` | `imageDescribe` plugin op | no |
| `MpiToolOptionsResize` | direct `runCommand` (thumbnail preview) | no |

`opts.forceLocal` absent → `startGeneration` computed `forceLocal: opts.forceLocal === true`
= `false` → the frozen engine resolved `'remote'` → the hot-store preflight ran and the Pod
rejected the baked LoRA. Every toast Fabio saw follows from that one missing field.

Also broken by the same gap: the Cue badge's engine chip
(`_buildQueueDisplay` → `engine: opts.forceLocal ? 'local' : 'remote'`), so a queued
Continue showed REMOTE while the toggle said local.

**The structural fix (shipped):** resolve the override ONCE inside `generationService`, the
funnel every queued path goes through, instead of at each call site —
`opts.forceLocal ?? (state.engineOverride === 'local')` in `enqueueGeneration` (before
`_buildQueueDisplay`, so the badge is fixed too) and the same derivation in
`startGeneration` for a direct call. `??` keeps an EXPLICIT value authoritative, which the
loop re-fire needs: `_onLaneDrain` pins `forceLocal: lane === 'local'` so a mid-loop toggle
cannot bounce the re-fire onto the other lane (MPI-213). `MpiToolOptionsResize` is the one
site that bypasses the funnel, so it reads `state.engineOverride` itself.

**Careful with the screenshot.** The toggle is *visible* whenever the app is
remote-connected; `icon: 'cloud'` / `iconActive: 'laptop'`
([MpiPromptBox.js:2062-2069](js/components/Organisms/MpiPromptBox/MpiPromptBox.js#L2062-L2069)).
A visible button reads as "lit" without being ON — the icon is the tell.

### Defect A′ — residual, only observable with a Pod

Independent of the override: `klein-lora-nsfw` is in the dep set `isOperationInstalled`
checks for remote t2i (verified offline), so a Pod genuinely missing that file should have
been blocked BEFORE `/prompt` by the op gate at
[commandExecutor.js:1375](js/services/commandExecutor.js#L1375) rather than rejected by
ComfyUI. Either the Pod had the file (and only the override was wrong — most likely, since
the volume install is dep-complete) or the remote install-state was stale:
`syncModelInstalled()` runs on the connect edge, on disconnect, at boot, and on
`engineOverride` change ([shell.js:1598](js/shell.js#L1598)) — never *while* connected.
The uncarded MPI-208 follow-up ("periodic `syncModelInstalled` poll while
remote-connected") is that gap. **Do not chase this without evidence:** it needs one Pod
session where a cloud Klein t2i is deliberately run.

### Defect B — the asset list is not engine-aware (real, but not this toast)

Still true, still worth fixing, and it hits USER LoRAs and upscalers on a Pod:

- [assetService.js:10-11](js/services/assetService.js#L10-L11) — `_listFiles()` takes no
  engine and `GET /comfy/list-files?subDir=…` has no engine param.
- [routes/comfy.js:961](routes/comfy.js#L961) — the handler enumerates
  `getCustomRoot() || getDefaultModelsRoot()` plus `getExtraModelFolders()`. All **local**
  filesystem. **No remote branch** — it never asks the Pod what it has.
- [routes/comfy.js:999-1001](routes/comfy.js#L999-L1001) — when
  `remoteModels.isRemoteActive()` it re-labels those *local* filenames with the **remote**
  separator. While a Pod is connected the list is local content wearing a remote costume.
- `loadAll()` *is* re-run per engine on `comfy:ready`
  ([shell.js:414](js/shell.js#L414)) — but a remote reload still enumerates local disk, so
  the engine dimension exists in the caller and dies at the route. Nothing re-runs it on
  `state.engineOverride` change at all (unlike `syncModelInstalled`).

**Blast radius — shared primitive.** `state.availableLoras` / `state.upscaleModels` are
read by `MpiModelSettings` (dropdown options + "missing" styling, lines 415, 446-447, 499,
536-537), `MpiToolOptionsUpscale` (line 96), and the two dispatch resolvers
(`_resolveModelName`, `_resolveUpscaleParam`, `_findMissingModel`). Any fix sweeps all of
them in one pass.

Two behaviours a fix must preserve:

- `_findMissingModel` fails **OPEN** on an empty list (engine not ready) — see
  [comfyController.js:428](js/services/comfyController.js#L428) for why that matters — and
  `lora_missing_local` at
  [commandExecutor.js:2184](js/services/commandExecutor.js#L2184) is the backstop for it.
- `_findMissingModel`'s remote comment (MPI-82) is deliberate: for a remote gen a user LoRA
  is uploaded FROM local disk, so "present locally" is the requirement in both modes. An
  engine-aware list must not turn that guard into a Pod-only check.

## Root-cause rule

The forbidden patches here: suppressing the toast, failing the guard open while a Pod is
connected, or making the pre-dispatch check permissive. Defect A is a **disagreement
between two sources of truth about the same file** — fix the disagreement, not the message.

## Dual-engine reminder

`.claude/rules/comfy_engine.md` § Engine Split — fix BOTH twins. A remote-only or
local-only fix is a half-wire, which is the family of bug this card is.
