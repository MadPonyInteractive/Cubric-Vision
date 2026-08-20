#!/usr/bin/env python3
"""MPI-508 close-out — Stop-event check that handoffs went through the skill.

A handoff is not just a JSON file. `/mpi-handoff` tops up the plan's running
notes, commits and pushes the session's work, and INDEXES the handoff in
`state/index.json`. Hand-write the file and every one of those is skipped
silently; the next session resumes from a handoff nobody reconciled, off a
branch that never got the commit.

Indexing is the discriminator, and it is a fact on disk: the skill always adds the
handoff to `active_handoffs`, a hand-written one is missing from it. That makes
this a Stop check rather than a PreToolUse block — the skill writes handoffs with
the same Write tool a human does, so blocking the write blocks the right path too.

Advisory, never blocks. Also catches the reverse drift (an index entry pointing at
a closed or deleted handoff), and the third case (MPI-577): both sides list the
handoff but disagree about its STATUS — the index entry says `resolved` while the
record still says `open`, or vice versa. All three leave `mpi-continue` reading
the wrong resume state, and the third is invisible to the other two checks.

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


def _indexed_status(entry):
    """The status the INDEX claims for an entry. None for a legacy bare path."""
    return entry.get("status") if isinstance(entry, dict) else None


def read_state():
    """Impure probe -> ({id: index_status}, {id: file_status}). Either may be None."""
    try:
        with open(STATE + "/index.json", encoding="utf-8-sig") as fh:
            indexed = {_stem(e): _indexed_status(e)
                       for e in json.load(fh).get("active_handoffs", [])}
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
    """Pure core (testable): -> (unindexed, stale, desynced).

    `desynced` holds (id, index_status, file_status) for handoffs BOTH sides
    list and disagree about. It wins over `stale` for the same id — it says
    everything `stale` would and names which side claims what.
    """
    if indexed is None:
        return [], [], []
    unindexed = sorted(h for h, s in states.items()
                       if s in ACTIVE_STATUSES and h not in indexed)
    desynced = sorted((h, si, states[h]) for h, si in indexed.items()
                      if si is not None and h in states and si != states[h])
    seen = {h for h, _, _ in desynced}
    stale = sorted(h for h in indexed
                   if h not in seen
                   and states.get(h, "missing") not in ACTIVE_STATUSES)
    return unindexed, stale, desynced


SHOW = 3  # a Stop hook nobody reads is worse than no hook


def _listing(labels, suffix):
    """`labels` are display-ready; `suffix` is appended to each."""
    out = ["  • %s%s" % (t, suffix) for t in labels[:SHOW]]
    if len(labels) > SHOW:
        out.append("  • …and %d more" % (len(labels) - SHOW))
    return out


def build_message(unindexed, stale, desynced):
    """-> warning string, or None when the index and the files agree."""
    if not unindexed and not stale and not desynced:
        return None
    lines = ["⚠️  Handoff/index drift — `state/index.json` and `state/handoffs/` disagree:"]
    lines += _listing([h[:8] for h in unindexed], " is open but NOT in active_handoffs")
    if unindexed:
        lines.append("    A hand-written handoff skips the running-notes top-up, the commit,")
        lines.append("    the push, and the index entry.")
        lines.append("    Run /mpi-handoff — it writes AND indexes the handoff.")
    lines += _listing([h[:8] for h in stale],
                      " is indexed active but its file is closed/superseded/missing")
    lines += _listing(["%s: index says %s, file says %s" % (h[:8], si, sf)
                       for h, si, sf in desynced], "")
    if desynced:
        lines.append("    Neither side is authoritative — repair toward whichever holds the")
        lines.append("    evidence: the index entry's note, or the record's own closure note.")
    if len(unindexed) + len(stale) + len(desynced) > SHOW:
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
    assert build_message(*analyze({"a": "open"}, {"a": "open"})) is None
    # the failure this exists for: written by hand, never indexed
    m = build_message(*analyze({}, {"abcdef1234": "open"}))
    assert m and "abcdef12" in m and "/mpi-handoff" in m
    # accepted counts as active on both sides
    assert build_message(*analyze({"a": "accepted"}, {"a": "accepted"})) is None
    # closed file still indexed, index agrees it is closed -> stale, no skill advice
    m = build_message(*analyze({"a": "closed"}, {"a": "closed"}))
    assert m and "closed/superseded/missing" in m and "/mpi-handoff" not in m
    # indexed but file deleted -> stale (a missing file is never a status desync)
    m = build_message(*analyze({"a": "open"}, {}))
    assert m and "closed/superseded/missing" in m and "index says" not in m
    # closed and unindexed -> the correct resting state, silent
    assert build_message(*analyze({}, {"a": "closed"})) is None
    # no kanban state at all -> silent
    assert build_message(*analyze(None, None)) is None
    # MPI-577, the ten: index recorded it superseded, the file still says open
    m = build_message(*analyze({"aaaaaaaa11": "resolved"}, {"aaaaaaaa11": "open"}))
    assert m and "aaaaaaaa: index says resolved, file says open" in m
    assert "Neither side is authoritative" in m
    # MPI-577, the mirror (44bcd4be): index still open, the file carries closure
    m = build_message(*analyze({"bbbbbbbb22": "open"}, {"bbbbbbbb22": "resolved"}))
    assert m and "bbbbbbbb: index says open, file says resolved" in m
    # a desync is reported ONCE — as a desync, not also as a stale entry
    assert m.count("  • ") == 1
    # a legacy bare-path entry states no status -> nothing to compare, no false alarm
    assert build_message(*analyze({"a": None}, {"a": "open"})) is None
    # legacy bare-path entry resolves to the same id as a record
    assert _stem(".agents/mpi-kanban/state/handoffs/dead-beef.json") == "dead-beef"
    assert _stem({"id": "dead-beef"}) == "dead-beef"
    assert _stem({"path": "x/y/dead-beef.json"}) == "dead-beef"
    assert _indexed_status({"status": "resolved"}) == "resolved"
    assert _indexed_status("s/h/a.json") is None
    assert build_message(*analyze({_stem("s/h/a.json"): "open"}, {"a": "open"})) is None
    # an unreadable handoff is not "open" -> no false alarm
    assert build_message(*analyze({}, {"a": "unreadable"})) is None
    # a backlog is capped and routed to cleanup, not dumped line by line
    many = {"h%02d" % i: "open" for i in range(10)}
    m = build_message(*analyze({}, many))
    assert m.count("  • ") == SHOW + 1 and "and 7 more" in m and "/mpi-cleanup" in m
    # exactly SHOW items: no "and N more", no cleanup nag
    m = build_message(*analyze({}, {"a": "open", "b": "open", "c": "open"}))
    assert "more" not in m and "/mpi-cleanup" not in m
    _selftest_read_state()
    print("selftest OK")


def _selftest_read_state():
    """The desync must survive read_state() — that is where the status was lost."""
    import shutil
    import tempfile
    global STATE
    real, STATE = STATE, tempfile.mkdtemp()
    try:
        os.mkdir(STATE + "/handoffs")
        entry = {"id": "aaaaaaaa-1111", "path": "x/aaaaaaaa-1111.json",
                 "status": "resolved", "note": "Superseded by bbbb"}
        with open(STATE + "/index.json", "w", encoding="utf-8") as fh:
            json.dump({"active_handoffs": [entry]}, fh)
        with open(STATE + "/handoffs/aaaaaaaa-1111.json", "w", encoding="utf-8") as fh:
            json.dump({"status": "open"}, fh)
        indexed, states = read_state()
        assert indexed == {"aaaaaaaa-1111": "resolved"}, indexed
        assert states == {"aaaaaaaa-1111": "open"}, states
        m = build_message(*analyze(indexed, states))
        assert m and "index says resolved, file says open" in m, m
    finally:
        shutil.rmtree(STATE, ignore_errors=True)
        STATE = real


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
