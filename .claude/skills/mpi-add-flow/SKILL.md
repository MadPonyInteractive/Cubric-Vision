---
name: mpi-add-flow
description: Wire a NEW Flow (dev-gated Flow-Library outcome flow) into Cubric Vision end-to-end — descriptor + universal op in 4 files + workflow + optional uiComponent + media I/O + reuse. Use when the user says "add a new flow", "let's add a flow", "wire up the <name> flow", "/mpi-add-flow", or when onboarding any new Flow into the Flow Library. NOT for adding a model (that is /mpi-add-model). This skill ENFORCES the docs/playbooks/add-flow/ playbook — it does not replace it.
user-invocable: true
---
# /mpi-add-flow — add a new Flow, end-to-end

> An **Flow** is a dev-gated Flow-Library outcome flow: a descriptor + a universal op +
> a workflow (+ an optional controls component) that runs through the EXISTING generation
> queue and lands gallery card(s). It is NOT a model — for a model use `/mpi-add-model`.
>
> **This skill exists because agents skip the playbook.** The `docs/playbooks/add-flow/`
> playbook is the *how* for every flow, and it carries traps that cost real debugging
> (the audio-slot mediaType trap, the no-model filter trap, path-reading input nodes,
> overlay z-order). Reading a handoff is not reading the playbook.

## STEP 0 — MANDATORY, BEFORE ANY OTHER TOOL CALL

Read the **`docs/playbooks/add-flow/README.md`** hub in full — ONLY the hub, not the section
files yet. The hub carries the shape decision, the trap table, the hard rules, the master
checklist, and a routing table. Then state, in one line each:

1. The flow's **shape** (README § 0): model or no-model (`requiredModels`); inputs
   (media / prompt / gizmo / none); output `mediaType` (`image` | `video`).
2. Whether it declares **media slots** (⇒ `02-media-io.md` — path-reading nodes, injection
   routing, the audio-slot traps) or is media-free.
3. Whether it needs a **uiComponent** (custom controls) or is media-only (omit uiComponent).

If you cannot answer all three from the hub + the workflow JSON, stop and ask.

**Then read section files ON DEMAND — do NOT slurp all five up front.** Open a section when
you reach its step (descriptor/ops → `01`; media slots/injection → `02`; storage/reuse →
`03`; overlay/shell → `04`; verify → `05`). A media-free flow never needs `02`'s slot
machinery.

**Do not skip Step 0 because the user pasted a handoff.** The handoff assumes the playbook.

## STEP 1 — Read the workflow, do not trust prior notes

The JSON is the truth; re-authored graphs make notes stale.

- Parse `comfy_workflows/<Flow>*.json` (API format, id-keyed).
- Enumerate the injection surface: every node whose `_meta.title` starts with `Input_` /
  `Output_`. **All flow input nodes are path-reading** (`MpiLoadImageFromPath`, `MpiString`
  → VHS video, `MpiLoadAudioFromPath`) — they read a filesystem PATH from `.string`, NOT a
  ComfyUI input-dir upload name. Confirm every input node is one of these, not stock
  `LoadImage`/`LoadAudio` (those can't self-gate and need upload-name injection).
- Confirm outputs are `Output_<Type>*` and self-gate (empty input → ExecutionBlocker).
- **The saved `.json` lags the ComfyUI canvas.** Ask the user to save first.

Reconcile with the user's own count. Disagree → say so and re-check.

## STEP 2 — Work the playbook checklist

Follow the playbook README § "Checklist (copy per flow)" verbatim, in order. Open a section
file the moment you reach a step that needs it, and only that section.

## The traps that actually bite (all are IN the playbook — this is a pre-flight)

| trap | where |
|---|---|
| **Audio slot `mediaType` is the string `'audio'`**, NOT `MEDIA_TYPE.VIDEO` (enum has no AUDIO). Wrong → role match fails → `Input_audio` never injected → output keeps the source's own audio | 02 |
| **`filterMediaInputsForModel` drops `'audio'` slots** for a no-model Flow (`model:null`) — the filter keeps ALL slots when there's no model. Verify your no-model flow's audio slot survives | 02 |
| Flow input nodes read a **PATH** from `.string`, routed by title pattern (`/^input_(video\|audio\|image)(_\d+)?$/i`) + class. NOT stock `LoadImage`/`LoadAudio` | 02 |
| Capture is **prefix-match** (`Output_Image*` / `Output_video*`); `output_audio` + `output_preview` stay EXACT | 02 |
| Outputs **self-gate in the workflow** → capture-what-ran → NO flow-side `outputSchema`. ONE placeholder; real 1..N land on complete | 02 |
| Media roles in `inputSchema.media[].roles` MUST match the op's `mediaInputs` keys | 01/02 |
| The op goes in **4 files**; `operation_registry.json` is a hand-maintained superset — never regenerate | 01 |
| Flow input files → `Media/.preview-assets/` (deduped), NOT the gallery. No `media:imported` emit | 03 |
| Reuse needs `flowId`+`flowInputs` on BOTH the sidecar AND the live in-memory item | 03 |
| Injection **silently skips** a param whose `Input_*` title matches no node — run `tests/inject-params-titles.test.cjs` | 05 |
| An flow-vs-browser divergence is ALWAYS a flow-side injection/routing bug, never the workflow | 02 |
| uiComponent is OPTIONAL — omit for a media-only flow (BaseFlow renders slots) | 01/04 |

## Hard rules

- **Never hand-edit a workflow JSON.** Re-export from ComfyUI.
- **All flow input/output nodes are path-reading + self-gating.** Don't reintroduce input-dir
  loaders.
- If the user tells you something the playbook already covers, that's a playbook or reading
  failure — fix the playbook if it's the former. Don't leave knowledge only in the chat.
- Dev-gate stays until ≥4 flows (user decision).
- NO flow version bump for the flow; a NEW op sets `appVersionIntroduced` in both op registries.

## STEP 3 — Verify (Definition of Done)

Follow `docs/playbooks/add-flow/05-verify.md`: inject test green, `node --check`, then the
user-driven live run (each media type injects — ESPECIALLY audio — multi-output, storage in
`.preview-assets`, status bar, Ctrl+Enter, reuse across restart). Real gens are the user's to
run; you verify render + code + automated checks.
