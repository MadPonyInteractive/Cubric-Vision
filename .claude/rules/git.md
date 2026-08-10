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

## Never `git checkout --` to undo a probe (MPI-365)

Proving a new test bites means breaking the source, running the test, reverting the break.
**Do not revert with `git checkout -- <file>`.** On an UNSTAGED file that restores from the
index, which equals HEAD — so it discards every edit you made this session, not just the
probe. 2026-08-03: a one-word negative control on `CONTROL_TYPES` was reverted that way and
took ~250 lines of `commandRegistry.js` with it (the whole `control` op, `CONTROL_TYPES`, a
`DEFAULT_STYLE_OPS` deletion). Recovered only because the exact strings were still in
context.

It reads as safe because in a clean tree that *is* what it does. In a mid-session tree it is
`--hard`-for-one-file, with no prompt, no output, and a suite that goes green again
afterwards — which looks like a successful revert rather than a wipe.

- **Undo a probe by re-applying its inverse edit**, with the same tool that made it. The
  probe was one string; so is the undo.
- Want a real net? **`cp <file> /tmp/f.bak` before the probe, `cp` it back after** — or commit before probing. **NOT `git stash`**: on a tree you do not solely own it sweeps up every uncommitted file in the repo, including a peer agent's and the user's in-flight work, and returns it only if the pop succeeds. 2026-08-07 this ran here while a peer was mid-commit on two docs files and survived on luck. For a read-only baseline use `git show HEAD:<path> > /tmp/base` or `git stash create` (writes a commit object, leaves the tree alone).
- After ANY revert of a file you have been editing, `grep` for one distinctive token of your
  own work before moving on. A silent wipe is otherwise indistinguishable from success.
- Blast radius is per-file — a probe in a file you have not touched this session is
  genuinely harmless. Establish which case you are in first.
- **Blast radius is the PATHSPEC, and with peer agents live it is not only your work.** A broad
  pathspec reported 2026-08-08 took a peer's `todo -> doing` board move, their line in
  `.agents/mpi-kanban/events.jsonl`, and their code and doc edits in one command; `board.json` came
  back byte-identical to HEAD. The same ban covers `git restore`, `git reset --hard` and `git clean`.
  **Never revert, clean up, or 'fix' a diff you did not make** — an unfamiliar change in a shared
  tree is a peer's in-flight work, not drift. Ownership rules: `.claude/rules/kanban.md` § File claims.

## Backticks in `-m` are command substitution, and the commit still succeeds

`git commit -m "... \`someIdentifier\` ..."` **runs** `someIdentifier`. Bash eats the word,
prints `someIdentifier: command not found` to stderr, and the commit lands anyway with a hole
in its message ("So ModelDef gains , a generic per-model map"). POSIX double quotes do not
protect backticks — only single quotes and *quoted* heredocs do. Naming identifiers in
backticks is the house commit style here, so this fires on well-written messages.

Nothing fails: the pre-commit hook prints a wall of lint-staged output, the one
`command not found` line scrolls past inside it, and `[master abc1234]` reads as clean
success. Hit 2026-08-02 on `30a1348c`.

- Any message containing backticks → quoted heredoc (`-F - <<'MSG'`, quotes mandatory) or
  write the message to a file and `git commit -F <file>`.
- Never fix it with `--amend -m` — that re-runs the same substitution. Amend with `-F`.
- Verify: `git log -1 --format=%B | grep <the-identifier>`. A silent pass is not proof.

## A `git mv`-then-edit file is `RM`, and a `'^ M'` filter silently drops the edit

`git mv` STAGES the rename with the file's ORIGINAL content. Editing the file afterwards
leaves it `RM` in `git status --porcelain` — **`R` in the index, `M` in the worktree** — so
the common "collect my modified files" idiom misses it entirely:

```bash
git status --porcelain | grep '^ M' | cut -c4-     # ← never matches RM
```

Bit the Flows rename, 2026-08-06: 32 files were `git mv`'d and then swept, the filter above
built the pathspec, and the commit captured **every rename with its pre-edit content**.
`js/data/flowsRegistry.js` landed still saying `export const APPS`.

**Why nothing caught it.** The commit succeeded; its output listed all 32 renames at
`(100%)` similarity, which reads like success and is actually the tell — 100% means the
content did not change. Tests were green because `npm test` runs the WORKING TREE, which
was correct; only the commit was wrong. `git status` afterwards showed the files as ` M`,
which looks like ordinary leftover work rather than a broken commit.

- **Match both states:** `grep -E '^(.M| M)'`, then `sed 's/.* -> //'` to take the
  destination path of a rename line.
- **Verify the COMMIT, not the tree** — for any file you renamed and edited in one go,
  `git show HEAD:<new-path> | grep <a token that must exist after the edit>`. A rename shown
  at `(100%)` when you know you edited the file is the signal.
