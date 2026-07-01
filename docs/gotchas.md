# Cubric Vision — Engineering Gotchas & Hard-Won Lessons

Cross-cutting conventions + temporary/unverified flags that don't belong to any single
subsystem. **Durable subsystem knowledge lives in its subsystem/research doc, not here** —
see the pointer table below and [docs/README.md](README.md) for the full map. This file is
kept small on purpose (≤200 lines); if you're about to add a fact here, first ask whether it
has a subsystem home. Verify a named file/function/flag still exists before relying on an entry.

---

## Where the durable gotchas went (MPI-170 drain)

gotchas.md was an inbox with no outbox — 646 lines / 138 entries, mostly duplicates of content
already in subsystem docs. MPI-170 drained it. If you're looking for a fact that used to live
here, it now lives in its proper home:

| Domain | Home |
|---|---|
| RunPod remote-engine **architecture** | [runpod-remote-engine.md](runpod-remote-engine.md) |
| RunPod **fixed-bug traps** + CPU download-mode | [runpod-troubleshooting.md](runpod-troubleshooting.md) |
| Engine-split (deps + workflow axis) | `.claude/rules/comfy_engine.md` § Engine Split |
| ComfyUI engine / injection gotchas | [comfy.md](comfy.md) · `.claude/rules/comfy_injection.md` |
| Models-path / YAML / extra-folders | [models-path.md](models-path.md) |
| Download manager / NDH resumable | [download-manager.md](download-manager.md) |
| Generation / prompt / sidecar | [comfy.md](comfy.md) · [data.md](data.md) · [project-integrity.md](project-integrity.md) |
| UI / component contracts (18 entries) | [ui-gotchas.md](ui-gotchas.md) |
| LTX-2.3 tiers / stage roles | [builder/research/ltx-2.3-tiers.md](builder/research/ltx-2.3-tiers.md) |
| LTX black-bars + NAG | [builder/research/black-bars-and-nag.md](builder/research/black-bars-and-nag.md) |
| LTX workflow authoring mechanics | [builder/research/ltx-workflow-authoring.md](builder/research/ltx-workflow-authoring.md) |
| Gemma precision / VRAM tiers / LoRAs | [builder/research/model-set.md](builder/research/model-set.md) |
| Pod perf (aimdo cold-fault) | [builder/research/pod-perf-investigation.md](builder/research/pod-perf-investigation.md) |
| Audio input / voice-ID | [builder/research/audio-input.md](builder/research/audio-input.md) |
| LoRA-stack merge | [builder/research/lora-merge-ltx.md](builder/research/lora-merge-ltx.md) |
| Pod image / mpi-ci / version-lock | [builder/02-image-and-rebuild.md](builder/02-image-and-rebuild.md) |
| ComfyUI portable env | [builder/01-environments.md](builder/01-environments.md) |
| Workflow gen + node-naming + SaveVideo | [builder/05-author-and-test.md](builder/05-author-and-test.md) |
| Build / release / distribution | [releases/patch-distribution.md](releases/patch-distribution.md) · [releases/portable-distribution-contract.md](releases/portable-distribution-contract.md) · [releases/README.md](releases/README.md) |
| Build evidence / macOS fixes | [releases/build-experience-log.md](releases/build-experience-log.md) · [releases/github-release-checklist.md](releases/github-release-checklist.md) |

---

## Temporary / unverified flags (drop when resolved)

These are NOT subsystem facts — they're live state that expires. Delete each when its condition clears.

### RunPod branch = v1.1.0 trunk — do NOT merge to master before first public release (~2026-07-09)

As of 2026-06-14, `RunPod` is the active shared integration branch (v1.1.0). No one works on
`master` (dormant, 1.0.0 line). Branch from `RunPod`, commit to `RunPod`, PR against `RunPod`.
Because the branch is shared by concurrent agents, STAGE BY EXPLICIT PATH (never `git add -A`).
`master` receives only minor patches for 1.0.x issues, then merged back into `RunPod`.

