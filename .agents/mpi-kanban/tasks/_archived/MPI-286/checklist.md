# MPI-286 — Checklist

- [x] Locate Landing project-load path (`projectUI.js` `loadProjectGrid` → `_buildProjectRow`; rows hand-built, not MpiProjectCard)
- [x] `_buildProjectRow` returns `{ row, load }`; thumb deferred behind per-thumb spinner
- [x] `_runThumbQueue(loaders, 3, signal)` — cap-3, newest-first, abort-aware
- [x] Row open-locked (`--loading`) until its thumb resolves; click early-returns while loading
- [x] Drop video hover-play + `preload='metadata'` → static first frame (`preload='auto'` + `loadeddata`)
- [x] CSS: `.mpi-landing__pl-thumb--loading` centers spinner; `.mpi-landing__pl-row--loading { cursor: progress }`
- [x] ESLint clean
- [x] Queue unit test + live browser verification
- [x] User eyeball verified
