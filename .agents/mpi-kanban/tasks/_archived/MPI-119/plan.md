# MPI-119 Plan — applied

Diff-first per brief: read updated skills, dropped nothing (all candidates
survived as gap/partial), applied all.

## Diff result (skills vs candidates)
- 1 v-prefix guard: GAP · 2 pull-verify: GAP · 3 boot-smoke: PARTIAL (had torch import) · 4 done-def: GAP
- A inventory: PARTIAL (bump matrix existed, no rebuild table) · B hook: GAP · C division: GAP

## Applied
1. **A** — `research/trigger-table.md`: merged bump+rebuild inventory + § hook-vs-skill (C).
2. **1-4** — `.claude/commands/build-pod-image.md`: v-prefix strip+reject guard; 5a public pull-verify (`docker manifest inspect`); 5b `/wrapper/stats` boot smoke; codified "done = pulled+booted+verified".
3. **B** — `.claude/hooks/bump-rebuild-reminder.py` (Stop event, advisory, never blocks) + wired `hooks.Stop` in `.claude/settings.json`.
4. **C** — division documented in trigger-table.md: hook reminds → skills execute.

## Verification done
- hook `--selftest` → OK (5 cases: version-suppress, bump-only, node_lock both, unrelated silent, comfy substring)
- hook live Stop payload → exit 0, silent on non-trigger diff
- settings.json → valid JSON
