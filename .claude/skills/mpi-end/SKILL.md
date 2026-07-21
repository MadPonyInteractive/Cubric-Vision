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

0. **Switch to Sonnet first (cost — this workflow is mechanical).** Frontmatter
   `model:` only holds for one turn, so it can't pin a multi-turn workflow like
   this one. Instead run `/model sonnet` NOW, before Step 1, so the whole
   close-out runs on Sonnet. If the session is already on Sonnet, skip. Tell the
   user you switched; the session model resumes when they next prompt.

1. **Run the user-scope end-session workflow.** Execute the full
   `mpi-end-session` skill (sync docs/rules, persist memory, commit touched
   files, update/close the JSON task card) exactly as that skill defines it. Do
   not reimplement or summarize its steps here — follow that skill.

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

   - **Unreleased changelog (`docs/releases/UNRELEASED.md`).** Did this session
     add a user-facing change (new feature, fixed bug, behaviour change) that
     belongs in the next release notes? OR does an EXISTING entry now contradict
     what shipped — a feature reverted, renamed, replaced, or descoped? If
     either, propose the edit to `UNRELEASED.md` (right section:
     `importantChanges` / `whatIsNew` / `fixes`) and wait for approval. Stale
     changelog notes ship silently — this step exists because a reverted "Wan 2.2
     model split" note nearly shipped after the model was merged back to one.

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

   These are POINTERS, not auto-edits: surface a one-line proposal per affected
   file and wait for explicit per-file approval — same discipline as the
   end-session rule/doc pass. If nothing drifted, say so in one line.

   (The generic rule/doc/memory impact pass is already handled by
   `mpi-end-session` step 1 — this skill only adds what that skill omits:
   knowledge healing, changelog, versioning.)

## Hard rules

- Never edit the user-scope `mpi-end-session` skill or any file under
  `~/.claude/skills/`. This skill delegates; it does not duplicate.
- Never bump a version or rewrite release notes inside this skill — surface what
  needs a bump and defer to `/mpi-version-bump` or a release skill.
- `git push` is never in scope; the user pushes when ready.
