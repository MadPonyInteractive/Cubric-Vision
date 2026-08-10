#!/usr/bin/env python3
"""MPI-508 close-out — Stop-event check that handoffs went through the skill.

A handoff is not just a JSON file. `/mpi-end-session` writes one as the LAST step
of a close-out that also syncs rules/docs, heals knowledge, runs the project's
close-out.md, resolves `validating` cards, commits and pushes — and then INDEXES
it in `state/index.json`. Hand-write the file and every one of those is skipped
silently; the next session resumes from a handoff nobody reconciled.

Indexing is the discriminator, and it is a fact on disk: the skill always adds the
handoff to `active_handoffs`, a hand-written one is missing from it. That makes
this a Stop check rather than a PreToolUse block — the skill writes handoffs with
the same Write tool a human does, so blocking the write blocks the right path too.

Advisory, never blocks. Also catches the reverse drift (an index entry pointing at
a closed or deleted handoff), since both leave `mpi-continue` reading the wrong
resume state.

Run self-check:  python handoff-index-drift.py --selftest
"""
import json
import os
import sys

REPO = "c:/AI/Mpi/Cubric-Vision"
STATE = REPO + "/.agents/mpi-kanban/state"
# index.json lists only these; anything else must not appear in active_handoffs.
ACTIVE_STATUSES = ("open", "accepted")


def _stem(entry):
    """An active_handoffs entry is a record OR a bare path string (legacy). -> id."""
    value = entry.get("id") or entry.get("path", "") if isinstance(entry, dict) else entry
    return os.path.splitext(os.path.basename(str(value)))[0]


def read_state():
    """Impure probe -> (indexed_ids, {handoff_id: status}). Either may be None."""
    try:
        with open(STATE + "/index.json", encoding="utf-8-sig") as fh:
            indexed = {_stem(e) for e in json.load(fh).get("active_handoffs", [])}
    except Exception:
        return None, None  # no kanban state here — silent
    states = {}
    try:
        for name in os.listdir(STATE + "/handoffs"):
            if not name.endswith(".json"):
                continue
            try:
                with open(STATE + "/handoffs/" + name, encoding="utf-8-sig") as fh:
                    states[name[:-5]] = json.load(fh).get("status", "open")
            except Exception:
                states[name[:-5]] = "unreadable"
    except FileNotFoundError:
        pass
    return indexed, states


def analyze(indexed, states):
    """Pure core (testable): -> (unindexed, stale) id lists."""
    if indexed is None:
        return [], []
    unindexed = sorted(h for h, s in states.items()
                       if s in ACTIVE_STATUSES and h not in indexed)
    stale = sorted(h for h in indexed
                   if states.get(h, "missing") not in ACTIVE_STATUSES)
    return unindexed, stale


SHOW = 3  # a Stop hook nobody reads is worse than no hook


def _listing(ids, suffix):
    out = ["  • %s %s" % (h[:8], suffix) for h in ids[:SHOW]]
    if len(ids) > SHOW:
        out.append("  • …and %d more" % (len(ids) - SHOW))
    return out


def build_message(unindexed, stale):
    """-> warning string, or None when the index and the files agree."""
    if not unindexed and not stale:
        return None
    lines = ["⚠️  Handoff/index drift — `state/index.json` and `state/handoffs/` disagree:"]
    lines += _listing(unindexed, "is open but NOT in active_handoffs")
    if unindexed:
        lines.append("    A hand-written handoff skips the whole close-out (rules/docs sync,")
        lines.append("    knowledge heal, close-out.md, the validating sweep, commit, push).")
        lines.append("    Run /mpi-end-session — it writes AND indexes the handoff.")
    lines += _listing(stale, "is indexed active but its file is closed/superseded/missing")
    if len(unindexed) + len(stale) > SHOW:
        lines.append("    That many at once is a backlog, not this session — run /mpi-cleanup.")
    return "\n".join(lines)


def main():
    try:
        json.load(sys.stdin)  # Stop event payload; we don't need its fields
    except Exception:
        pass
    msg = build_message(*analyze(*read_state()))
    if msg:
        print(msg, file=sys.stderr)  # surfaced to the user, non-blocking
    sys.exit(0)  # NEVER block


def _selftest():
    # agreement -> silent
    assert build_message(*analyze({"a"}, {"a": "open"})) is None
    # the failure this exists for: written by hand, never indexed
    m = build_message(*analyze(set(), {"abcdef1234": "open"}))
    assert m and "abcdef12" in m and "/mpi-end-session" in m
    # accepted counts as active on both sides
    assert build_message(*analyze({"a"}, {"a": "accepted"})) is None
    # closed file still indexed -> stale, and no "run the skill" advice
    m = build_message(*analyze({"a"}, {"a": "closed"}))
    assert m and "closed/superseded/missing" in m and "/mpi-end-session" not in m
    # indexed but file deleted -> stale
    assert "stale" not in (build_message(*analyze({"a"}, {})) or "") or True
    assert build_message(*analyze({"a"}, {})) is not None
    # closed and unindexed -> the correct resting state, silent
    assert build_message(*analyze(set(), {"a": "closed"})) is None
    # no kanban state at all -> silent
    assert build_message(*analyze(None, None)) is None
    # legacy bare-path entry resolves to the same id as a record
    assert _stem(".agents/mpi-kanban/state/handoffs/dead-beef.json") == "dead-beef"
    assert _stem({"id": "dead-beef"}) == "dead-beef"
    assert _stem({"path": "x/y/dead-beef.json"}) == "dead-beef"
    assert build_message(*analyze({_stem("s/h/a.json")}, {"a": "open"})) is None
    # an unreadable handoff is not "open" -> no false alarm
    assert build_message(*analyze(set(), {"a": "unreadable"})) is None
    # a backlog is capped and routed to cleanup, not dumped line by line
    many = {"h%02d" % i: "open" for i in range(10)}
    m = build_message(*analyze(set(), many))
    assert m.count("  • ") == SHOW + 1 and "and 7 more" in m and "/mpi-cleanup" in m
    # exactly SHOW items: no "and N more", no cleanup nag
    m = build_message(*analyze(set(), {"a": "open", "b": "open", "c": "open"}))
    assert "more" not in m and "/mpi-cleanup" not in m
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
