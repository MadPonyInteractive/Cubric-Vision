# MPI-636 — validation

Knowledge heal raised during MPI-634 / MPI-635 close-out. Two doc lines that
contradicted the code; both approved by Fabio before editing.

## 1. `docs/playbooks/add-flow/01-descriptor-and-ops.md:86`

Read `mediaType, // 'image' | 'video' — the OUTPUT type (always required)`.

Wrong on both halves:

- `'audio'` has been legal since MPI-573, and three audio flows ship today
  (`flowsRegistry.js` — Text to Speech among them). The FlowDef JSDoc in
  `js/data/flowsRegistry.js` already documents `'image'|'video'|'audio'`; only
  the playbook a new-Flow author actually follows still said otherwise.
- Since MPI-634 the value also decides which Flow Library section the flow
  lands under, which nothing documented.

Fixed to name all three values and the second consequence.

## 2. `docs/testing-harnesses.md:217`

The single-instance-lock bullet was framed as "**Two agents both running it**
COLLIDE", and sent the reader to `Get-CimInstance … electron.exe .` to find the
live peer.

There need not be one. An ORPHAN Electron from a dead session holds the same
`userData` lock and prints the identical signature — `EPERM` mask-temp prune,
`Splash failed to load: ERR_FAILED (-2)`, exit 0. That is exactly what happened
on 2026-08-28: the peer hunt would have found nothing, and the failure keeps
reading as a broken app.

Added the orphan cause, named the `EPERM` prune as the tell that something still
owns the profile, and promoted `CUBRIC_AGENT_PROFILE=<fresh dir>` from a caveat
to the actual fix for a UI-only check — it beats killing a process you have not
identified. The existing "cheap move is usually not to launch at all" advice is
kept unchanged.

## Evidence

Both edits are one-line/one-clause additions to prose; no code path changed, so
there is nothing to execute. Verified by reading the lines back:

```
mediaType,      // 'image' | 'video' | 'audio' — the OUTPUT type (always required).
                // Also picks the Flow Library section the flow lands under (MPI-634).
```

The claim each heal corrects was verified against the source first — three
`mediaType: 'audio'` flow descriptors in `js/data/flowsRegistry.js`, and this
session's own reproduction of the orphan lock signature.

Neither file is under a live claim (`state/files/*.json` — no `claimed` record
covers either path). The three `files.json` naming
`01-descriptor-and-ops.md` (MPI-504, MPI-567, MPI-599) are all closed cards.

Both files were already over the 200-line doc budget before this change (288 and
353); splitting them is not in scope here.