**RunPod must NOT merge INTO master until master's first PUBLIC release (~2026-07-09).** RunPod
carries unreleased work (LTX, remote engine); the LTX feature drop ships to **Patreon/Pro ONLY
off the RunPod branch** (Cloudflare/R2 link, no git tag, no GitHub publish). ONLY AFTER the first
public master release does RunPod merge into master. Don't auto-bump the app version for a small
Pod-parity fix — ask the user whether it folds into the existing RunPod LTX drop. The first public
master release (R2 dep links + master 1.0.x bump) is **MPI-129's** gate.

### empty-media dispatch guard

MPI-109: pressing Cue/Q with an empty PromptBox on a media op dispatched a generation with no media
injected. The workflow JSON ships baked-in default filenames on LoadImage/LoadVideo nodes (authoring
residue) that exist locally but not on a clean Pod → `prompt_outputs_failed_validation` / 503 →
bug-report dialog. Guard lives at the TOP of `startGeneration` (`generationService.js`) — single
chokepoint covering Q hotkey / Cue button / loop re-fire. Required-slot unsatisfied → `ui:warning`
toast + `return null`.

---

## Conventions / gotchas

These are genuinely cross-cutting — they belong to no single subsystem.

### backend logger arity

`routes/logger.js` public API: `logger.info(category, message)` — 2 args; `logger.warn(category, message)` — 2 args (3rd argument is SILENTLY DROPPED, not formatted, not logged); `logger.error(category, message, err)` — 3 args (`err.stack` appended). To attach structured detail to a `warn`/`info`, fold it into the message string yourself (e.g. `JSON.stringify(detail)`).

### kanban card shape rules

When creating or editing MPI Kanban cards (`.agents/mpi-kanban/tasks/<id>/task.json`), read the mpi-lib schema FIRST (`C:\Users\Fabio\.agents\skills\mpi-lib/task-board-ops/_schema.md`, `mutate.md`, `validate.md`). Common breakages: (1) `status` is NOT free-form — canonical values are `active`/`accepted`; put blocking info in `description` or `brief.md`. (2) `links` must be the full 8-key set for the board's TASK WORKSPACE panel to render. (3) `description` is a SHORT one-line card summary — long-form goes in `brief.md`. `maturity` enum: `idea`, `planned`, `in-progress`, `validating`, `complete`. LIFECYCLE: every card with real work passes `todo → doing → done`. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in BOTH event logs. The live board is `board.json` with `todo`/`doing`/`done` columns — NOT the legacy `kanban-ops/` Markdown board doc (5-column BACKLOG/PLANNING/… board that does NOT exist).

### shared-tree commit hygiene

The RunPod branch is shared by concurrent agents. Commit by explicit pathspec (`git commit --only <paths>`), NEVER `git add -A`/`git add .`. Push stays user-authorized (do not push unless asked).

### no toast on user Stop

User actions are self-evident — toasts for NON-user events only.

### error dialog vs toast

`ui:error` → MpiErrorDialog (GitHub-report dialog, for genuine reportable bugs). `ui:warning`/`ui:info`/`ui:success` → toast. Reserve the GitHub-report dialog for genuine bugs, not expected transient states.

### the ≤200-line-per-doc rule (MPI-170)

Docs files should not exceed **200 lines**; over that = split into topic files. Exceptions: research
lab notebooks (`builder/research/pod-perf-investigation.md`, `audio-input.md`) and evidence logs
(`releases/build-experience-log.md`) are EXEMPT — they're append-only evidence, not reference. A few
coherent single-subject contracts sit near/over the line by design (`project-integrity.md`,
`runpod-remote-engine.md`, `releases/portable-distribution-contract.md`) — splitting them hurts
readability more than it helps; don't mechanically split a coherent doc. When you learn something
durable, write it to its **subsystem** doc, not here — this file is conventions + expiring flags only.
