# MPI-672 Validation

Members MPI-673, MPI-674 and MPI-675 each carry their own validation record and are
closed. This file covers the umbrella's own remaining work: **phase 3, the 1.4.3
release off branch `1.4.2`**.

## Where the work happens

`D:\tmp\cv-142-wt` — a `git worktree` on branch `1.4.2`. The main tree stays on master
because three peer sessions (MPI-591, MPI-664, MPI-678) have uncommitted work in it; a
branch switch there would have taken it. The repo's own `post-checkout` hook installed
`node_modules` (854 MB) and bootstrapped `.engine-config.json` at the main worktree's
engine, so nothing was set up by hand.

## Phase 3 — evidence

- [x] **Branch `1.4.2` pushed to origin** — was local-only at `88fcda76`; origin now
      carries it with all four ports. `[new branch] 1.4.2 -> 1.4.2`.
- [x] **Four fixes ported.** `git diff <sha>^ <sha> -- . ':(exclude).agents'` piped to
      `git apply --3way`, one commit each, message preserved plus a
      `(cherry picked from …)` trailer. Board state was excluded deliberately: it does
      not belong on a maintenance branch, and `board.json` at 1.4.2 is 640 commits
      stale so a plain `cherry-pick` would conflict on it every time.

      | master | branch | how it landed |
      |---|---|---|
      | `e152cc10` | `659d641a` | 9 files, all clean |
      | `fc6f4336` | `13faa25a` | 7 files, all clean |
      | `54f03caf` | `94799255` | 1 file, clean |
      | `a2a14de3` | `68a67a0b` | 8 files clean, `MpiSettings.js` by hand |

- [x] **The one hand-port.** `MpiSettings.js` conflicted in three hunks: every anchor
      in a2a14de3 is the Update section (MPI-629), which is master-only. On the branch
      the Engine health section is therefore the FIRST section, and its comment no
      longer points at an Update section that does not exist. `_initEngineHealth` and
      its `_initFields` call are otherwise verbatim. Checked against 1.4.2's own APIs
      before porting: `MpiButton` takes `text` for a plain button and its `setLabel`
      writes `.mpi-btn__text`, `setDisabled` syncs `props.disabled`, and `ui:error` is
      the established error channel. Proven by `engine-repair-reachable.spec.js`, which
      drives that exact section — green.
- [x] **A peer's unshipped line stripped.** `a2a14de3` had swept up one line of
      MPI-591's in-flight work in `commandExecutor.js`:
      `getUniversalWorkflow(payload.operation, payload.flowModelIds)`. The
      two-argument signature exists in no branch — only in MPI-591's `plan.md` — so the
      argument was inert on master and had no business in a patch. Reverted to one
      argument in `68a67a0b`.
- [x] **`npm test` — 626/626, 0 fail**, twice (before and after the strip). All three
      new test files run inside it: 19 named tests, confirmed by name in the run log
      (node's reporter prints a `✔ tests\<file>` line only for the bare-script suites,
      which is why a filename grep finds nothing).
- [x] **`npm run test:desktop`** — 20 specs. Both new specs pass:
      `deps-warning-blocks-generation` and `engine-repair-reachable`.

      The suite flakes under load on this box, as the handoff warned. Every full run
      failed exactly one spec and a **different** one each time — `workspace-sweep`,
      `toast-serial-countdown`, `runpod-settings-extract`,
      `deps-warning-blocks-generation` — and each passed in isolation afterwards.
      Attribution was settled by running the same full suite on the **pristine base**
      `88fcda76`, which failed **two** specs on one run. The branch is no worse than the
      base it came from; the red is the box, with three agent sessions live.

      One false alarm on the way: `toast-serial-countdown` failed twice in a row
      including once in isolation, which read as a real regression and was bisected to
      the MPI-674 port. Three clean runs at that same commit afterwards, plus the
      pristine-base result above, say otherwise. The bisect was still worth it — it is
      what surfaced the MPI-591 leak.

- [x] **Version stamped and committed** — `f7939337`, pushed to `origin/1.4.2`.
      `appVersion.js` + `package.json` + `package-lock.json` all read `1.4.3` (the
      lockfile edit is a clean 2-line diff, formatting preserved),
      `RELEASE_NOTES['1.4.3']`, `docs/releases/2026-09-01-v1.4.3.md`,
      `.approved-1.4.3.json`, UNRELEASED cleared back to its header. Pure-patch path:
      no new ops, no schema change, no engine move.
- [x] **Gate 0 (claims vs `v1.4.2`), per bullet, before the copy was written.**
      `v1.4.2` has no deps warning anywhere, so the graph dispatched and ComfyUI
      answered the raw missing-class name; `v1.4.2`'s Settings has no Engine health
      section and the only restart control is the dev-only Ctrl+Tab radial; and
      `v1.4.2:MpiErrorDialog.js:118` posts to `/github/create-issue`, which reads
      `process.env.GITHUB_TOKEN` and, on failure, logs and bare-`return`s — nothing
      reaches the user. All three "used to" claims are real shipped behaviour.
