# MPI-450 — 1.4 release readiness umbrella

**There is no "pre-release" tier.** The project has ONE release flow — bump, build in
CI, publish a GitHub Release (`project_release_model_github_only`, the `mpi-release`
skill). So this card is the pre-release: the gate list that must read clear before
`/mpi-version-bump` stamps `1.4.0`. Nothing here is a new feature; every gate exists
because 1.4 either **claims** something unverified, or **breaks a first run**.

## Where 1.4 stands (measured 2026-08-05)

- Version on disk `1.3.1`; **217 commits** since the `v1.3.1` tag; 16 unpushed.
- `npm run release:check` → **passed**.
- `docs/releases/UNRELEASED.md` is full: 10 whatIsNew bullets, 7 importantChanges,
  17 fixes. Second digit → **1.4.0**.
- The feature surface: the whole canvas toolkit (mask tools, shapes, ten brushes,
  Adjust, Fill, mask↔paint conversion), **Paint**, **Composite**, the **Control**
  operation replacing Depth everywhere, localised edit on four models, Chroma styles
  and Control — plus an **engine-provision rewrite** ("one pip pass").
- Board: 5 doing, 25 todo, 13 done.

The canvas half is client-side and low cross-platform risk. The risk in this release
is concentrated in two places nobody has exercised: **first run** and the
**uv/comfy-cli engine provisioner** (Linux/macOS only), which this release rewrote.

---

## Gate A — must fix (code)

| Card | Why it gates 1.4 |
|---|---|
| **MPI-420** | TAESD previews are forced on twice (`routes/comfy.js:390`, `routes/engine.js:527-528`) and **no decoder weight exists** — confirmed: zero `taesd`/`vae_approx` entries anywhere in `js/data/modelConstants/`. Every local-engine generation logs a warning and shows **no preview image**. 1.4 is the visual release; a progress bar with no picture is the wrong headline. Ship the two decoders as engine assets (~10 MB) or turn the switch off. One decision, small diff. Do NOT also do the taehv/LTX half — that is the card's other merged strand and it is 1.5 work. |
| **MPI-404** | First run lies: `MODELS 0 / 18` right after the user pointed the app at a real weights folder, and Stage-all-models live with no API key. It fires on the **skip-local-engine path**, i.e. the cloud/RunPod user's very first screen. Structural (two sources of truth for the models root; `syncModelInstalled` gated on an `engine:ready` that never fires) — settle the product question first: is the models root app-level or engine-owned. |
| **MPI-410** | The splash never shows on a **cold first run** and the install screen strobes. Cross-platform, pre-existing, and the behaviour is inverted — it works on the warm run where there is nothing to cover. **Root not settled**: two candidates in that card's brief, both need a repro. Budget a repro session; do not fix from the brief. |
| **MPI-374** | Promoted BY 1.4. This release deletes Ctrl+wheel UI zoom (MPI-432), so Ctrl+plus / Ctrl+minus is now the only UI-size control — and it resets on every launch. A user who needs a large UI is **strictly worse off in 1.4 than in 1.3.1**. ~20 lines: persist through `js/core/storage.js`, key declared in `js/core/storageKeys.js`, restore before first paint, no-op in Browser Mode. |

Any Gate A card that is not fixed must be written into the release notes as a known
issue. Silently open is not an option — that is the whole point of this card.

## Gate B — must verify (no code expected)

| Card | Why it gates 1.4 |
|---|---|
| **MPI-249, Linux leg only** | The notes' "engine setup downloads less, one pip pass" bullet rewrote the provisioner, and that code path (`routes/engine.js _provisionUvEngine`) is **Linux/macOS only** — Windows uses the prebuilt archive and never touches it. It has never been run on Linux since the rewrite. The Linux box is on hand and disposable (`project_linux_box_is_disposable`). Extract the real `CubricVision-linux-x64-v1.4.0.tar.gz`, let the LOCAL engine provision, install the nodes, generate one model per family. **A RunPod run does not substitute** (`feedback_runpod_not_local_engine_proof`). This is the single highest-value test before shipping. |
| **MPI-432** | "Pinching on a Mac trackpad no longer resizes the whole interface" is in the fixes list and **has never run on a Mac** — the rented box is gone. Minimum acceptable: prove the Windows/Linux half (Ctrl+wheel changes nothing anywhere; Ctrl+plus / Ctrl+minus still work) so the regression half is evidenced, then either keep the note or reword it to what was verified. |
| Test suites | `npm test` and `npm run test:desktop` both green. They gate the release (`mpi-version-bump` step 6) and CI runs them on every push anyway — run them here so a red suite is not discovered at bump time. The desktop suite no longer needs the app closed (MPI-448). |

