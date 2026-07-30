#!/usr/bin/env python3
"""Emit lowercase UUIDv4 values, one per line.

    python scripts/new_uuid.py      -> 1 uuid
    python scripts/new_uuid.py 5    -> 5 uuids

Why this lives here: the mpi-kanban skill pack DOCUMENTS this helper
(`mpi-lib/docs/coordination/uuid-helper.md`, `mpi-handoff` step 5,
`coordination-ops/lifecycle.md`, `coordination-ops/messages.md`) but ships no copy of
it, and `mpi-init` does not provision it either — so each repo using the pack needs
its own. Coordination record ids (handoffs, sessions, messages) come from here rather
than from timestamps or slugs, and the same value is used for the record `id` and its
filename.
"""
import sys
import uuid

count = int(sys.argv[1]) if len(sys.argv) > 1 else 1
for _ in range(count):
    print(uuid.uuid4())
