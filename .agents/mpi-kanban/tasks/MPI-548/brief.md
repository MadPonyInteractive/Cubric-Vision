# MPI-548 — "Run locally" is ignored by the asset list

## Symptom (Fabio, 2026-08-12)

Pod connected. A generation that uses a local-only LoRA cannot run, even though
the app has a per-generation local escape hatch. Two toasts stacked:

```
HEADS UP
"NSFW_party_time_v2.0_klein4b.safetensors" isn't installed on the remote Pod.
Install it there, or switch to the local engine to use it.

INFO
Preparing the cloud engine for a faster generation...
```

The second toast is the tell: the **remote hot-store preflight ran**, so this
dispatch resolved `engine = 'remote'`, not local.

## What already exists (do NOT rebuild it)

The per-generation local override is fully wired end to end — this is not a
missing feature:

- `state.engineOverride === 'local'` — single source of truth (R31, MPI-208).
- The "Run locally" toggle writes it: [MpiPromptBox.js:2032-2047](js/components/Organisms/MpiPromptBox/MpiPromptBox.js#L2032-L2047).
  Shown only while remote-connected, cleared on disconnect.
- It rides into the payload as `forceLocal`: [MpiPromptBox.js:1818](js/components/Organisms/MpiPromptBox/MpiPromptBox.js#L1818).
- The executor freezes the engine once per gen from it: [commandExecutor.js:1267-1269](js/services/commandExecutor.js#L1267-L1269).
- `getEngine(forceLocal)` returns the local-pinned instance: [comfyController.js:1913-1925](js/services/comfyController.js#L1913-L1925).
- `remoteEngineClient.effectiveEngine()` is the read that already follows the
  override, and `js/data/modelRegistry.js` (3 call sites) uses it.

## Root cause

`state.availableLoras` is **never derived per engine**. It is filled once from a
route that only ever reads the local disk:

- [assetService.js:27-38](js/services/assetService.js#L27-L38) — `loadAll()` fetches
  `GET /comfy/list-files?subDir=loras` and `upscale_models`, writes both state keys.
  No engine argument, no re-fetch on an engine change.
- [routes/comfy.js:948-999](routes/comfy.js#L948-L999) — the handler enumerates
  `getCustomRoot() || getDefaultModelsRoot()` plus `getExtraModelFolders()`. All
  **local** filesystem. There is **no remote branch** — it never asks the Pod what
  it has.
- Same handler, [routes/comfy.js:985-990](routes/comfy.js#L985-L990) — when
  `remoteModels.isRemoteActive()` it re-formats those *local* filenames with the
  **remote** separator (`/`). So while a Pod is connected the list is local content
  wearing a remote costume: wrong on both axes.

The dispatch-time guard then compares the selected LoRA against that list —
[commandExecutor.js:305-307](js/services/commandExecutor.js#L305-L307) and
[:371](js/services/commandExecutor.js#L371) — and the mismatch surfaces as
`lora_missing_remote` at [commandExecutor.js:2168-2177](js/services/commandExecutor.js#L2168-L2177).

**Blast radius — this is a shared primitive.** `state.availableLoras` and
`state.upscaleModels` are read by `MpiModelSettings` (dropdown options + the
"missing" styling at [MpiModelSettings.js:415,446-447,499,536-537](js/components/Compounds/MpiModelSettings/MpiModelSettings.js#L415))
as well as by the two dispatch guards. A fix must sweep every consumer, not just
the toast.

Note also `comfyController.js:428` — the missing-LoRA guard **fails OPEN** when
`state.availableLoras` is empty, and `commandExecutor.js:2178-2193` is the local
backstop for that. Any change here must preserve both behaviours.

## Open question for Fabio (do not guess)

Which is the intended semantic?

- **A — the override is the bug.** "Run locally" was ON and the dispatch still
  went remote. Then the defect is narrower: find why `forceLocal` did not survive,
  and the asset list is a second, separate bug.
- **B — the asset list is the bug.** The toggle was OFF, the user expects the app
  to notice the LoRA is local-only and either route locally or offer to. Then the
  asset list must become engine-aware.

The screenshot shows the toggle slot lit next to Cue, which points at **A**, but
"Preparing the cloud engine..." proves the dispatch resolved remote — so both may
be live. Reproduce with the toggle explicitly ON and explicitly OFF before
choosing a fix; do not patch the toast.

## Root-cause rule applies

The tempting patch — suppress the toast, or fail the guard open when a Pod is
connected — is forbidden. The engine that a dispatch targets and the asset list it
is validated against must come from **one** resolved engine value per generation.
The executor already resolves exactly that (`engine`, frozen once at
[commandExecutor.js:1267](js/services/commandExecutor.js#L1267)); the asset list is
the half that never got wired to it. That is the structural fix.

If it means reshaping `assetService` + the `/comfy/list-files` route (likely: an
`engine` query param, remote branch via `remoteModels`, and a re-fetch on the
`remote:connection` edge **and** on `state.engineOverride` change), brief Fabio
first per the Root-Cause Rule step 4 — it touches a shared primitive with four
consumer sites.

## Dual-engine reminder

`.claude/rules/comfy_engine.md` § Engine Split — fix BOTH twins. A remote-only or
local-only fix here is a half-wire, which is exactly the family of bug this card is.
