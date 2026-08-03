# Git & Commit Hygiene

The working tree is shared by concurrent agents. These rules keep one agent's commit from
swallowing another agent's in-progress work. Push stays a user-authorized live op — never push
unless asked.

## Baseline

- NEVER `git add -A` / `git add .`. Commit by explicit pathspec (`git commit --only <paths>`) — EXCEPT in the co-owned-file case below, where `--only` itself is the trap.
- **`--only` rejects an UNTRACKED path** — `error: pathspec '<file>' did not match any file(s) known to git`, and the whole commit aborts, including the tracked paths. A NEW file must be `git add <exact paths>` first (still never `-A`/`.`), then included in the same `--only` list. Reads like a typo or a wrong working directory; it is neither.
- **A DIRECTORY pathspec hides that same trap SILENTLY** (MPI-425, 2026-08-02). `--only <dir>/` matches the directory's TRACKED files, skips the untracked ones, prints no error and exits 0 — so a card move that creates `checklist.md` / `validation.md` / `files.json` commits *without* them, and the CLAUDE.md rule "a card move must create the files its links declare" is satisfied on disk but not in the commit. The loud form above at least stops you. **Check `git status --short` AFTER every commit, not just before** — leftover `??` lines under a path you just committed are this bug.
- Agents MAY commit without asking.
- The Docs-website push block in CLAUDE.md § Sibling repos always applies.

## Co-owned files — `git commit --only` is NOT safe (MPI-245)

**When a sibling agent has UNSTAGED edits in a file you also touched, `git commit --only <paths>` is NOT safe.** MPI-245 committed another session's in-progress MPI-242 work twice before catching it. Two independent traps: (1) `--only <paths>` commits those paths **as they are in the WORKING TREE**, discarding your hunk-level staging; (2) the `lint-staged` pre-commit hook stashes unstaged changes, runs, and reapplies — that cycle folds the sibling's edits in even when your index was clean.

Safe recipe for a co-owned file:

1. Stage ONLY your hunks, anchored by **content**, never line numbers (they drift under you): `git diff -- <file> > p.patch`, keep the hunks whose *added* lines contain a marker unique to your change, then `git apply --cached --recount <filtered.patch>`.
   - **Match on REMOVED lines too, not just added ones** — a deletion-only hunk (you deleted a function) has no `+` lines and an added-only filter silently drops it, leaving your deletion uncommitted.
   - **`--recount` is not enough on its own; you must also rewrite each kept hunk's `+`side START line** (MPI-380). Dropping a hunk shifts every later hunk's new-file offset, and `--recount` only recomputes the *counts* — the patch then fails with `error: patch does not apply`, which reads like a context clash and is not one. Recompute per kept hunk: `newStart = oldStart + delta`, where `delta` accumulates `newCount - oldCount` over the hunks you KEPT. Then apply with plain `git apply --cached`.
   - **Splitting the patch on `\n@@` EATS the newline before each hunk header** (MPI-351). Re-add it, or the kept hunks concatenate glued (`…last context line@@ -1134,7 …`) and `git apply` fails with the SAME `patch does not apply` as a start-line error — you will go hunting the offsets you already got right. Assert every kept hunk string ends in `\n` before joining.
   - A hunk containing BOTH your marker and theirs cannot be filtered — that is the interleaved case; go straight to the build-the-blob recipe below for that file. Classify every hunk as mine / theirs / mixed and let a mixed hunk fail loudly rather than guessing.
2. Verify: `git diff --cached -- js/ | grep -c '<their marker>'` must be `0`, and each staged blob must parse standalone (`git show ":<file>" > /tmp/x.js && node --check /tmp/x.js`) — a half-applied hunk still lints fine in the working tree.
3. Commit the INDEX: bare `git commit -n`, **no pathspec at all**. `-n` bypasses the lint-staged stash/reapply — run eslint yourself first; you are opting out of the hook, not the check.
   - **Precondition: the index must hold ONLY your files.** Check `git diff --cached --name-status` first — no pathspec means this commits a PEER's staged work too (adds *and* deletes). The co-owned case forces no-pathspec while a peer's staged files forbid it; the two halves of this rule collide head-on. When they do, do NOT improvise a commit: finish every other close-out step and re-check, since a peer mid-commit usually lands inside your session and clears the index by itself. If it still has not cleared, stage into a scratch index instead — `GIT_INDEX_FILE=<tmp> git read-tree HEAD`, then `git apply --cached` + `git commit -n` under the same env var — which leaves the real index untouched. (Collision seen 2026-07-29; the wait resolved it, the scratch-index fallback is reasoned, not yet exercised.)
