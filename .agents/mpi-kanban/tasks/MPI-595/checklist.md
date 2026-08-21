# MPI-595 — 1.5 gate checklist

Tick order is Gate A → B → C → D. A gate that will not clear becomes a **known-issue line in
the release notes** — never a silent omission. Reasoning per gate: `brief.md`.

## ON PICKUP (run first)

- [ ] Re-measure the header facts in `brief.md` — they were taken 2026-08-21 (`git rev-list
      --count v1.4.2..HEAD`, `npm run release:check`, the `UNRELEASED.md` bullet counts, the
      board column counts). Do not trust the numbers, re-read them.
- [ ] `gh release list | head -3` — confirm 1.4.2 is the latest published tag and that nothing
      was cut in between. New user-facing work goes to `UNRELEASED.md`, never into a frozen
      `RELEASE_NOTES` entry.
- [ ] Confirm the second digit is still right: features present → `1.5.0`.
- [ ] Re-check that `doing` is still empty — it was emptied 2026-08-21 and a live peer
      session (`87018060`) was mid close-out on MPI-594 at the time.

## Gate A — must fix (code)

- [ ] **MPI-507** — PiD as four upscale-dropdown plugins (blocks MPI-515).
- [ ] **MPI-515** — remove the `nvidia-pid` ModelDef. Dep entries stay.
- [x] **MPI-531** — 1.5 Flow authoring shape. **Done 2026-08-21**: zero `uiComponent` in
      `flowsRegistry.js`, `MpiFlowHeadSwap` deleted by `64279953`. Port surface is now zero.
- [ ] **MPI-522** — CI-Windows dangling-symlink guard + its false-green test.
- [ ] **MPI-523** — in-place update refreshes the installed `update-manifest.json`.
- [ ] **MPI-516** — port the three-signal destroyed-prompt detector, WITH its false-positive guard.
- [ ] **MPI-575** — measure the LTX preview junk-frame path on a live foley/extend run, then fix.
- [ ] Every Gate A card that did not clear has a known-issue bullet written.

## Gate B — must verify (no code expected)

- [x] **MPI-520** — **Done 2026-08-21** on evidence: `flowLtxExtend_001.mp4` is a real
      app-dispatched output and the source clip of MPI-531's foley `/history` readback.
- [x] **MPI-594** — **Done 2026-08-21** by session `87018060`: both preview assets shipped,
      reuse-across-restart verified, 657/657. NSFW arm never run through the flow (by design).
- [ ] **MPI-559 phase 1** — real Linux artifact, LOCAL engine provision, one model per family.
      A RunPod run does not substitute.
- [ ] `npm test` green.
- [ ] `npm run test:desktop` green.
- [ ] Engine pin unchanged in `dev_configs/node_lock.json` (no smoke evidence owed), OR smoke
      run + `dev_configs/smoke-evidence.json` present.

## Gate C — must decide

- [ ] Claim audit of all 12 `UNRELEASED.md` bullets; every "used to / previously / no longer"
      checked against `git show v1.4.2:<path>`.
- [ ] The shipped Flow list is frozen (five, or six with Outpaint).
- [ ] MPI-515's outcome recorded — shipped, or a known-issue line.
- [ ] macOS: known-issue line carried forward, or macOS dropped from the claim surface.
- [ ] MPI-543 / MPI-544 / MPI-569 explicitly in or out.

## Gate D — hygiene before the bump

- [ ] 3 unpushed commits pushed.
- [ ] Working tree committed by explicit pathspec (`flowsRegistry.js`, `models.js`, the
      add-flow playbook, the two `flow-outpaint.*` display assets, kanban state).
- [ ] `python scripts/overtaken-cards.py` run; every hit read before closing anything.
- [x] MPI-557 unblocked — **done 2026-08-21**, maturity `blocked` → `planned`.
- [x] MPI-518's blocker reduced to GPU availability only — **done 2026-08-21**.
- [ ] The six loose Flow cards adopted into MPI-560, or MPI-560's "one place" claim corrected.
      **Awaiting Fabio's go** — 586, 567, 591, 557, 355, and 594 (now `done`).
- [ ] MPI-531 item 2 (`steps[].image`) rehomed into MPI-560 — it left MPI-531 on close and
      has no owner. Cheap now, awkward once the 1.6 manifest format freezes.
- [ ] `/mpi-version-bump` → 1.5.0, then `/mpi-release`.
