---
name: mpi-end
description: Cubric Vision session close-out. Runs the full MPI end-session workflow, then a release-awareness check (unreleased changelog + versioning drift). Use when the user says "end this session", "end session", "wrap up", "commit and close", "we're done", "$mpi-end", or "/mpi-end".
---

# mpi-end Skill

Project-scope close-out for the **Cubric Vision** repo. It owns the "end this
session" trigger here and does three things in order:

1. **Delegate** to the user-scope `mpi-end-session` workflow, run exactly as-is.
2. **Then** run the knowledge-healing pass (Step 2 below).
3. **Then** run the release-awareness check (Step 3 below) as the final step.

## Why this skill exists

The user-scope `mpi-end-session` skill (in the MPI Kanban pack) is generic and
must not be edited — a pack update would overwrite any change. It also does NOT
know about Cubric Vision's release mechanics (the unreleased changelog and the
version system). This project skill wraps it instead of forking it: it adds the
Cubric-specific release-awareness check without touching the shared skill.
Because it DELEGATES (does not copy) the end-session logic, a pack update to
`mpi-end-session` flows through automatically.

## Steps

1. **Run the user-scope end-session workflow.** Execute the full
   `mpi-end-session` skill (sync docs/rules, persist memory, commit touched
   files, update/close the JSON task card) exactly as that skill defines it. Do
   not reimplement or summarize its steps here — follow that skill.

   **Scope gate — read these two small files BEFORE the delegation:**
   `.agents/mpi-kanban/state/index.json` and `.agents/mpi-kanban/state/interop.json`
   (both under 3 KB). **Parse as `utf-8-sig`** — a sibling repo's `interop.json`
   carries a UTF-8 BOM and a plain `utf-8` `json.loads` dies on it with
   `Unexpected UTF-8 BOM`. Treat a counter as CLEAR when it is `[]`, `0`, **or
   absent** — the shape varies by repo (lists here, the fields omitted entirely in
   Cubric-Prompt), so measure it, never assume. If `active_sessions`,
   `active_tasks`, `active_file_claims`, `pending_file_states` and `open_messages`
   are ALL clear, there is nothing to coordinate: **SKIP** `mpi-end-session`
   step 0's coordination reads — `docs/coordination/README.md`,
   `coordination-ops/lifecycle.md`, `coordination-ops/statuses.md`,
   `coordination-ops/messages.md` — and skip its open-messages boundary check. If
   `interop.json` says `source_of_truth: "file"`, also skip `interop-ops/modes.md`
   and treat the mode as `file`. **Always** read `task-board-ops/_schema.md`,
   `read.md` and `mutate.md` before any card write — never skippable.

   `active_handoffs` is deliberately NOT part of the condition: it is a *resume*
   signal, not a coordination-reference signal. A handoff left open just means the
   last session ended mid-thread — it says nothing about whether a PEER is active,
   which is what the coordination references exist for. Those five counters above
   already answer that. Still reread the handoff records step 0 asks for.

   (This paragraph until 2026-08-03 justified the exclusion by claiming the index
   entries "carry only `id`/`path`/`task`/`created_at` — no `status` field to judge
   them by". That is FALSE — they do carry `status`; a close-out that day read four
   entries, three `resolved` and one `open`. The exclusion is still right, for the
   reason above. Do not reinstate the false claim.)

   Say in ONE line what was skipped, e.g. `Coordination reads skipped: solo
   session, file mode.` If ANY counter is non-clear, read all of step 0 as written.

   Why: those five references are ~28 KB (~7.5k tokens) of multi-agent coordination
   rules that are inapplicable to a solo, file-mode close-out — which is nearly
   every close-out in this repo.

