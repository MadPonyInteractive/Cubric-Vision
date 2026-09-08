# MPI-685 checklist

- [x] `runPipCommand` spawns pip with `PIP_CACHE_DIR` inside the engine root
- [x] a failed curated-deps pass writes a reason marker; a successful pass clears it
- [x] `/comfy/status` reports `depsWarning` from that marker when memory has nothing
- [x] unit test: marker written on failure, cleared on success, read back as the reason
- [x] `npm test` green — 882/882
- [x] eslint clean on the touched files
- [x] `PIP_CACHE_DIR` proven to move the cache off `%LOCALAPPDATA%\pip\cache`
- [ ] version stamped 1.4.4 (`/mpi-version-bump`) — user's call, not yet run
- [ ] reporter confirms on issue #2

## Evidence

`PIP_CACHE_DIR` is the right knob, measured 2026-09-03:

```
$ PIP_CACHE_DIR=<scratch>/pipcache python -m pip cache dir
<scratch>\pipcache
$ python -m pip cache dir
c:\users\fabio\appdata\local\pip\cache      <- the directory that broke the reporter's install
```

`node tests/curated-deps-failure-marker.test.cjs` → `5/5 OK`. `npm test` → 882 pass, 0 fail.
