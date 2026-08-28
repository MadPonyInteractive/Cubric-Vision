# MPI-595 — 2.0 gate checklist

Tick order is Gate A → B → C → D. A gate that will not clear becomes a **known-issue line in
the release notes** — never a silent omission. Reasoning per gate: `brief.md`.

**Retargeted 1.5 → 2.0 on 2026-08-26.** Every hard-coded count that was in this file has been
removed rather than refreshed — they were five days old and every one was already wrong. Measure
at pickup.

## ON PICKUP (run first — this list replaces the numbers that used to be in `brief.md`)

- [ ] `git rev-list --count $(git describe --tags --abbrev=0)..HEAD` and `git status --short` —
      commits since the last tag, and what is dirty.
- [ ] `git log --oneline @{u}..HEAD` — what is unpushed.
- [ ] `npm run release:check`.
- [ ] Bullet counts in `docs/releases/UNRELEASED.md` per section (`## Important changes`,
      `## What's new`, `## Fixes`).
- [ ] Board column counts, and **who is in `doing`** — a live peer session mid close-out changes
      what is safe to touch.
- [ ] `gh release list | head -3` — confirm the latest published tag and that nothing was cut in
      between. New user-facing work goes to `UNRELEASED.md`, never into a frozen `RELEASE_NOTES`
      entry.
- [ ] Confirm the digit with Fabio: **2.0.0**, per the `UNRELEASED.md` header (2026-08-26). A
      major skips a digit — do not let `mpi-version-bump` infer it from bullet shape.

## Gate A — must fix (code)

> Re-verified 2026-08-26: every unticked box below is still `todo` and untouched since before
> this card existed. Nothing here cleared in the retarget.

- [ ] **MPI-507** — PiD as four upscale-dropdown plugins (blocks MPI-515).
- [ ] **MPI-515** — remove the `nvidia-pid` ModelDef. Dep entries stay.
- [x] **MPI-531** — Flow authoring shape. **Done 2026-08-21**: zero `uiComponent` in
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
- [ ] Engine pin in `dev_configs/node_lock.json` **compared against the last released tag** (do
      not assume it is unchanged — that assumption is from 2026-08-21). Unchanged → no smoke
      evidence owed; changed → smoke run + `dev_configs/smoke-evidence.json` present.