2. **Knowledge-healing pass (do NOT skip).** The routing system (CLAUDE.md →
   folder README → subsystem doc) only stays trustworthy if every agent that
   hits a gap repairs it. Replay THIS session and answer honestly:

   - **Dead or wrong pointer?** A doc/rule/memory/skill pointed at a file,
     section, function, or flag that no longer exists — or at the wrong home.
   - **Routing gap?** The task matched no router row, or the routed doc lacked
     the fact needed, forcing a codebase search or a wrong first attempt.
   - **Rule gap?** A mistake happened (or the user corrected the agent) that an
     existing rule SHOULD have prevented but doesn't cover — or a rule misled.
   - **Skill/command friction?** A project skill or playbook step failed,
     was ambiguous, or needed improvisation to complete.
   - **Memory drift?** A memory entry contradicted reality or duplicated what
     docs now hold.

   Then heal at the source, honoring the no-catch-all rule (facts go to the ONE
   subsystem doc the map routes to — never a dump file):

   - **Mechanical heals — fix directly, no approval needed:** dead pointers,
     broken links, stale file/function references, memory-entry corrections,
     MEMORY.md index drift.
   - **Substantive changes — one-line proposal per file, wait for approval:**
     new/changed rule text, doc content additions, router-row changes,
     project-skill (`.claude/skills/`) step edits. Same discipline as the rest
     of close-out.
   - **Global/user-scope artifacts (`~/.claude/skills/`, the MPI Kanban pack):
     NEVER edit.** Record the needed change as a memory note (or kanban card)
     so an issue can be filed on the pack — same lifecycle as promoted domains.

   No friction this session → say "no knowledge gaps hit" in one line and move
   on. Never invent a gap to have something to heal.

3. **Release-awareness check (do NOT skip).** The generic `mpi-end-session`
   workflow does NOT look at the changelog or versioning — those are
   Cubric-specific release mechanics. Diff THIS session's changes (working tree,
   or the session's commit(s) if end-session already committed) and ask, per the
   kind of work that landed:

   - **Resolve WHICH file first: run `gh release list | head -3`.** A version
     with a tag/release has FROZEN notes — `RELEASE_NOTES['<that version>']` in
     `js/data/releaseNotes.js` is as archival as `docs/releases/YYYY-MM-DD-vX.Y.Z.md`,
     and writing into it describes features that are in no build the user can
     install. New user-facing work ALWAYS goes to `docs/releases/UNRELEASED.md`,
     which `/mpi-version-bump` folds into the next version. **`package.json`
     version is NOT the signal** — it reads `1.2.0` both while 1.2.0 is in
     development and after 1.2.0 ships. A handoff or card naming a version is a
     claim to verify, not an instruction: this check exists because MPI-356 wrote
     two entries into `RELEASE_NOTES['1.2.0']` on a handoff's say-so, three days
     after v1.2.0 was published.

   - **Unreleased changelog (`docs/releases/UNRELEASED.md`).** Did this session
     add a user-facing change (new feature, fixed bug, behaviour change) that
     belongs in the next release notes? OR does an EXISTING entry now contradict
     what shipped — a feature reverted, renamed, replaced, or descoped? If
     either, propose the edit to `UNRELEASED.md` (right section:
     `importantChanges` / `whatIsNew` / `fixes`) and wait for approval. Stale
     changelog notes ship silently — this step exists because a reverted "Wan 2.2
     model split" note nearly shipped after the model was merged back to one.

   - **A change to an UNRELEASED thing owes no entry.** Before writing "X changed
     from A to B", grep `UNRELEASED.md` and `js/data/releaseNotes.js` for the
     FEATURE itself. If it appears only in `UNRELEASED.md` — or in neither — then
     no released build contains A, so the line describes a difference nobody can
     perceive. Fold the correction into the existing unreleased entry, or write
     nothing. This is not the same as the stale-entry check above: that one
     catches an entry contradicting what shipped; this catches an entry
     describing a delta against something that never shipped. (2026-08-07:
     proposed three lines about MiniMax H3's size tier and VRAM floor — for a
     model that has never appeared in `releaseNotes.js`.)

   - **Versioning.** Did the change touch anything the version system tracks?
     Read `.claude/rules/versioning.md` (then `docs/versioning.md`) FIRST, then
     check whether a bump or registry edit is warranted:
     - `APP_VERSION` + `package.json` + `package-lock.json` (kept identical) — app release.
     - `SCHEMA_VERSION` + migrations + project-creation defaults — project data-shape change.
     - Operation/command registries kept aligned: `js/data/commandRegistry.js`,
       `js/core/operationRegistry.js`, `operation_registry.json`, universal
       workflows, model `supportedOps`.
     - Engine/provisioning: `dev_configs/system_dependencies.json` + provisioning routes/docs.
     - Release notes: `js/data/releaseNotes.js` + `docs/releases/YYYY-MM-DD-vX.Y.Z.md`.
     Note: models have NO version field — only operations do. New model weights =
     a NEW model id/entry (e.g. "Wan 2.2 Smooth V2"), never a bump on the existing one.
     Do NOT bump here. Run `npm run release:check`, then tell the user whether a
     `/mpi-version-bump` or a full `mpi-release` (the one GitHub-only release
     flow) pass is needed, naming the specific surfaces that drifted.

   - **Curated pip-set drift (MPI-413) — ONLY when this session touched
     `dev_configs/node_lock.json` or `js/data/modelConstants/nodesDeps.js`.** Run
     `node scripts/compile-node-deps.mjs --check`. It reports what an
     `installRequirements: true` node declares that `dev_configs/python_deps.in`
     does not cover; anything reported means the node ships with MISSING
     dependencies, because neither engine runs a node's `requirements.txt` any
     more — both install the one curated file. Fix by adding the reported
     packages to `python_deps.in`, regenerating with
     `node scripts/compile-node-deps.mjs`, and committing BOTH files (never
     hand-edit the `.txt`).
     **Why this lives here and not in a hook or the suite:** `--check` FETCHES
     each node's `requirements.txt` from `raw.githubusercontent.com` at its
     pinned commit, so it cannot go in `node --test` (offline runs would flake)
     and is too slow for a pre-commit hook. `tests/curated-python-deps.test.cjs`
     already guards the INVARIANTS automatically (no engine-owned torch stack,
     exactly one opencv distribution) but it does NOT guard COVERAGE — a newly
     added node's deps going missing is invisible to it. The Pod image build's
     `IMPORT FAILED` grep catches it, but only when someone builds an image.
     This bullet is the gap between those two. The `/mpi-add-model` playbook has
     the same step; this catches the hand-edit path that bypasses the skill.

   These are POINTERS, not auto-edits: surface a one-line proposal per affected
   file and wait for explicit per-file approval — same discipline as the
   end-session rule/doc pass. If nothing drifted, say so in one line.

   (The generic rule/doc/memory impact pass is already handled by
   `mpi-end-session` step 1 — this skill only adds what that skill omits:
   knowledge healing, changelog, versioning.)

