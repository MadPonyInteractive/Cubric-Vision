#!/usr/bin/env python3
"""Find todo cards a commit already finished under a different card id.

    python scripts/overtaken-cards.py            -> report, exit 0
    python scripts/overtaken-cards.py --selftest -> assert the matcher, exit 0

Why this exists: `validating is not a parking space` catches a card YOU worked and
did not close. It cannot catch the other shape — a card sitting untouched in `todo`
whose work lands inside someone else's commit. Nobody is holding it, so nobody is
asked. Measured 2026-08-09: MPI-456 (WAN `_stage2` twins, deleted by MPI-452's
`ea9164c7`) and MPI-488 (`next_id` race, fixed upstream in the Mpi-Kanban plugin)
were both sitting in `todo` with the work already done.

The signal is cheap: a card whose id appears in a commit dated AFTER the card's own
`updated_at`. That is not proof — a commit may merely mention a card — so this
reports candidates for a human to judge, and never writes.

The matcher needs a word boundary. `MPI-450` contains `MPI-4`, so a plain substring
search reports MPI-4 as overtaken by every MPI-45x commit. That bug is what
`--selftest` guards.
"""
import json
import os
import re
import subprocess
import sys

BOARD = ".agents/mpi-kanban/board.json"
TASKS = ".agents/mpi-kanban/tasks"
SINCE = "6 months ago"


def mentions(card_id, text):
    """True when text names this exact card, not one whose id merely starts with it."""
    return re.search(re.escape(card_id) + r"(?![0-9])", text) is not None


def selftest():
    assert mentions("MPI-4", "fix(MPI-4): LTX")
    assert mentions("MPI-4", "chore(board): close MPI-4 and MPI-9")
    assert not mentions("MPI-4", "chore(MPI-450): audit every gate")
    assert not mentions("MPI-45", "feat(MPI-456): collapse the twins")
    assert mentions("MPI-456", "feat(MPI-456): collapse the twins")
    print("selftest ok")


def main():
    if "--selftest" in sys.argv:
        return selftest()

    board = json.load(open(BOARD, encoding="utf-8"))
    log = subprocess.run(
        ["git", "log", f"--since={SINCE}", "--pretty=%h|%ad|%s", "--date=short"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stdout.splitlines()

    hits = 0
    for cid in board["columns"]["todo"]:
        path = os.path.join(TASKS, cid, "task.json")
        if not os.path.exists(path):
            continue
        card = json.load(open(path, encoding="utf-8"))
        updated = card.get("updated_at", "")[:10]
        later = [l for l in log if mentions(cid, l) and l.split("|")[1] > updated]
        if not later:
            continue
        hits += 1
        print(f"\n{cid}  ({card.get('maturity')}, last touched {updated})")
        print(f"  {card.get('title', '')[:90]}")
        for line in later[:3]:
            print(f"    {line[:130]}")

    print(f"\n{hits} candidate(s). A mention is not proof — read the commit before "
          f"closing anything.")


if __name__ == "__main__":
    main()
