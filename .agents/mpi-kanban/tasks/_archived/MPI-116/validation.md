# MPI-116 validation

Two-tier ComfyUI node naming law. Shipped this session, user-authorized to close.

## What shipped

1. **Rule doc** — `.claude/rules/comfy_injection.md`, Sub-Agent Briefing section:
   - "Node naming law (two-tier)": Tier-1 legacy reserved titles unchanged; Tier-2 new workflows MUST prefix agent-relevant nodes `Input_*` (inject) / `Output_*` (capture).
   - "Enforce the law when handed new nodes": agent must tell the user off and refuse to invent a contract when a NEW non-reserved node lacks the prefix.
2. **Load-time validator** — `js/services/comfyController.js` `runWorkflow()`: after fetch, `clientLogger.warn` if a loaded workflow has no capture node (`Output` / `Output_*` / `Preview` / `Detected`). No hard fail. Only the unambiguous violation is flagged; bare legacy input titles are valid by design and not flagged.
3. **Memory** — `feedback_comfy_node_naming_law.md` + MEMORY.md pointer: durable "enforce + tell the user off" behavior.

## Verification

- Doc change: convention reads coherently with the existing Standard Node Title Map; Tier-1 exemption prevents false positives on `Positive`/`Seed`/`Lora_N`/`Output`.
- Validator: capture-node detection mirrors the existing `_collectComfyOutputUrls` capture titles (`output`/`output_`/`preview`/`detected`). Warn-only, cannot break a run. Not exercised against a live ComfyUI submission this session — it is a pure presence check on already-fetched JSON, no execution path change.

## Dropped (design session, by user)

Symbol prefixes (edit/API version split makes strip-in-code unworkable), subfolders + folder-agnostic scan (edit-folder organization + filesystem duplicate-name check already cover it), manifest sidecar, ComfyUI-authoring skill.

## Deferred

Adapt-a-workflow skill (agent reads a dropped/foreign workflow, proposes the prefix rename) — future card.