## `validating` IS NOT A PARKING SPACE — resolve every card, or ASK

**Added 2026-08-08 after the board reached 19 cards in `doing`, 16 of them
`validating`.** Twelve closed in one pass the moment the user was actually asked;
every one had its evidence recorded already and was sitting there only because
nobody ever came back. His words: *"If it's validated, it moves to done. It
doesn't need to wait for my approval. Or if it needs my approval, agents should
at least ask."*

Before this skill finishes, **every card the session touched must land in exactly
one of two states.** There is no third option and silence is not one of them.

**1. Evidence exists → move it to `done`. Do not ask.**
Agent verification counts and is sufficient: passing tests, a live probe, a real
log line, a `/history` graph diff, an offline harness run. `validating` is not a
courtesy hold for the user to rubber-stamp work that is already proven. Move it.

**2. A human's eyes or ears are genuinely required → ASK, in this session,
before it ends.**
Only a judgement no test can make qualifies: does this LOOK right, does it SOUND
right, is this copy good, is this the product call. Name the card and the ONE
thing needed, in one line. If the user answers, act on it. If the session ends
without an answer, say so plainly in the close-out summary — an unanswered ask is
still visible, a silent park is not.

**Leaving a card in `validating` without asking is the defect this rule exists to
stop.** It reads as progress and is indistinguishable from abandonment.

**So: list every `validating` card before closing.** For each, state the evidence
and its outcome — moved, or the one question. A session that ends with cards
still parked and no questions asked has not finished.

## Hard rules

- Never edit the user-scope `mpi-end-session` skill or any file under
  `~/.claude/skills/`. This skill delegates; it does not duplicate.
- Never bump a version or rewrite release notes inside this skill — surface what
  needs a bump and defer to `/mpi-version-bump` or a release skill.
- `git push` is never in scope; the user pushes when ready.