- Fix is an amend (`git add` the missed paths → `git commit --amend -F <msgfile>`), not a
  new commit, while the bad commit is still local. Use `-F`/`--no-edit`, never `--amend -m`.

## Co-owned files — `git commit --only` is NOT safe (MPI-245)

**When a sibling agent has UNSTAGED edits in a file you also touched, `git commit --only <paths>` is NOT safe.** MPI-245 committed another session's in-progress MPI-242 work twice before catching it. Two independent traps: (1) `--only <paths>` commits those paths **as they are in the WORKING TREE**, discarding your hunk-level staging; (2) the `lint-staged` pre-commit hook stashes unstaged changes, runs, and reapplies — that cycle folds the sibling's edits in even when your index was clean.

Safe recipe for a co-owned file:

1. Stage ONLY your hunks, anchored by **content**, never line numbers (they drift under you): `git diff -- <file> > p.patch`, keep the hunks whose *added* lines contain a marker unique to your change, then `git apply --cached --recount <filtered.patch>`.
   - **Match on REMOVED lines too, not just added ones** — a deletion-only hunk (you deleted a function) has no `+` lines and an added-only filter silently drops it, leaving your deletion uncommitted.
   - **`--recount` is not enough on its own; you must also rewrite each kept hunk's `+`side START line** (MPI-380). Dropping a hunk shifts every later hunk's new-file offset, and `--recount` only recomputes the *counts* — the patch then fails with `error: patch does not apply`, which reads like a context clash and is not one. Recompute per kept hunk: `newStart = oldStart + delta`, where `delta` accumulates `newCount - oldCount` over the hunks you KEPT. Then apply with plain `git apply --cached`.
   - **Splitting the patch on `\n@@` EATS the newline before each hunk header** (MPI-351). Re-add it, or the kept hunks concatenate glued (`…last context line@@ -1134,7 …`) and `git apply` fails with the SAME `patch does not apply` as a start-line error — you will go hunting the offsets you already got right. Assert every kept hunk string ends in `\n` before joining.
   - **Capturing `git diff` in Python with `subprocess.run(..., text=True)` decodes it with the LOCALE codec (cp1252 here), not UTF-8** (MPI-433, 2026-08-10). Every non-ASCII context line — an em-dash in prose, a curly quote — comes back as mojibake; write it out as UTF-8 and `git apply` dies with the SAME `error: patch does not apply` as the two traps above, so you re-check offsets that were right all along. This bites hardest on docs and changelogs, where prose dashes are everywhere. **The tell is in `git apply -v`**: read its `error: while searching for:` block and compare it to the file — if a dash renders as `â€"`, it is the codec, not the offsets. Use `capture_output=True` with NO `text=`, then `.stdout.decode('utf-8')`, and write the patch with `newline='\n'`.
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

**THEIR COMMIT CAN ROLL BACK YOUR UNCOMMITTED WRITES — the third direction, and the quietest.**
The two cases above are about whose work lands in whose commit. This one loses work outright and
touches a file the peer never named. `.husky/pre-commit` runs `lint-staged`, which **stashes the
whole working tree** ("Backing up original state in git stash"), runs its tasks, then restores.
Any write you make *inside that window* is reverted to the file's content at their stash moment.
You are not a party to their commit; you just happen to be writing while it runs.

- **It presents as a partial revert, which is why it reads as your own bug.** 2026-08-08 (MPI-482):
  three sequential patches went into `scripts/computeDepHashes.py`; patch 1 survived and patches 2
  and 3 vanished. Each patch had asserted its predecessor's text was present, and `git diff --stat`
  had confirmed 218 insertions on disk — so the file could not have been "never written". A
  `git checkout --`-style clobber would have taken patch 1 too; only a stash/restore reverts to a
  mid-session state.
- **The tell is a later step behaving as though an earlier edit never happened** — here, a new
  `--sizes` flag falling through to the old code path. Do not debug that as a logic error:
  `grep -c '^def <your-new-function>' <file>` first, and if it is 0, this is what happened.
- **The only real defence is to commit early.** A shared tree gives you no lock, and the window is
  someone else's commit, which you cannot see coming. Land each working increment rather than
  batching a session's edits — re-applying three patches costs a minute, re-deriving them does not.
- Related but NOT the same: the read-race at "A READ can race a write too" above returns a
  misleading *view* of a file that is intact. This one changes the bytes.
- **FIXED HERE the same day (`d661032f`, MPI-442/490): `.husky/pre-commit` now runs
  `npx lint-staged --no-stash`,** so a peer's commit no longer touches your working tree. Keep
  this entry: the stash is lint-staged's DEFAULT, so any repo that has not opted out still has
  it, and `--no-stash` buys the safety with its own trade — the hook now prints "Skipping backup
  ... This might result in data loss", meaning a task that fails mid-run has no backup to restore
  from. Commit-early remains the advice for both halves.
