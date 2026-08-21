# Delete the workaround half of the claim fix once the pack ships MPI-26

Cubric-Vision commits `8052e4fb` and `9ae5a0ee` fixed peer agents overwriting each
other. Part of that work is permanent policy; part of it only exists because the
`mpi-kanban` skill pack is broken. When the pack fix lands, the second part becomes a
doc asserting something false, which is worse than no doc.

Blocked on: `Mpi-Kanban` card **MPI-26** (`c:\AI\Mpi\Plugins\Mpi-Kanban`,
`.agents/mpi-kanban/tasks/MPI-26/`) — and specifically on the pack being **reinstalled
globally** afterwards. Fixing that repo changes nothing here until
`npx skills add MadPonyInteractive/mpi-kanban --all -y -g` overwrites
`~/.agents/skills/`. Do not start this card off the upstream commit alone; check the
installed pack.

## Dies — delete outright

**`.claude/rules/kanban.md` § "`python scripts/new_uuid.py` DOES NOT EXIST" (L289-302,
14 lines).** Pure workaround for pack bug 1. After the fix the script ships at
`<mpi-lib-root>/scripts/new_uuid.py` and this section asserts a falsehood, complete
with a "verified 2026-08-08" stamp that makes it look current. Delete the section.

**`.claude/rules/kanban.md` § Sub-Agent Briefing, the trailing uuid clause (L353):**
"the `scripts/new_uuid.py` the skill docs name does not exist". One line, same reason.
The `python -c "import uuid; print(uuid.uuid4())"` instruction can stay — it works
either way and costs nothing — but drop the claim about the script.

That is the whole list. 15 lines.

## Survives — do not delete

Everything else addresses problems the pack fix does not touch. Stated explicitly
because "the skills are fixed now" is exactly the reasoning that would delete them:

- **`.agents/mpi-kanban.local.md`.** Not a workaround — it is the config
  `/mpi-brief-rule` reads. MPI-26 makes `mpi-init` *create* it on adopt; Vision is
  already adopted, so `mpi-init` will not re-run here and the file stays load-bearing
  forever. Deleting it re-breaks every sub-agent briefing.
- **CLAUDE.md § Critical Rules Snapshot, the claim bullet.** Fixes a third problem the
  card does not address: the claim procedure lives *inside* the `mpi-*` skills, so an
  agent doing ordinary work never loads it. A skill pack has no always-loaded surface
  in a consumer project — only that project's `CLAUDE.md` does — so this has to live
  downstream structurally. No upstream fix can replace it.
- **`.claude/rules/kanban.md` § File claims (minus the uuid subsection), § Card
  ownership, § Sub-Agent Briefing.** Same reasoning.
- **The destructive-git ban** (snapshot bullet, `git.md` § MPI-365 edits,
  `.claude/hooks/guard-destructive-git.py`, its `PreToolUse` registration). Unrelated
  to both pack bugs. Local git policy.
- **CLAUDE.md § Sub-Agent Dispatch step 3** (ownership + claim in every dispatch).
  Unrelated.

## Also re-verify

- Line numbers cited in `.claude/rules/kanban.md:291` (`lifecycle.md:83`,
  `messages.md:67`, `uuid-helper.md`, `mpi-handoff/SKILL.md:125`) drift on any edit to
  those files. Re-anchor or drop the numbers.
- Re-run the brief-rule chain check: 18/18 rules resolve and carry a
  `## Sub-Agent Briefing`, 3/3 bundles resolve, the CLAUDE.md snapshot anchor still
  extracts. A pack update can change `config-ops.md`'s schema.
- **Watch for auto-repair.** MPI-26's plan has `mpi-project-refresh` *report* a missing
  `.agents/mpi-kanban.local.md` as a finding. If it shipped as auto-repair instead,
  running `/mpi-project-refresh` here could regenerate Vision's hand-written config —
  18 rules, 3 bundles — with whatever the scaffold emits. Verify before running it.
- Reword § File claims' framing. It is written in the present tense of an outage
  ("the lock that nobody has taken since 2026-06-16"). Once claiming is actually
  happening, that heading should become history, not a status report.
