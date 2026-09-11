# MPI-720 — checklist

Derived from `tasks/MPI-720/brief.md`. Not a release: no tag, no GitHub Release, no
`update-manifest.json` publish. One update-only bundle, handed to one person.

- [x] MPI-722 landed — master reads 1.6.0, so the build passes NO `--version` flag
- [x] Baseline located and checked: `release-baselines/win32-x64.json` on branch `1.4.2`
      reads `toVersion: 1.5.0`, win32/x64, 6527 files — and the checked-out copy at the
      `Cubric-Vision-1.4.x` worktree matches the branch byte-for-byte
- [x] `SCHEMA_VERSION` re-checked at build time: 4 on master, 4 on v1.5.0 — his projects are
      not trapped and he can reinstall 1.5.0 to go back
- [x] **Build from a CLEAN tree.** `copyAppTree` copies the WORKING TREE, and this one holds
      ~31 uncommitted files from three live peer sessions (MPI-664, MPI-721, gallery work).
      Build in a detached worktree at master HEAD so the delta carries committed master only
- [x] `node scripts/build-portable.mjs --from-manifest <1.5.0 baseline> --no-source-manifest`
      — `--no-source-manifest` is NOT optional (it would mirror over the tracked
      `resources/cubric/update-manifest.json`, which a peer already has dirty)
- [x] Output lands in `D:\CubricStudio\Vision\Builds` (the script's own Windows default)
- [x] Manifest sanity-check before handover: `fromVersion` 1.5.0, `toVersion` 1.6.0, and
      `delete[]` holds nothing under the PRESERVE prefixes (`engine/`, `models/`,
      `user-data/`, Documents)
- [x] He is on 1.5.0 — confirmed by Fabio 2026-09-11, so a delta is the right bundle
      (a FULL bundle would be the fallback, and over a 20-40 KB/s link it is the thing to avoid)
- [x] Handover note written: `update-from-zip.bat` in his portable folder, the extra custom
      nodes his first boot will install, and the four `app.log` greps to send back
- [x] Nothing published. No tag, no release, no manifest mirrored into the repo
