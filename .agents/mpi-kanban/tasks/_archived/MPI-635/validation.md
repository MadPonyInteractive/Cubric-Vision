# MPI-635 — validation

## Root cause

The Flow Library head count and the tile chips are one claim about one set —
`flowAvailability` over every flow — but only the chips were wired to the signal
that changes it. `subEl.textContent` was written inside `renderList()` and nowhere
else, while `_patchAllAffected()` (the `state:changed` / `models:checked` fan-out
that re-derives every badge) never touched it. So any install-state change that
did not trigger a full render left the header describing the previous set.

Seen on 2026-08-28 during MPI-634: the head read `11 ready · 1 need models` over a
grid of twelve `Get models` chips.

The fix is not a second computation kept in step — it is one derivation with two
callers. `_renderSub()` is extracted from `renderList()` and called from
`_patchAllAffected()` as well, so the header cannot diverge from the badges: the
same function recomputes both on the same signal.

`js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js` only.

## Blast radius

`_patchAllAffected` is the ONLY badge-re-derivation path — `download:complete` /
`started` / `cancelled` repaint just the open detail panel, and the installed set
they change arrives as `state:changed { key: 's_installedModelIds' }`, which routes
back through `_patchAllAffected`. So both callers of `_renderSub()` cover every way
the count can move. No other consumer reads `#flow-lib-sub`.

## Evidence — live app, 2026-08-28

Own isolated instance (`CUBRIC_AGENT_PROFILE=…/cubric-agent-634 npm run app:isolated`,
port 64707; user's :3000 verified still owned by PID 29360 after teardown), driven
with `playwright-cli`. Profile had 6 models installed.

Header and grid agree at first render:

```
{ sub: "11 ready · 1 need models", ready: 11, need: 1 }
```

…and keep agreeing across install-state changes that do NOT re-render — the exact
case that used to diverge (`state.s_installedModelIds` replaced, no `renderList`):

```
emptied  -> { sub: "3 ready · 9 need models",  ready: 3,  need: 9  }
restored -> { sub: "11 ready · 1 need models", ready: 11, need: 1  }
```

On master the `emptied` row read `11 ready` over 3 ready chips.

The other caller path, `models:checked`, is consistent too — a sliced installed set
then an emitted `models:checked` both land on the same number:

```
afterSlice         -> "3 ready · 9 need models | readyChips=3"
afterModelsChecked -> "3 ready · 9 need models | readyChips=3"
restored           -> "11 ready · 1 need models | readyChips=11"
```

## Checks

- `npm run lint` — clean (`--max-warnings=0`).
- `npm test` — 761 pass, 0 fail.
