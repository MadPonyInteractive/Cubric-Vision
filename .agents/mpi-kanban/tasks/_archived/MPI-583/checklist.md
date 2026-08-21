# MPI-583 — checklist

- [x] Reproduce the cost off-app (100 real `<video>` elements, real mp4)
- [x] Prove `currentTime = 0` fires a seek at position 0 (count `seeking` events)
- [x] Confirm the unguarded sweep shipped in v1.4.2 (`git show v1.4.2:...`)
- [x] Add the already-stopped early-out in `_stopOtherGalleryMedia`
- [x] Prove a genuinely playing card still stops (paused, t 0, re-muted)
- [x] `npm test` + eslint
- [x] Heal `docs/gallery.md` (the scroll-gate section described the old sweep)
- [x] `docs/releases/UNRELEASED.md` fix entry (user-facing, shipped in 1.4.2)
- [x] Fabio confirmed in-app
