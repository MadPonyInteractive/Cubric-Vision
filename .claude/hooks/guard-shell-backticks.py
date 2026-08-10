#!/usr/bin/env python3
"""PreToolUse block on backticks inside a DOUBLE-QUOTED inline script (`python -c "..."`).

The shell command-substitutes a backtick span before the interpreter ever sees it,
so `int(steps / denoise)` in a docstring arrives as the empty string and the
surrounding text is silently mangled. Exit code is 0, the file is written, and the
damage is invisible until someone reads the file back.

Measured 2026-08-10, twice in one session, both times writing MARKDOWN through
`python -c`:
  * a task-card brief lost `fpc = 37` from a healed open-question line;
  * a memory file lost EVERY code span from four paragraphs, and the shell
    helpfully printed `denoise: command not found` as if that were the failure.
Both survived review only because the text was re-read afterwards.

This is the same failure family the plugin's `guard-shell.py` already blocks for
heredocs -- Git Bash mangling a quoted body -- and it gives the same remedy: write
a .py file and run it by path. That guard has no backtick rule (checked against
mpi-kanban 1.0.1), which is why this one exists at the project level.

What it does NOT block, deliberately:
  * Backticks in a SINGLE-quoted body -- `python -c 'x = "`a`"'` -- the shell
    passes those through literally, which is the documented workaround.
  * Backticks anywhere outside an inline-script flag, e.g. a legacy
    ``VAR=`date` `` . That is real command substitution someone meant to write.
  * Anything with no `-c` / `-e` / `-p` interpreter flag at all.

Blocking is the point, so it exits 2.

Run self-check:  python guard-shell-backticks.py --selftest
"""
import json
import re
import sys

# An interpreter invoked with an INLINE SCRIPT flag. The body that follows is
# source code, so a backtick in it is almost never meant as command substitution.
_INLINE = re.compile(
    r"(?<![\w./-])(python[\d.]*|node|perl|ruby|php)(?:\.exe)?\s+"
    r"(?:-\w+\s+)*"                 # tolerate stacked flags: python -u -c
    r"-(?:c|e|p)(?![\w-])"
)


def double_quoted_backtick(cmd: str) -> bool:
    """True when a backtick falls inside a double-quoted region.

    Tracks quote state with backslash escapes. A backtick inside single quotes is
    literal (safe); inside double quotes the shell substitutes it (the bug).
    """
    in_single = in_double = False
    i = 0
    while i < len(cmd):
        ch = cmd[i]
        if ch == "\\" and in_double:
            i += 2                      # \" and \` are escaped inside double quotes
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "`" and in_double:
            return True
        i += 1
    return False


def verdict(cmd: str) -> bool:
    """True = block."""
    return bool(_INLINE.search(cmd)) and double_quoted_backtick(cmd)


MESSAGE = """BLOCKED: backticks inside a double-quoted inline script.

The shell command-substitutes each `...` span BEFORE python/node sees it, so the
backticks and everything between them vanish from the string you are writing. The
command still exits 0 -- a doc line loses its `code spans`, a regex loses a chunk,
and nothing looks wrong until the file is read back.

Do this instead:
  * write the file with the Write tool and run it by path:
        python C:/.../scratchpad/edit.py
  * or SINGLE-quote the body, which passes backticks through literally:
        python -c 'text = "a `code span` survives here"'

Do not just re-quote the inside -- the substitution happens in the shell, not in
your string.
"""


def _selftest() -> int:
    cases = [
        # (command, should_block)
        ('python -c "t = t.replace(\'a\', \'`fpc = 37`\')"', True),
        ('python3 -c "print(\\"`x`\\")"', True),
        ('node -e "s = \\"`a`\\""', True),
        ('python -u -c "x = \'`a`\'"', True),
        # single-quoted body: the documented workaround, must pass
        ("python -c 'x = \"`a`\"'", False),
        # real command substitution, no inline-script flag: not our business
        ('VAR=`date -u`; echo "$VAR"', False),
        ('echo "plain text, no ticks"', False),
        # inline script with no backticks at all
        ('python -c "import json; print(json.dumps({}))"', False),
        # backtick present but OUTSIDE any quoting
        ("python -c 'ok'; ls `pwd`", False),
    ]
    bad = 0
    for cmd, want in cases:
        got = verdict(cmd)
        if got != want:
            bad += 1
            print("FAIL want=%-5s got=%-5s %s" % (want, got, cmd))
    print("selftest: %d/%d passed" % (len(cases) - bad, len(cases)))
    return 1 if bad else 0


def main() -> int:
    if "--selftest" in sys.argv:
        return _selftest()
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0                        # never break the tool on a malformed payload
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    if verdict(cmd):
        print(MESSAGE, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