## Gate C — must decide (cheap, but the notes are false without it)

| Item | Decision |
|---|---|
| **MPI-433** | Date-gated on **2026-08-10**. The "downloads now have a second route" fix bullet is false for `krea2-raw-transformer-nsfw` — it carries `noMirror: true`, so it is 1 of 97 deps with a single route. If 1.4 ships **on or after 08-10**: do the 13.15 GB HF re-upload first, same object path, verify by hash. If it ships **before**: leave it and make sure the bullet does not claim the catalogue is universal. |
| **MPI-416** | Split it. The **dangling `@cubric/connector` symlink** in the macOS artifact is build-side and probably cheap — fix it in 1.4. The **Xcode Command Line Tools requirement** is structural (tarball-vs-clone, and it is not established that killing git removes the need for clang) — do NOT rush it in; ship a known-issue line telling Mac users to run `xcode-select --install` first. |
| **Claim audit of UNRELEASED.md** | Read the 17 fix bullets against what was actually run. Any bullet describing a fix nobody has executed gets verified or reworded. Same pass folds the file into `RELEASE_NOTES['1.4.0']`. |

## Gate D — hygiene before the bump

- **Close MPI-440.** All members are done — MPI-435 was the last (`e6229bd3`) — and the
  umbrella still sits in `doing`.
- **MPI-4** (LTX 2.3, untouched since 2026-06-27) and **MPI-259** (Apps v2, since
  2026-07-22) are in `doing` and land in neither 1.4 nor its notes. Move them out so the
  column is honest. MPI-449 stays — active research, not release-facing.
- `python ~/.agents/skills/mpi-lib/scripts/validate_board.py .` from the repo root
  (the argument is the REPO ROOT; never through a pipe) → exit 0.
- Then `/mpi-version-bump` → 1.4.0, `npm run release:check`, `release:approve --yes`.
- **Docs site**: 1.4 adds Paint, Composite, Control and the mask toolkit. Docs coverage
  is the `Cubric Studio (Docs)` repo's own card, and that repo is a **hard no-push** —
  note it, do not act on it from here.

---

## Explicitly NOT in 1.4 — do not let these creep in

MPI-403 (Pod hot-store), MPI-397 (a re-measure, not a fix), MPI-320, MPI-442, MPI-322,
MPI-302, MPI-355, MPI-348, MPI-325, MPI-289, MPI-343, MPI-349, MPI-357, MPI-358,
MPI-332, MPI-183, MPI-377, MPI-4, MPI-259, MPI-449.

**MPI-367** (per-op help copy is wrong) is a judgement call and the answer is *no* for
1.4: the `control` help key exists, so there is no missing-key hole — only accuracy —
and a full content pass across a doubled op surface is its own release's work. Revisit
if Gate A finishes early.

## Sequencing

1. **Gate D hygiene first** (minutes, and it makes the board readable while the rest runs).
2. **Gate A in parallel-safe order**: MPI-374 (smallest, self-contained) → MPI-420
   (one decision) → MPI-404 (needs the product answer first) → MPI-410 (repro session,
   longest tail, and the only one whose root is unknown).
3. **Gate C decisions** — they cost nothing and they change what Gate B has to verify.
4. **Bump to 1.4.0, build the artifacts**, THEN Gate B against the real artifacts.
   Verifying a dev checkout does not verify a build.
5. Cut the release.

Gate B comes after the bump on purpose: MPI-249 tests the *artifact*, and MPI-432's
Windows regression check is cheap enough to repeat if anything moves.
