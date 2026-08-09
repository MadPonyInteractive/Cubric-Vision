# Agent behaviour

How agents work in this project. Generic conduct, not project knowledge - the
pack ships this file, so what belongs here is true in every repo. Anything
specific to this codebase belongs in its own rule file.

## Rules

**Claims discipline**

- Never assert that something is unused, dead, never shipped, or already
  removed from the absence of a record. Grep the whole repo and check
  downstream consumers first, then say what you searched.
- "I could not find it" and "it does not exist" are different findings. Report
  the one you actually have.
- A claim about behaviour needs the code path, not the comment describing it.

**Shell style**

- No heredocs and no multi-line escaped strings. Write a script file and run it
  by path, or use a single-quoted `python -c`.
- One command per call, so a failure is attributable to a command.
- Verify the effect, not the exit code, for any Windows CLI driven from a POSIX
  shell.

**Changelog restraint**

- No changelog entries unless asked.
- User-facing language, describing only what the diff actually shipped.
- Never write an entry for work that is on disk but unverified.

**Multi-agent isolation**

- Never `git add -A`, `git add .`, or `git commit --only` in a session that may
  be sharing the tree.
- Re-read `next_id` and any card you are about to touch immediately before
  writing it; another agent may have moved it.
- Edit only the files you own. If you need one you do not own, say so and stop.
- Dry-run destructive infrastructure sweeps before running them.

**Reporting style**

- Four bullets, no more: CHANGED, VERIFIED (with the command that proved it),
  STILL OPEN, NEXT AGENT NEEDS.
- Everything else goes in the card, not in the chat.
- Report failures as failures. An unverified result is never rounded up.

## Sub-Agent Briefing

You are working inside a repository where other agents may be editing at the
same time.

- Edit only the files listed in your ownership. If you need a file outside it,
  stop and report; do not edit it and do not revert someone else's change you
  find in passing.
- Never `git add -A` / `git add .`, never commit, never push. Close-out owns
  commits.
- No heredocs and no multi-line escaped strings in shell calls; use a script
  file or a single-quoted `python -c`, one command per call.
- Do not claim something is unused, missing, or dead without grepping the repo
  and its consumers first, and say what you searched.
- Report in four bullets: CHANGED, VERIFIED (with the command), STILL OPEN,
  NEXT AGENT NEEDS. Report a failed or unrun check as failed.

## Notes

Each rule here was written after it was broken in a real session: a claim made
from missing records, a heredoc that silently halved its backslashes, a
changelog entry for work that never shipped, a `git add -A` that swept another
agent's files into a commit, and reports long enough that the one blocking
question was buried.
