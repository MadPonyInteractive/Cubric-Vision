#!/usr/bin/env python3
"""Stop-event check that this session's kanban events carry the v1 schema.

`.claude/rules/kanban.md` line 90 already says it in prose: an event line needs
`schema` + `id` + `type` + `at`, and the legacy `{at, event, task, note}` shape
parses as JSON, writes without complaint, and fails the board validator on three
counts. Prose has not been enough — the same shape was written on 2026-08-09, and
twice more on 2026-08-10 by two different sessions. This catches it at Stop
instead of at close-out, where it currently surfaces as a validator failure long
after the writing agent has moved on.

Scoped to lines added since HEAD, which is the whole trick. The logs carry a real
backlog of legacy-keyed lines (measured 2026-08-01), so flagging every bad line
would be permanent noise nobody reads. An uncommitted appended line is this
session's, and it is still cheap to fix.

Advisory, never blocks — the write already happened, and a peer's card may be in
the same file.

Run self-check:  python kanban-event-schema.py --selftest
"""
import json
import os
import subprocess
import sys

REPO = "c:/AI/Mpi/Cubric-Vision"
KANBAN = ".agents/mpi-kanban"
REQUIRED = ("schema", "id", "type", "at")
SCHEMA = "mpi-kanban/event/v1"
SHOW = 4  # a Stop hook nobody reads is worse than no hook


def _event_logs():
    """Every events.jsonl under the kanban root, repo-relative, forward slashes."""
    out = []
    for root, _dirs, files in os.walk(os.path.join(REPO, KANBAN)):
        if "events.jsonl" in files:
            path = os.path.join(root, "events.jsonl")
            out.append(os.path.relpath(path, REPO).replace("\\", "/"))
    return sorted(out)


def _committed_line_count(path):
    """Non-empty line count of <path> at HEAD; 0 when the file is new/untracked."""
    r = subprocess.run(["git", "show", "HEAD:" + path], cwd=REPO,
                       capture_output=True)
    if r.returncode:
        return 0
    return len([l for l in r.stdout.decode("utf-8", "replace").split("\n") if l.strip()])


def read_state():
    """Impure probe -> {path: [lines appended since HEAD]}. Empty when no kanban."""
    if not os.path.isdir(os.path.join(REPO, KANBAN)):
        return {}
    added = {}
    for path in _event_logs():
        try:
            with open(os.path.join(REPO, path), encoding="utf-8-sig") as fh:
                lines = [l for l in fh.read().split("\n") if l.strip()]
        except Exception:
            continue
        tail = lines[_committed_line_count(path):]
        if tail:
            added[path] = tail
    return added


def analyze(added):
    """Pure core (testable) -> [(path, line_no_within_new, [missing keys])]."""
    bad = []
    for path, lines in sorted(added.items()):
        for i, line in enumerate(lines, 1):
            try:
                obj = json.loads(line)
            except ValueError:
                bad.append((path, i, ["unparseable JSON"]))
                continue
            missing = [k for k in REQUIRED if k not in obj]
            if obj.get("schema") not in (None, SCHEMA):
                missing.append("schema=%r" % obj["schema"])
            if missing:
                bad.append((path, i, missing))
    return bad


def build_message(bad):
    """-> warning string, or None when every new event is well formed."""
    if not bad:
        return None
    lines = ["⚠️  Kanban events written this session are missing the v1 schema:"]
    for path, i, missing in bad[:SHOW]:
        lines.append("  • %s (new line %d) — missing %s" % (path, i, ", ".join(missing)))
    if len(bad) > SHOW:
        lines.append("  • …and %d more" % (len(bad) - SHOW))
    lines.append('    Shape: {"schema":"%s","id":"MPI-N","type":"task.moved",' % SCHEMA)
    lines.append('             "at":"<ISO>","actor":"...","summary":"..."}')
    lines.append("    The legacy {at, event, task, note} shape parses fine and fails")
    lines.append("    validate_board.py on schema/type/id. See .claude/rules/kanban.md.")
    return "\n".join(lines)


def main():
    try:
        json.load(sys.stdin)  # Stop payload; no fields needed
    except Exception:
        pass
    msg = build_message(analyze(read_state()))
    if msg:
        print(msg, file=sys.stderr)  # surfaced to the user, non-blocking
    sys.exit(0)  # NEVER block


def _selftest():
    good = json.dumps({"schema": SCHEMA, "id": "MPI-4", "type": "task.moved",
                       "at": "2026-08-10T00:00:00Z", "actor": "claude"})
    legacy = json.dumps({"at": "2026-08-10T00:00:00Z", "event": "validation.updated",
                         "task": "MPI-4", "actor": "claude", "note": "x"})
    # a well-formed new event -> silent
    assert build_message(analyze({"a/events.jsonl": [good]})) is None
    # nothing appended -> silent
    assert build_message(analyze({})) is None
    # the exact shape this exists for, flagged on all three keys
    bad = analyze({"a/events.jsonl": [legacy]})
    assert bad and set(bad[0][2]) == {"schema", "id", "type"}, bad
    m = build_message(bad)
    assert "kanban.md" in m and "new line 1" in m
    # a wrong schema VALUE is as broken as a missing one (MPI-256 dropped `-card`)
    wrong = json.dumps({"schema": "mpi-kanban/event/v2", "id": "MPI-4",
                        "type": "x", "at": "t"})
    assert "schema=" in build_message(analyze({"a/events.jsonl": [wrong]}))
    # unparseable line is reported, not crashed on
    assert build_message(analyze({"a/events.jsonl": ["{not json"]}))
    # line numbers are within the NEW tail, not the whole file
    two = analyze({"a/events.jsonl": [good, legacy]})
    assert len(two) == 1 and two[0][1] == 2
    # output is capped and totalled
    m = build_message(analyze({"a/events.jsonl": [legacy] * 10}))
    assert m.count("  • ") == SHOW + 1 and "and 6 more" in m
    # committed history is out of scope: a file whose tail is empty never appears
    assert build_message(analyze({"a/events.jsonl": []})) is None
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