4. Confirm the sibling's files are still `M` (modified, uncommitted) afterwards.

**When the hunks INTERLEAVE, step 1 has no answer — build the blob instead (MPI-354).** In a
structured file (`board.json`: adjacent `doing`/`done` arrays) your edit and theirs can land in
ONE hunk, so no hunk-level filter separates them. Reconstruct the file you want to commit from
`HEAD` and stage it directly, bypassing the working tree entirely:
`git show HEAD:<file> > tmp` → apply ONLY your changes to `tmp` as **textual** replacements
(never `JSON.parse`/`stringify` — it reformats the whole file: `board.json` is 2-space, but its
LINE ENDINGS vary with who wrote it last — `core.autocrlf=true` gives CRLF to a file git checked
out, while an agent's own rewrite lands LF and stays LF (measured 2026-08-02: LF in both the tree
and the HEAD blob). `task.json` VARIES per card — measure both, and see `kanban.md` § "Detect
INDENT as well as line endings") → assert their markers are absent (`next_id` unbumped, their
ids not in your columns) → `git hash-object -w tmp` → `git update-index --cacheinfo 100644,<sha>,<file>`
→ bare `git commit -n`. `git status` then shows the file as `MM`: your version staged, theirs still
in the tree. Note the node/bash `/tmp` split on Windows — bash writes `/tmp`, node reads `C:\tmp`;
use the session scratchpad for the intermediate file.

**Guard the blob, but scope the guard — `board.json` mentions ids TWICE (MPI-328).** The
"is this id already on the board?" pre-check is where the recipe goes wrong quietly:
`JSON.stringify(board).includes('MPI-<n>')` is TRUE for an id that appears only inside
`board.events[]` (the historical `task.created`/`task.moved`/`task.deleted` records at the
bottom of the file), even when the id is in NO column. It aborts a correct blob and reads
like the card is already there. Test the arrays — `board.columns.done.includes(id)` — or slice
the text at `"updated_at"` and search only the columns region above it. Same shape as the
`.every()` fail-open: a check that passes for the wrong reason. Assert the byte delta too
(`out.length - head.length === inserted.length`), and derive `inserted.length` from the string
rather than counting characters by eye.

**A READ can race a write too.** `grep`, `git diff` and `git status` issued while a sibling session is rewriting a co-owned file return a partial or empty view of it — indistinguishable from a clobber. `git diff` also goes quiet the moment a sibling commits your hunks for you. Before restoring from a backup, re-applying edits, or telling the user work was lost: **re-run the read**, and confirm against `git log`/`git show`. (MPI-360 raised two false alarms this way in one session, one of them a "failing `release:check`" that passed on the next run.)

Already committed their work? Nothing is lost: `git tag backup HEAD` → `git reset --soft HEAD~1` → `git reset HEAD -- <co-owned files>` → re-apply your filtered patch → commit the index → verify `git status --short` shows their files back as `M`.

**THEY can commit YOURS, and it fails differently — do NOT reach for the recipe above.** Everything so far is about you sweeping up a peer's work. The reverse happened 2026-08-03: a peer closing MPI-434 ran a commit whose pathspec included `board.json` + `events.jsonl`, which carried this session's uncommitted reorder and a brand-new `MPI-435`. Nothing was lost or corrupted — the peer's commit was correct for its own files. What broke is subtler: **HEAD now referenced a card id whose `tasks/<id>/task.json` was still untracked**, so a fresh clone would have had a board pointing at a card that does not exist.

- **The fix is to COMMIT, not to revert.** Your task files were always the missing half; land them immediately and the tree is coherent again. A `reset --soft` here would undo a peer's finished, user-validated work to fix a problem that one commit of your own solves.
- **Detect it, do not eyeball it** — every id in every column must have a tracked card:
  `git show HEAD:.agents/mpi-kanban/board.json` → parse the columns → compare against `git ls-files .agents/mpi-kanban/tasks/`. Any id with no tracked `task.json` is this bug.
- **Why the usual precaution does not save you:** the standing advice is to wait for a peer mid-commit to clear the index. That protects THEM from you; it does nothing to stop their pathspec from including a file you are also editing. Assume a co-owned file may be committed out from under you at any moment, and keep your own half of a structured pair (board entry ↔ card file) committable at all times.