- [x] **Gate 1 passed** — Fabio read the rendered overlay copy and approved it
      unchanged, noting the keep-it-short rule is aimed at big releases.
      `release:approve -- --yes` wrote the token (the interactive prompt is
      classifier-blocked for agents; the branch's script takes `--yes`).
- [x] **Pod runtime channel not drifted** — `dev` and `stable` manifests are
      byte-identical (`wrapper_version 0.2.44`, all three sha256s equal), so no
      un-promoted runtime rides along.
- [x] **Engine pin unmoved since `v1.4.2`** — `node_lock.json` and
      `system_dependencies.json` are unchanged, so the MPI-467 smoke-evidence gate
      does not apply.
- [x] **`npm run release:check` — passed, with the Pod model-paths leg actually
      running.** It skips by default in a worktree: it resolves `mpi-ci` as a sibling
      of the repo root, i.e. `D:\tmp\mpi-ci`. The real
      `c:\AI\Mpi\mpi-ci\cubric-vision-pod\start.sh` was copied there for the run and
      the stand-in deleted afterwards, so no stale copy can answer a later run.
- [x] **`npm test` — 626/626** after the stamp as well as before.
- [ ] **`npm run release:deps` — exits 1 on one PRE-EXISTING dead mirror.** Not
      introduced here and not this card's to fix: `ltx23-lora-foley`'s HuggingFace
      mirror 404s (the repo itself answers 200, so the file was never uploaded) while
      its R2 primary serves 200 at exactly the declared 226,709,270 bytes. Effect is a
      dev-gated Flow weight on a single route, not a broken install. Same on master.
      Reported to Fabio, no card created.
- [x] **`npm run test:desktop`** — the `toast-serial-countdown` red is the box, proven
      twice. It failed in isolation, then passed 3/3 in isolation at the same commit,
      then failed 4/4 later in the session. `APP_VERSION` was reverted to `1.4.2` as a
      probe and it still failed, ruling out the new changelog entry; the **pristine
      base `88fcda76` then failed it 2/2 under the same load**, having passed earlier.
      Load-sensitive spec, rising load on the box, not a 1.4.3 regression.
- [x] **mpi-ci build 33519891797 — success on all three OS legs.** Dispatched by the
      `v1.4.3` tag push via the `build-portable.yml` dispatcher (run 33519877008).
- [x] **Six artifacts downloaded and verified** into
      `D:\CubricStudio\Vision\Builds\v1.4.3\`. CI publishes 3 artifacts (one per OS),
      each holding the full build plus its delta bundle; downloading them by name with
      `gh run download -n <name>` lands the 6 files flat, matching the v1.4.2 folder.
      Every one passed `unzip -t` / `tar -tzf`, and `APP_VERSION` inside the Windows
      full build reads `1.4.3`. CI artifacts deleted afterwards (3 ids, `total_count`
      back to 0), per the storage-hygiene rule.
- [x] **Gate 2 passed** — the release body was drafted from
      `docs/releases/2026-09-01-v1.4.3.md` (maintainer-notes section stripped, the
      checklist's platform-disclosure block appended) and approved by Fabio unchanged.
      He also confirmed the handoff's two calls: title `v1.4.3` (which matches v1.4.2's
      own release title) and `--latest`.
- [x] **Published draft-first.** All 6 assets were uploaded to a draft
      (`untagged-d81483e4976e1b40de32`) and their byte-sizes compared against disk
      before anything went public; `gh release edit --draft=false --latest` published it.
- [x] **`git rev-parse 'v1.4.3^{}'` == the SHA CI built.** Local, `origin`
      (`git ls-remote origin 'refs/tags/v1.4.3^{}'`) and the GitHub API all peel the
      annotated tag `cdce113b` to `f79393373fe15a260ed13d0ef0e2df25bdb2ce3a` — the SHA
      the artifacts were built from. No `workflow_dispatch` rebuild happened, so the
      tag never went stale.
- [x] **`releases/latest` reports `v1.4.3`, `prerelease: false`, `draft: false`**, with
      all 6 assets in state `uploaded`. The API's `target_commitish: master` is
      cosmetic — GitHub fills in the default branch when the tag already existed; the
      tag object itself points at `f7939337`, proven above.
- [x] **Delta baselines restamped AFTER publish**, per the timing rule in
      `release-baselines/README.md`. Extracted from the published FULL portable-stage
      manifests (the shallowest `resources/cubric/update-manifest.json`, never the
      nested `resources/app/...` copy and never a `-update-` bundle) and asserted
      before they touched the repo: `fromVersion: null`, `toVersion: 1.4.3`,
      `kind: portable-stage`, darwin 6652 / linux 6472 / win32 6510 — each exactly +2
      on v1.4.2, which is the shape a 3-file patch should have. Authored on master as
      `12bb7c0a` (committed by explicit pathspec, so the three peers' uncommitted work
      in the main tree was untouched) and cherry-picked onto `1.4.2` as `d6793b48`;
      both branches pushed. `origin/1.4.2` is now ahead of the `v1.4.3` tag by that one
      commit, which is correct — the tag stays on what shipped.