- [ ] **THE PIN HAS CHANGED — the smoke is owed. MPI-649 bumped the engine `v0.31.0 → v0.34.0`
      on 2026-08-28 and deliberately stopped at the free half.** `smoke-evidence.json` in the
      tree still says `0.31.0`, so `release:check` will refuse the release until this clears.
      Gates 6–9 of `docs/playbooks/bump-engine/README.md` all rent a RunPod GPU, which is why
      they were parked here rather than paid for twice — run them as ONE block:
      - [ ] Sync **both** files into `c:\AI\Mpi\mpi-ci\cubric-vision-pod\` — `node_lock.json`
            AND `python_deps.txt` — and commit there with `git -C`. `python_deps.txt` moved only
            its provenance comment (`…constraints-v0.31.0.txt` → `v0.34.0`), zero package
            versions, but it still has to travel or the drift check fails.
      - [ ] Re-run `node scripts/smoke-workflows.mjs --plan` **immediately before** the smoke —
            both sync files are live working-tree state and a card landing in between re-drifts
            them. `--plan` spends nothing and prints the matrix + volume size; show Fabio.
      - [ ] Rebuild the **DEV** Pod image at the new lock (`/build-pod-image`), tag
            `v<ver>-dev-<profile>`, bump ONLY `POD_IMAGE_VERSION_DEV`/`_CPU_DEV`. Then **restart
            the default-profile app** — `routes/` does not hot-reload and a matrix driven by a
            pre-edit app rents the OLD tag.
      - [ ] Assert the Pod reports `0.34.0` before smoking anything.
      - [ ] Run the matrix. **Must include a VIDEO op, not only an image op** — `av >=16.0.0 →
            >=17.0.0` is a PyAV MAJOR bump and it is the one requirement line in the whole
            v0.31.0→v0.34.0 diff that can break a video path (VideoHelperSuite, any
            ffmpeg-backed node). That is the specific risk this smoke exists to retire.
      - [ ] Promotion is **mandatory at this release, not optional**: ship the app at the new
            pin while the released Pod image is still on the old one and every user gets a local
            engine and a remote Pod on different ComfyUI versions, silently. A clean rebuild at
            a real version — never a `-dev` tag renamed.
      - Local half is **already green and needs no re-run**: see MPI-649's `validation.md`.

## Gate C — must decide

- [ ] Claim audit of every `UNRELEASED.md` bullet; every "used to / previously / no longer"
      checked against `git show v1.4.2:<path>`. Watch the Flow trap the header names: a "fix" to
      a Flow is not a fix to anything a user ever had.
- [ ] **Flow-list reconcile — RUN THIS LAST, immediately before the notes freeze.** More Flows are
      landing before 2.0 (Fabio, 2026-08-26), so any earlier pass is wasted work. Diff the flow ids
      in `js/data/flowsRegistry.js` against the Flows named in `UNRELEASED.md`, then fix the count
      sentence to match. Worked example of the drift, not the answer: on 2026-08-26 the notes named
      eight and the registry held nine (`voice-changer`, in no bullet).
- [ ] MPI-515's outcome recorded — shipped, or a known-issue line.
- [ ] macOS: known-issue line carried forward, or macOS dropped from the claim surface.
      - [ ] **DramaBox on Apple Silicon is UNVERIFIED** (MPI-607). Its text encoder is a 4-bit
            Gemma-3-12B that needs `bitsandbytes`, and 0.50.2 ships exactly one Mac wheel:
            `macosx_14_0_arm64`. A wheel is not a working backend, so whether nf4 runs on MPS
            is unknown, and the wheel does not cover an arm64 Mac on macOS < 14. Answered by
            the MPI-249 trip. If it fails there, the flow needs a platform gate before 2.0 -
            none exists today (no `platform` field on a dep, no `process.platform` check in
            any registry), and a Mac user would download 16.36 GB before finding out, which
            reads as a broken app rather than an unsupported flow.
- [ ] MPI-543 / MPI-544 / MPI-569 explicitly in or out.
- [x] **2.0-specific: why is this a major?** — **ANSWERED 2026-08-26.** Flows make it major, on
      audience not code. No migration/compat note owed. Flows open the app to a user who could not
      use it before, and some of them exist nowhere else or only behind proprietary websites. That
      pair is the release-body angle — see `brief.md` Gate C.
- [ ] **Re-adjudicate the four "not in this release" cards for a 2.0 scope** (MPI-591, MPI-578,
      MPI-532, MPI-573) — they were excluded from a 1.5, and MPI-573 has since gone `done`.

## Gate D — hygiene before the bump

- [ ] Unpushed commits pushed.
- [ ] Working tree committed by explicit pathspec — never `git add -A`.
- [ ] `python scripts/overtaken-cards.py` run; every hit read before closing anything. Expect
      hits: 350-plus commits have landed since this card was written.
- [x] MPI-557 unblocked — **done 2026-08-21**, maturity `blocked` → `planned`.
- [x] MPI-518's blocker reduced to GPU availability only — **done 2026-08-21**.
- [ ] The loose Flow cards adopted into MPI-560, or MPI-560's "one place" claim corrected.
      **Awaiting Fabio's go** — survivors are 586, 591, 557, 355. (594 and 567 are now `done`
      and drop off this list.)
- [ ] MPI-531 item 2 (`steps[].image`) rehomed into MPI-560 — it left MPI-531 on close and
      has no owner. Cheap now, awkward once the next manifest format freezes.
- [ ] `/mpi-version-bump` → **2.0.0**, then `/mpi-release`.
