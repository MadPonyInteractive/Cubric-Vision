# Git & Commit Hygiene

The working tree is shared by concurrent agents. These rules keep one agent's commit from
swallowing another agent's in-progress work. Push stays a user-authorized live op — never push
unless asked.

## Baseline

- NEVER `git add -A` / `git add .`. Commit by explicit pathspec (`git commit --only <paths>`) — EXCEPT in the co-owned-file case below, where `--only` itself is the trap.
- Agents MAY commit without asking.
- The Docs-website push block in CLAUDE.md § Multi-Root Workspace always applies.

## Co-owned files — `git commit --only` is NOT safe (MPI-245)

**When a sibling agent has UNSTAGED edits in a file you also touched, `git commit --only <paths>` is NOT safe.** MPI-245 committed another session's in-progress MPI-242 work twice before catching it. Two independent traps: (1) `--only <paths>` commits those paths **as they are in the WORKING TREE**, discarding your hunk-level staging; (2) the `lint-staged` pre-commit hook stashes unstaged changes, runs, and reapplies — that cycle folds the sibling's edits in even when your index was clean.

Safe recipe for a co-owned file:

1. Stage ONLY your hunks, anchored by **content**, never line numbers (they drift under you): `git diff -- <file> > p.patch`, keep the hunks whose *added* lines contain a marker unique to your change, then `git apply --cached --recount <filtered.patch>`.
2. Verify: `git diff --cached -- js/ | grep -c '<their marker>'` must be `0`, and each staged blob must parse standalone (`git show ":<file>" > /tmp/x.js && node --check /tmp/x.js`) — a half-applied hunk still lints fine in the working tree.
3. Commit the INDEX: bare `git commit -n`, **no pathspec at all**. `-n` bypasses the lint-staged stash/reapply — run eslint yourself first; you are opting out of the hook, not the check.
4. Confirm the sibling's files are still `M` (modified, uncommitted) afterwards.

Already committed their work? Nothing is lost: `git tag backup HEAD` → `git reset --soft HEAD~1` → `git reset HEAD -- <co-owned files>` → re-apply your filtered patch → commit the index → verify `git status --short` shows their files back as `M`.
