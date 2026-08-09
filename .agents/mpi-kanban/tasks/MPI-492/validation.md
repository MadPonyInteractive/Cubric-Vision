# Validation — MPI-492

Done 2026-08-09 via `/mpi-project-refresh`. The card's two blockers both cleared, and the
scope grew from "delete 15 lines" to the whole Mpi-Kanban 1.0 migration, because the pack
did not just fix two bugs — it became a plugin with six enforcing hooks.

## Blockers cleared

| Blocker | Evidence |
|---|---|
| Upstream `Mpi-Kanban MPI-26` ships | `new_uuid.py` present at `<plugin>/skills/mpi-lib/scripts/new_uuid.py`, alongside `validate_board.py` |
| Pack reinstalled globally | `ls -d ~/.claude/skills/mpi-* ~/.agents/skills/mpi-*` → **zero survivors**. Installed as plugin `mpi-kanban@mad-pony-interactive` **1.0.1** |

## The card's original list — both items dead as specified

- `.claude/rules/kanban.md` § "`python scripts/new_uuid.py` DOES NOT EXIST" — deleted,
  replaced with a § Generating the uuid that names the shipped script, plus a dated note
  saying the old claim was true of the pack and false of the plugin.
- The Sub-Agent Briefing's trailing uuid clause — deleted. The `python -c "import uuid"`
  line stayed (works either way) and now names `guard-claim` instead.

## The card's "survives — do not delete" list, re-judged against 1.0

The brief was written before the hooks existed and argued each of these could never be
fixed upstream. Three of the four now can be, and were:

- **CLAUDE.md § Critical Rules Snapshot, the claim bullet** — the brief's reasoning was
  "a skill pack has no always-loaded surface in a consumer project, so this has to live
  downstream structurally." A **hook** is that surface. `guard-claim` blocks the write on
  every Edit/Write/Bash whether or not a skill was invoked. Bullet deleted.
- **The destructive-git ban** (snapshot bullet + `.claude/hooks/guard-destructive-git.py`
  + its `settings.json` registration) — `guard-git` is the plugin's twin. Bullet deleted,
  local hook retired; leaving both registered fires the guard twice.
- **CLAUDE.md § Sub-Agent Dispatch step 3** — trimmed to naming ownership. The claim half
  is `guard-claim`'s.
- **`.agents/mpi-kanban.local.md`** — kept, exactly as the brief argued. It is
  `/mpi-brief-rule` config, not a workaround, and `mpi-init` will not re-run on an adopted
  project. 18 rules + 3 bundles, untouched.

## Also-verify list from the brief

- **Line numbers** cited into pack files (`lifecycle.md:83`, `messages.md:67`,
  `mpi-handoff/SKILL.md:125`) — dropped rather than re-anchored. They pointed at a pack
  that no longer exists.
- **`.claude/rules/kanban.md:81`** ("a `done` move must ALSO set `status`") re-checked
  against 1.0.1: `mutate.md`'s `moveTask` still names only `column`/`maturity`/
  `updated_at` while `validate.md:35` rejects a `done` card holding `status: "active"`.
  **Still a real upstream defect** — kept, with its filing destination corrected to the
  plugin repo.
- **Auto-repair watch.** The brief warned that if `mpi-project-refresh` shipped
  `.agents/mpi-kanban.local.md` as auto-repair it could clobber Vision's hand-written
  config. It did not: 1.0.1 reports a missing config as a finding and scaffolds only on
  approval. Vision's config exists, so nothing was proposed against it.
- **§ File claims reworded** from an outage report ("the lock nobody has taken since
  2026-06-16") into history plus what enforces it now.

## Beyond the card

- `.claude/skills/mpi-end/` split — the pack half (scope gate, knowledge-healing,
  `validating` rule) ships in `mpi-end-session` §0/§3/§6; the project half moved to
  `.agents/mpi-kanban/close-out.md`, which `mpi-end-session` §7 runs before the commit.
- `next_id` derivation rule deleted from CLAUDE.md — `createTask` mkdir-locks the id
  (`mutate.md:105-111`). This also closed **MPI-488** with no local change.
- "Kanban writes are pre-authorized" deleted — `guard-card` owns that decision.
- Profile gained `pack_version: 1.0.1` and `push_policy: auto` (user's call, 2026-08-09).
- `.claude/rules/behaviour.md` added from the pack template; three worker archetypes
  created under `.claude/agents/` for the bundles `.agents/mpi-kanban.local.md` declares.
- Orphaned `state/interop.json` retired.

## Verified

- `python "<plugin>/skills/mpi-lib/scripts/validate_board.py" .` → **Board validation
  passed** (0 violations), before and after every board write this session.
- One self-inflicted regression caught by that validator and fixed: the first
  `task.moved` events were written in the legacy `{at, event, …}` shape, which parses as
  JSON and fails on `schema`/`type`/`id`. Rewritten to `mpi-kanban/event/v1`. The trap is
  already documented at `.claude/rules/kanban.md` § Card shape rules #4 — it was read too
  late, not missing.
