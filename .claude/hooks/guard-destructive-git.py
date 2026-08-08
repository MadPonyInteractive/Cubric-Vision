#!/usr/bin/env python3
"""PreToolUse guard: block git commands that discard a peer agent's uncommitted work.

This tree is shared with live peer agents. `git checkout -- <pathspec>`,
`git restore`, `git stash`, `git reset --hard` and `git clean -f` all restore
from HEAD/index and take EVERY uncommitted byte in the pathspec with them --
yours and every peer's -- silently, exit 0, with a clean `git status`
afterwards. Reported 2026-08-08: one broad pathspec took a peer's todo->doing
board move, their line in .agents/mpi-kanban/events.jsonl, and their code and
doc edits together.

`.claude/rules/git.md` has banned this since 2026-08-03 and it fired again, so
this is the enforcing half of the rule rather than another sentence of it.

Exit 2 blocks the call and returns the stderr text to the agent.

Run self-check:  python guard-destructive-git.py --selftest
"""
import json
import re
import sys

# `git` must sit at a command position (start, or after ; && || | & newline or
# `$(`), so a `grep "git checkout --"` or a doc edit quoting the command is not
# blocked. Then the destructive subcommand, with its safe forms carved out.
_CMD_POS = r"(?:^|[;&|\n]|\$\()\s*(?:sudo\s+)?git\s+(?:-C\s+\S+\s+|--git-dir[= ]\S+\s+|--work-tree[= ]\S+\s+)*"

RULES = [
    # `git checkout -- <path>` / `git checkout .` / `git checkout HEAD -- <path>`
    (re.compile(_CMD_POS + r"checkout\s+(?:[^\s]+\s+)?--(?:\s|$)", re.I), "git checkout -- <pathspec>"),
    (re.compile(_CMD_POS + r"checkout\s+\.(?:\s|$)", re.I), "git checkout ."),
    # `git restore` -- every form discards; `--staged` alone only unstages, allow it
    (re.compile(_CMD_POS + r"restore\s+(?!--staged\b|--stage\b)", re.I), "git restore"),
    # `git stash` -- allow the read-only forms
    (re.compile(_CMD_POS + r"stash(?:\s+(?!create\b|list\b|show\b)|\s*$)", re.I), "git stash"),
    (re.compile(_CMD_POS + r"reset\s+(?:[^\n]*\s)?--hard\b", re.I), "git reset --hard"),
    (re.compile(_CMD_POS + r"clean\s+(?:[^\n]*\s)?-\S*[fdx]", re.I), "git clean -f/-d/-x"),
]

BLOCK_MSG = """BLOCKED: `{found}` discards uncommitted work across the whole pathspec.

This repo is a SHARED tree with live peer agents. That command restores from
HEAD and takes every uncommitted byte in the pathspec -- yours AND every peer's
-- with exit 0 and a clean `git status` afterwards, which reads as success.

Do this instead:
  * undo a probe  -> re-apply its inverse edit with the same tool that made it
  * baseline      -> git show HEAD:<path> > /tmp/base   (never `git stash`)
  * mutation test -> cp <file> <backup> BEFORE, cp back AFTER
  * unstage only  -> git restore --staged <path>   (allowed, does not touch the tree)
  * read-only     -> git stash create / list / show   (allowed)

After ANY revert, grep for a distinctive token of YOUR OWN work -- a clean
`git status` cannot tell a wipe from a success.

Full rule: .claude/rules/git.md (MPI-365) + .claude/rules/kanban.md (File claims).
If you genuinely need this, ask the user to run it."""


def check(command):
    """Return the matched destructive form, or None."""
    for pattern, label in RULES:
        if pattern.search(command or ""):
            return label
    return None


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # unreadable payload is not a reason to block a session
    if payload.get("tool_name") != "Bash":
        sys.exit(0)
    found = check(payload.get("tool_input", {}).get("command", ""))
    if found:
        print(BLOCK_MSG.format(found=found), file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


def _selftest():
    blocked = [
        "git checkout -- js/state.js",
        "git checkout -- .",
        "git checkout HEAD -- docs/",
        "git checkout .",
        "cd js && git checkout -- .",
        "npm test && git restore js/state.js",
        "git restore --worktree js/state.js",
        "git stash",
        "git stash push -- js/state.js",
        "git stash && npm run lint && git stash pop",
        "git reset --hard HEAD",
        "git reset --hard",
        "git clean -fd",
        "git clean -xdf",
        "git -C c:/AI/Mpi/Cubric-Studio checkout -- src/",
        "sudo git reset --hard",
    ]
    allowed = [
        "git status",
        "git checkout -b feature/x",
        "git checkout master",
        "git commit -n -F msg.txt",
        "git show HEAD:js/state.js > /tmp/base.js",
        "git stash create",
        "git stash list",
        "git restore --staged js/state.js",
        "git diff --stat",
        "git reset HEAD js/state.js",
        "git clean -n",                                  # dry run
        'grep -rn "git checkout --" .claude/rules/',     # quoting the command
        'echo "never run git stash here"',
        "git add CLAUDE.md",
    ]
    for c in blocked:
        assert check(c), f"should block: {c}"
    for c in allowed:
        assert not check(c), f"should allow: {c} (matched {check(c)})"
    print(f"selftest OK - {len(blocked)} blocked, {len(allowed)} allowed")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
