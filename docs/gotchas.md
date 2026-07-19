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
| Per-model research (LTX/Wan/Krea2/PiD) | [models/README.md](models/README.md) |
| LTX-2.3 tiers / stage roles | [models/ltx/tiers.md](models/ltx/tiers.md) |
| LTX black-bars + NAG | [models/ltx/black-bars-and-nag.md](models/ltx/black-bars-and-nag.md) |
| LTX workflow authoring mechanics | [models/ltx/workflow-authoring.md](models/ltx/workflow-authoring.md) |
| Gemma precision / VRAM tiers / LoRAs | [models/ltx/model-set.md](models/ltx/model-set.md) |
| Pod perf (aimdo cold-fault) | [builder/research/pod-perf-investigation.md](builder/research/pod-perf-investigation.md) |
| Audio input / voice-ID | [models/ltx/audio-input.md](models/ltx/audio-input.md) |
| LoRA-stack merge | [models/ltx/lora-merge.md](models/ltx/lora-merge.md) |
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

### MPI coordination messages — ASCII only, no emoji

`.agents/mpi-kanban/state/messages/*.json` bodies must be plain ASCII. On Windows, Python's
default stdout/file codec is cp1252, which throws `UnicodeDecodeError`/`UnicodeEncodeError` on
emoji when an agent reads or re-emits a message. An emoji in a message body silently breaks the
`mpi-message` read path. Keep bodies ASCII; put personality in the chat, not the JSON.

### backend logger arity

`routes/logger.js` public API: `logger.info(category, message)` — 2 args; `logger.warn(category, message)` — 2 args (3rd argument is SILENTLY DROPPED, not formatted, not logged); `logger.error(category, message, err)` — 3 args (`err.stack` appended). To attach structured detail to a `warn`/`info`, fold it into the message string yourself (e.g. `JSON.stringify(detail)`).

### reading logs/app.log — filter, never read whole (MPI-315)

Every line is `[ts] [LEVEL] [category] …`, so the file is queryable. Use that instead of reading it:

- **Pick the category your bug lives in** and `Grep` for it. `\[download\]` returns ~72 lines out of 3478. `[comfy]` is ComfyUI engine stdout and is usually NOT your bug — skip it unless the engine is the suspect.
- **Choose the window deliberately.** Tail (last 50–100 lines) for a crash that JUST happened; grep-by-category for anything older. A tail is the wrong window for an hour-old bug — and reading "nothing there" as proof it did not happen is how MPI-310 nearly drew a false conclusion from an evicted log.
- **Never read `logs/app.log.1`** (rotated overflow) unless the user asks for it.
- Retention is byte-rotation ONLY (256 KB → `app.log.1`, one generation, overwritten). A startup line-trim used to also run; it was deleted in MPI-315 because it rewrote the file in place and swallowed its own errors. Do not reintroduce it — fix noise at the source instead of deleting evidence.
- ComfyUI stdout is filtered out of the file but still goes to the **terminal** (`logger.consoleOnly`). For engine detail beyond what the log holds, ask the user for the terminal output. Known gap: ~132 boot-banner lines/boot still reach the file; unexplained, deliberately not chased (see MPI-315).

### kanban card shape rules

When creating or editing MPI Kanban cards (`.agents/mpi-kanban/tasks/<id>/task.json`), read the mpi-lib schema FIRST (`C:\Users\Fabio\.agents\skills\mpi-lib/task-board-ops/_schema.md`, `mutate.md`, `validate.md`). Common breakages: (1) `status` is NOT free-form — canonical values are `active`/`accepted`; put blocking info in `description` or `brief.md`. (2) `links` must be the full 8-key set for the board's TASK WORKSPACE panel to render. (3) `description` is a SHORT one-line card summary — long-form goes in `brief.md`. (4) the `schema` VALUE is validated, not just JSON syntax — copy it VERBATIM from the templates: `task.json` → `mpi-kanban/task-card/v1` (NOT `mpi-kanban/task/v1` — a hand-authored MPI-256 dropped the `-card` and the whole board view wedged while every file still parsed), `board.json` → `mpi-kanban/board/v1`, every `events.jsonl` line → `mpi-kanban/event/v1` keyed `at` (not `ts`). "Valid JSON" ≠ "valid card"; board-blank-after-a-new-card → suspect a wrong `schema` value FIRST, before reading any reader code. `maturity` enum: `idea`, `planned`, `in-progress`, `validating`, `complete`. LIFECYCLE: every card with real work passes `todo → doing → done`. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in BOTH event logs. The live board is `board.json` with `todo`/`doing`/`done` columns — NOT the legacy `kanban-ops/` Markdown board doc (5-column BACKLOG/PLANNING/… board that does NOT exist).

**A single stray `\` takes the WHOLE BOARD DOWN.** Card/event text is markdown inside a JSON string, so describing a Windows path or a separator heal (`` `\` `` , `` `/`->`\` ``) writes a lone backslash. `\`` is not a valid JSON escape → the board fails to render with *"Bad escaped character in JSON at position N"* and every card disappears, not just the bad one. Write `\\` in the raw JSON (renders as one `\`). Prefer the word "backslash" over the character in card prose. Before finishing any card/event write, validate: `python -c "import json;[json.loads(l) for l in open(P,encoding='utf-8') if l.strip()]"` for `.jsonl`, `json.load` for `.json`. Repair is escape-only — after fixing, assert the raw line differs from the original ONLY by backslashes so no wording drifts. (Bit us 4× across `events.jsonl`, `MPI-67`, `MPI-118`, `MPI-246`.)

### shared-tree commit hygiene

The branch is shared by concurrent agents. NEVER `git add -A`/`git add .`. Push stays user-authorized.

**When a sibling agent has UNSTAGED edits in a file you also touched, `git commit --only <paths>` is NOT safe.** MPI-245 committed another session's in-progress MPI-242 work twice before catching it. Two independent traps: (1) `--only <paths>` commits those paths **as they are in the WORKING TREE**, discarding your hunk-level staging; (2) the `lint-staged` pre-commit hook stashes unstaged changes, runs, and reapplies — that cycle folds the sibling's edits in even when your index was clean.

Safe recipe for a co-owned file:

1. Stage ONLY your hunks, anchored by **content**, never line numbers (they drift under you): `git diff -- <file> > p.patch`, keep the hunks whose *added* lines contain a marker unique to your change, then `git apply --cached --recount <filtered.patch>`.
2. Verify: `git diff --cached -- js/ | grep -c '<their marker>'` must be `0`, and each staged blob must parse standalone (`git show ":<file>" > /tmp/x.js && node --check /tmp/x.js`) — a half-applied hunk still lints fine in the working tree.
3. Commit the INDEX: bare `git commit -n`, **no pathspec at all**. `-n` bypasses the lint-staged stash/reapply — run eslint yourself first; you are opting out of the hook, not the check.
4. Confirm the sibling's files are still `M` (modified, uncommitted) afterwards.

Already committed their work? Nothing is lost: `git tag backup HEAD` → `git reset --soft HEAD~1` → `git reset HEAD -- <co-owned files>` → re-apply your filtered patch → commit the index → verify `git status --short` shows their files back as `M`.

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
