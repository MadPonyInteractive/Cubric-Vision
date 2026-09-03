# MPI-685 validation

Shipped in **v1.4.4**, published 2026-09-03:
https://github.com/MadPonyInteractive/Cubric-Vision/releases/tag/v1.4.4

## The three defects, and what proves each fixed

**1. pip installed from a cache we do not own.** `PIP_CACHE_DIR` now points at
`<engine>/pip-cache`. Proven the env var is the right knob, not assumed:

```
$ PIP_CACHE_DIR=<scratch> python -m pip cache dir
<scratch>\pipcache
$ python -m pip cache dir
c:\users\fabio\appdata\local\pip\cache      <- the directory that broke the reporter
```

**2. A failed install died with the process that saw it.** `.cubric_python_deps_failed`
now records the reason next to the interpreter, cleared on entry to every pass so an
installed engine can never leave a stale warning. `tests/curated-deps-failure-marker.test.cjs`
drives a real failure through `ensureCuratedPythonDeps` — 5/5, and it asserts all three
transitions (absent → written → cleared by a matching success marker).

**3. Engine health rendered for every install.** `.mpi-settings__section[hidden]` added
on the release line. The existing spec asserted `section.hidden === true` — the DOM
property, true throughout the bug — so it stayed green over a section the user could
read. It now asserts computed `display`, **verified failing without the fix**:

```
Expected: "none"
Received: "flex"
1 failed
```

and passing with it back. Ported to master as well (`master` already had the CSS guard
via `0b8fbd33`, but not the assertion).

## Gates

| check | result |
|---|---|
| `npm test` (release line) | 627/627 |
| `npm test` (master) | 882/882 |
| `npm run test:desktop` | 20/20 |
| `npm run release:check` | passed |
| `npm run release:deps` | 229/229 URLs reachable |
| Pod runtime `dev` vs `stable` | manifests identical, no drift |
| `assertApproved('1.4.4')` after commit | hash matches |
| `releases/latest` | `v1.4.4`, `draft: false`, `prerelease: false` |

All 6 artifacts attached; all three CI legs built `8b28b230`, exactly what the tag
points at (no dispatch drift).

## Not closed by this card

The reporter has not confirmed yet. He needs `rmdir /s /q "%LOCALAPPDATA%\pip\cache"`
to clear the damaged cache once — 1.4.4 stops it recurring but does not repair a cache
already broken before the update. Fabio handles the issue reply.

## Where it shipped

Release line (`1.4.2` branch): `99e5f7ce`, `ad277302`, `8b28b230`, `d1a97039`.
Master: `0fc72214`, `1be1a635`, plus the spec port.
