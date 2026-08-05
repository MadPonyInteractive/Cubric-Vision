# MPI-450 Checklist — 1.4 release readiness

Reasoning per line is in `brief.md`. A line is ticked only when it is verified, not
when it is believed.

## Gate D — hygiene (do first, costs minutes)

- [x] MPI-440 closed — all members done, MPI-435 last (`e6229bd3`)
- [x] MPI-4 moved out of `doing` (untouched since 2026-06-27, not in 1.4)
- [x] MPI-259 moved out of `doing` (untouched since 2026-07-22, not in 1.4)
- [x] `validate_board.py .` from the repo root → exit 0, not read through a pipe

## Gate A — must fix (code)

- [x] **MPI-420** — shipped the decoders (user's call). **The card's premise was wrong**: a
      missing decoder falls back to Latent2RGB, so previews were the colour blob, not absent.
      Real gaps were FLUX.2 Klein + Wan 2.2 on every platform, and everything on macOS/Linux.
      Four engineAssets on R2. Needs one Klein + one Wan generation to confirm the quality change.
- [ ] **MPI-453** — NEW, found live 2026-08-05, release blocker. An operation whose per-op
      weights are not installed must not be dispatchable, and a ComfyUI validation rejection
      must be a toast naming the missing weight, not the REPORT ON GITHUB dialog
- [ ] **MPI-404** — product question answered (models root: app-level or engine-owned), then a truthful installed count on first run with the local engine skipped
- [ ] **MPI-410** — cold-first-run splash reproduced, root identified, fixed; install screen no longer strobes
- [x] **MPI-374** — UI size survives a full restart; key in `js/core/storageKeys.js`; no resize flash; Browser Mode no-ops. Needs the user's own restart.
- [ ] Any Gate A card NOT fixed is written into the 1.4 release notes as a known issue

## Gate C — must decide (before the notes are frozen)

- [ ] **MPI-433** — release date checked against 2026-08-10. If on/after: HF re-upload done, same object path, verified by sha256 `f165d4db2a4c9a8ce67f88851216ec41ee64ed508f0755de9d4dcd03175bc865`. If before: the second-route bullet does not claim the whole catalogue
- [ ] **MPI-416** — dangling `@cubric/connector` symlink fixed in the macOS artifact
- [ ] **MPI-416** — Xcode Command Line Tools requirement written as a known issue (NOT fixed in 1.4)
- [ ] **Claim audit** — all 17 fix bullets in `UNRELEASED.md` verified or reworded to what was actually run

## Bump

- [ ] `/mpi-version-bump` → 1.4.0 (appVersion.js, package.json, package-lock.json, operation registry, model mappings, operation_registry.json)
- [ ] `UNRELEASED.md` folded into `RELEASE_NOTES['1.4.0']` + `docs/releases/2026-MM-DD-v1.4.0.md`, file cleared back to its header
- [ ] `npm run release:check` → passed at 1.4.0
- [ ] `release:approve --yes`, approved hash changed
- [ ] CI artifacts built (all three OS)

## Gate B — must verify (against the REAL artifacts, after the bump)

- [ ] `npm test` green
- [ ] `npm run test:desktop` green
- [ ] **MPI-249 Linux leg** — real `CubricVision-linux-x64-v1.4.0.tar.gz` extracted on the Linux box, LOCAL uv engine provisioned, nodes installed, one model per family generated. A Pod run does not count
- [ ] **MPI-432** — Windows/Linux half proven: Ctrl+wheel changes nothing anywhere, Ctrl+plus / Ctrl+minus still change UI size. Mac half either run or the note reworded to what was verified

## Cut

- [ ] Every gate above reads closed, or waived by the user with the waiver recorded on this card
- [ ] `/mpi-release` — GitHub Release published (full builds + update bundles), `1.4.0` branch cut from master
- [ ] Docs-site coverage noted on the `Cubric Studio (Docs)` board (that repo is a hard no-push — note only)
