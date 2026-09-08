# MPI-708 — Rename the product to Cubric Studio

Parent: **MPI-677** (consolidate the Cubric family into Cubric Vision).
Gates: **MPI-595** (2.0 release readiness) — 2.0 cannot cut under the old name.
Brief (decision + repo-rename reasoning): `brief.md`.

## Current State

Project mode: **scalable-foundation**. Full guardrails, no prototype shortcuts.

The family merged into one app (MPI-677), so the ecosystem name is free. 1.5.0 is the
last release named Cubric Vision; 2.0.0 is the first named Cubric Studio. The GitHub
repo is **renamed, not forked** — a rename 301-redirects the old URL including the API,
which is what keeps every shipped 1.x client's update check alive.

Four read-only investigations ran 2026-09-08. What they found changes the shape of the
work in five ways that were not visible from the brief:

**1. The artifact filename is load-bearing for the installed fleet — this is the highest
risk in the whole card.** Every installed 1.x client carries a hardcoded asset regex:
`scripts/portable/win-update.cjs:26` `^CubricVision-windows-x64-update-v.*\.zip$`,
`scripts/portable/linux/update.sh:74`, `scripts/portable/macos/update.command:19,21`.
If 2.0 publishes `CubricStudio-*` assets, every 1.x install detects the update, then
**fails to apply it** (`fetch-release.cjs:115-117` throws "no update asset matching"),
and the user gets the MPI-422 failure dialog. The repo rename does not cause this; an
artifact rename does. Handled by the 1.5.1 bridge plus a one-release dual-publish (D1) —
see Phase 0b.

**2. `appId: 'cubric.vision'` must not change.** `apply-update.cjs:246` hard-asserts it
and rejects any bundle that disagrees. It is also asserted in
`build-portable.mjs:699,1148`, all three `release-baselines/*.json`,
`resources/cubric/connector-manifest.json`, `tests/connector-responder.test.cjs` and
`tests/portable-update-apply.test.cjs`. It is an internal identifier no user sees.

**3. One CI gate breaks on the rename and a redirect does not rescue it.**
`mpi-ci/.github/workflows/cubric-vision-portable.yml:47,48` compares the repo slug by
**string equality**:
`ssh-key: ${{ inputs.source_repo == 'MadPonyInteractive/Cubric-Vision' && secrets.CUBRIC_VISION_DEPLOY_KEY || '' }}`.
Post-rename the deploy key silently drops out and the token path flips. It is coupled to
`.github/workflows/build-portable.yml:44`, which hardcodes the slug it dispatches — the
two must change together or the build loses its checkout auth.

**4. The mascot answer is cheap, and there are six render sites, not two.** The media type
is already in scope at the peek call site — `MpiGroupHistoryBlock.js:253-254`
`const isVideo = _group.type === 'video'; const modeKind = isVideo ? 'video' : 'image';`,
still in scope at the only `_mascotShow` caller (`:742`). Same story in the gallery, where
`group.type` is live in the card closure at `MpiGalleryGrid.js:1504-1507`. No plumbing.
The canonical enum is `MEDIA_TYPE` in `js/data/commandRegistry.js:23-27` —
`image | video | audio`. **Key off the three-value `modeKind`, not the boolean:** audio
groups already exist (`MpiGalleryGrid.js:1191,1289`), and `isVideo ? video : vision`
silently means "audio → Vision".

The six sites: History peek (`MpiGroupHistoryBlock.js:455,742`), gallery card peek
(`MpiGalleryGrid.js:1504-1507`, with an idle↔greet flip timer at `:1515-1521`), every
toast (`MpiToast.js:141-157`, the only consumer of `happy.png`), Model Library queued tile
(`MpiTileSheet.js:174`), engine-startup overlay (`MpiStartingComfy.js:24`), landing
empty-state (`js/shell/projectUI.js:205,226`). Only the first two have a generation in
scope; the other four are identity surfaces and take the Studio character.

**5. Weight.** One character is 13.7 MB across five PNGs, rendered into a 66px box
(`MpiGroupHistoryBlock.css:159-161`). `electron-builder.yml:8-9` ships `files: "**/*"`
with no `assets/` exclusion. Three more sets at this size is ~55 MB of PNG in the asar,
and the gallery flips a 1.8-3.8 MB PNG every 4-8s per generating card with no preload
layer. Downscale on the way in.

Also established, and each one removes work rather than adding it:

- **No test goes red on a display rename.** The only window-title assertion is
  `tests/desktop/electron-smoke.spec.js:23` `toHaveTitle(/Cubric/i)`, which matches both
  names. There is no wordmark or brand-text assertion anywhere in `tests/`.
- **`npm run release:check` passes unchanged** through a repo rename, a package-name
  change and a productName change — all seven checks in
  `scripts/release-health-check.mjs` are version/registry-driven.
- **`electron-builder.yml` is not in the shipping path.** `scripts/build-portable.mjs`
  produces the GitHub artifacts and never reads it; it is excluded from builds at
  `build-portable.mjs:119`. Fix it for consistency, but nothing ships from it.
- **The repo is already inconsistently branded.** Release notes say "Cubric Studio v0.0.1"
  and "Cubric Studio Vision" from v1.0.0; `build-portable.mjs:831` sets
  `displayName: 'Cubric Studio Vision'` while `:682,683` set the macOS bundle name to
  `'Cubric Vision'`; `.claude/rules/component-mounts.md:161` already reads
  `Cubric Studio · v${APP_VERSION}`. Three spellings in one build script.
- **`docs/PROJECT.md:83` is wrong today**, independent of this card: it says
  `<Documents>/Cubric Studio/Projects/` while `routes/shared.js:53` returns
  `Documents/Cubric Vision/Projects`. It sends agents and users to a folder that does not
  exist.
- **Website and docs sources are not in MadPony-Identity.** They are two separate repos:
  `MadPonyInteractive/Cubric-Studio-Website` (`C:\AI\Mpi\Cubric Studio (Website)`) and
  `MadPonyInteractive/Cubric-Studio-Docs` (`C:\AI\Mpi\Cubric Studio (Docs)`). ~66
  hardcoded strings across three files on the site, four per-app page directories to
  collapse, and the whole docs tree namespaced under `/vision/`. No data file, no CMS.

Sweep size, whole repo: **~62 lines to change, ~250 that are real identifiers and must
stay, ~634 historical that must never be rewritten** (`docs/archive/**` is 603 of those
and its own README declares it historical).

### Decisions taken, so implementation never stops to ask

| # | Decision | Why |
|---|---|---|
| D1 | **Ship a 1.5.1 bridge release that widens the updater, then rename the artifacts freely at 2.0 while ALSO publishing the legacy `CubricVision-*` names one last time.** Drop the legacy names at 2.1. | The updater that runs during an update is the one already installed (`main.js:1287` spawns `update/win-update.cjs` from the *installed* root), so 1.5.1's widened pattern is what executes on the 1.5.1 → 2.0 hop. The dual-publish covers anyone who skipped 1.5.1. Together they let the old names actually die instead of being carried forever. **Supersedes the earlier "never rename the artifacts" position.** |
| D2 | **Keep `appId: cubric.vision` through 2.0**, but widen the acceptance check in the 1.5.1 bridge so a future change is possible without a second bridge. | `apply-update.cjs:246` hard-asserts it today. Nothing user-visible depends on the value, so there is no reason to change it *at* 2.0 — only a reason to stop it being permanently frozen. |
| D3 | **Heal the Documents folder: rename `Documents/Cubric Vision` → `Documents/Cubric Studio` on first 2.0 boot, behind a resolver that falls back to the old name.** | Lower-risk than it first appeared — see the two findings below. The resolver is the safety net: a rename that fails or is skipped is then harmless, because resolution never assumes it happened. **This reinstates and replaces the cancelled `brief.md` §C.** |
| D3a | **Leave `app.setName('Cubric Vision')` and the AppData path alone.** | For portable installs — which is every released build — `main.js:283-292` overrides userData to `<portable root>/user-data` via `app.setPath`, so `app.setName` never determines where user data lives. `%APPDATA%\Cubric Vision` is the **dev** path. Renaming it would migrate developer machines and nothing else. |
| D4 | **Do not rename any local checkout folder.** | `C:\AI\Mpi\Cubric-Studio` already exists as a sibling; `package.json:29` resolves `file:../Cubric-Studio/packages/connector`, and `Cubric-Prompt/src/main/index.ts:222` hardcodes the `'Cubric-Studio'` path segment and fails soft into a misleading "Cannot find broker CLI". GitHub repo names and local folder names are decoupled. |
| D5 | **The four identity mascot sites take the Studio character**; only the two generation peeks are media-aware. | Toast, tile-sheet, engine overlay and landing empty-state have no generation in scope. |
| D6 | **Keep `appId: 'cubric.studio'` on the broker for now** (`Cubric-Studio/packages/broker/src/brokerServer.ts:295`). | It collides semantically with the new product name, but the connector is being deprecated by MPI-677. Renaming a dying identifier is churn. Revisit only if the CLI (MPI-593) adopts it. |

### Why the Documents heal is safe (verified, not assumed)

- **A custom projects folder is untouched.** `getProjectsRoot()` (`routes/shared.js:41-56`)
  checks `.engine-config.json` `projectsPath` **first** and returns it when it exists. The
  Documents folder is only the default, so any user who chose their own location is not in
  the blast radius at all.
- **`project-paths.json` holds *external* parent dirs by definition** (`routes/shared.js:59-73`)
  — directories the user added *outside* the default root. Renaming the default root does
  not invalidate them. The one edge case is a user who added a parent dir that happens to
  sit inside `Documents/Cubric Vision/`; the heal must rewrite any entry carrying that
  prefix, not just move the folder.
- **Same volume, so the rename is atomic and instant.** It must run before `APP_DOCUMENTS`
  reaches the server fork (`main.js:762`) and before anything opens a file underneath it.

The failure mode is what makes this worth doing properly: if a rename half-fails and the
resolver still assumes the new name, the app opens onto an empty projects list and the user
reads that as **data loss**, even though every file is still on disk. Hence the resolver
comes first and the rename is opportunistic, never load-bearing.

Parked by Fabio, explicitly out of scope: per-operation colours, media-type accent lines
on cards, and the Audio/Prompt mascots. Follow-up card only — no colour work here.

## Completed

- [ ] Nothing yet.

## Remaining Work

## Phase 0: Gate — 1.5.0 ships first

- [ ] Confirm MPI-706 has closed and 1.5.0 is published before any rename step runs.
      No *rename* may land in a 1.5.x patch — the 1.5.1 bridge in Phase 0b is the single
      deliberate exception, and it changes no user-visible name. **Verify:**
      `gh release view v1.5.0` returns a published release, and MPI-706 is in `done`.

## Phase 0b: The 1.5.1 bridge — teach the installed fleet the new names

> **Drift, 2026-09-08 (MPI-709).** The three updater changes above are DONE — they landed in
> MPI-709's working tree, with `tests/updater-rename-bridge.test.cjs` covering this phase's
> Verify clauses. The fourth is superseded rather than done: **there is no 1.5.1.** MPI-709
> found 1.5.0 had two downloads, both Fabio's, so it was deleted and is being RE-CUT carrying
> both the `fromVersion` fix and this bridge — no phantom version. Phase 0a's verify
> (`gh release view v1.5.0` returns a published release) therefore refers to the re-cut.

Ships under the old name, changes nothing a user sees. Its only job is to put a wider
updater on disk so 2.0 can rename artifacts freely. Everything here is in the *shipped*
updater scripts, which is why it cannot wait for 2.0: the updater that runs is the one
already installed.

**1.5.1 became urgent on 2026-09-08 for an unrelated reason: MPI-709**, a P0 where the
1.5.0 delta bundle silently corrupts any install more than one version behind. That card
owns the hotfix and the release cut; this phase's tasks ride along in the same release.
**MPI-709 also forces 1.5.1's update bundle to be FULL rather than delta**, which happens to
be the safest possible carrier for these updater changes. Sequence: MPI-709 lands first,
these tasks join the same cut.

- [x] Widen the asset pattern in all three platform updaters so both the legacy and the new
      artifact names match: `scripts/portable/win-update.cjs:26`,
      `scripts/portable/linux/update.sh:74`, `scripts/portable/macos/update.command:19,21`.
      **Verify:** a unit check asserts the widened pattern matches both
      `CubricVision-windows-x64-update-v2.0.0.zip` and
      `CubricStudio-windows-x64-update-v2.0.0.zip`, and still rejects an unrelated asset.
- [x] Widen the relaunch-exe resolution so a renamed executable is found: `win-update.cjs:64`
      hardcodes `CubricVision.exe`, and `scripts/portable/windows/update.bat:15,16,21` +
      `update-from-zip.bat:18,20` use it as the node runtime. Resolve the new name first,
      fall back to the old. **Verify:** the applier relaunches successfully against a staged
      tree containing only the new exe name, and again against one containing only the old.
- [x] Widen the appId acceptance in `scripts/portable/apply-update.cjs:246` to accept both
      values rather than the single hardcoded `cubric.vision` (D2). The value does not change
      at 2.0; this only stops it being frozen forever. **Verify:** `node --test tests/` passes,
      including `tests/portable-update-apply.test.cjs`.
- [~] Cut and publish 1.5.1 with legacy artifact names, via `/mpi-release`. **Verify:**
      `npm run release:check` passes and a real 1.5.0 portable install updates itself to
      1.5.1 through the in-app prompt.

## Phase 1: Repo renames and the CI gate (sequential — order is load-bearing)

- [ ] Rename the hub repo on GitHub, `Cubric-Studio` → `Cubric-Connector`. This is what
      frees the name and must come first. Do **not** rename the local folder (D4). Update
      its git remote, and its own `README.md:1` / `AGENTS.md:1` / `CLAUDE.md:1,3,101,105,113`
      headings. **Verify:** `gh repo view MadPonyInteractive/Cubric-Connector` resolves and
      `MadPonyInteractive/Cubric-Studio` 404s as a distinct repo.
- [ ] Rename `Cubric-Vision` → `Cubric-Studio` on GitHub. Update the local remote with
      `git remote set-url`. **Verify:** `git remote -v` shows the new slug, `git fetch`
      succeeds, and `curl -sI https://api.github.com/repos/MadPonyInteractive/Cubric-Vision/releases/latest`
      returns a 301 to the new slug.
- [ ] Fix the CI auth gate in lockstep: `mpi-ci/.github/workflows/cubric-vision-portable.yml:9,47,48`
      and `.github/workflows/build-portable.yml:44`. These are string comparisons, not
      URLs — a redirect does not save them. **Verify:** dispatch a build with the new slug
      and confirm the checkout step authenticates (the run reaches the build stage rather
      than failing at checkout).
- [ ] Sweep cross-repo pointers that a redirect would silently mislead rather than break.
      Highest value: `MadPony-Identity/workflows/community/feature-request-tier-label.md:73`
      passes `--repo MadPonyInteractive/Cubric-Studio`, which post-rename **succeeds** into
      the wrong repo. Also `MadPony-Identity/scripts/shortlinks.json:8,13,18`,
      `scripts/community-digest.config.json:5`, `scripts/feature-request-label.py:51`, and
      `ComfyUi-MpiNodes/README.md:7` (the only public link in a repo that ships to the
      ComfyUI registry). **Verify:** each edited reference resolves to the intended repo
      with no redirect hop.

## Phase 2: Renderer — mascots and display strings (sequential, NOT a parallel batch)

These cannot be split into parallel tasks: the mascot work and the string work both edit
`index.html`, `MpiAbout.js`, `MpiGalleryGrid.js` and `js/shell/projectUI.js`. Splitting
them by concern would give two workers overlapping ownership of the same files, so they
run as one owned phase. **Phase verify mode: `user-ux`.**

- [ ] Stage the mascot assets. Copy from `C:\AI\Mpi\Cubric Studio Brand Assets` into
      per-character folders — `assets/mascot/studio/`, `assets/mascot/vision/`,
      `assets/mascot/video/` — taking `Studio-*`, `Vision-*` and `Video-*`. **Downscale on
      the way in**: the render targets are 66px and the sources are 1.5-4.2 MB each.
      Leave `Audio-*` and `Prompt-*` out (parked). **Verify:** every file the code
      references exists on disk, and the combined weight of `assets/mascot/` is smaller
      than the 13.7 MB it is today despite holding three characters instead of one.
- [ ] Add a small mascot-path map keyed on `MEDIA_TYPE` (`js/data/commandRegistry.js:23-27`)
      — a new module under `js/data/`, **not** `js/utils/icons.js`, which is the SVG icon
      registry and does not take raster assets. Cover `image`, `video` and `audio` so an
      audio group cannot silently resolve to the Vision character. **Verify:** a unit-style
      check resolves all three media types plus the identity character.
- [ ] Point the two generation peeks at the map. History: `MpiGroupHistoryBlock.js:455`
      (initial src) and `:742` (`_mascotShow` in `_setGenerating`), keyed on `modeKind`
      from `:254`. Gallery: `MpiGalleryGrid.js:1504-1507` `MASCOT_SRC` and `_setMascotState`
      at `:1522`, keyed on `group.type`. Both values are already in closure scope — no new
      plumbing, no new event field. **Verify:** run an image generation and a video
      generation in the app and confirm the correct character appears in both the History
      peek and the gallery card.
- [ ] Point the four identity sites at the Studio character (D5): `MpiToast.js:141-157`,
      `MpiTileSheet.js:174`, `MpiStartingComfy.js:24`, `js/shell/projectUI.js:205,226`.
      **Verify:** trigger a toast of each variant, a queued model install, an engine start
      and the zero-projects landing state; all four show Studio.
- [ ] Swap the identity logo: `index.html:19` and
      `MpiAbout.js:44`. Regenerate the derived icons from the new logo — `build/icon.png`,
      `build/icon.icns`, `media/icons/cubric-vision.{png,ico,icns}` (**keep the filenames**,
      they are wired into `build-portable.mjs:570-571` and
      `scripts/portable/linux/setup-desktop.sh`), `favicon.png`, and
      `.github/readme/mascot-greet.png`. **Verify:** launch `npm run app:isolated` and
      confirm the titlebar, About screen, taskbar icon and browser-tab favicon all show the
      new logo.
- [ ] Sweep the renderer display strings. `js/core/appName.js:13` **and its `appName.cjs`
      CommonJS twin** (main.js cannot import the ESM one — they must stay in sync);
      `index.html:7,9,20,69`; `MpiAbout.js:45,48`; `updateChecker.js:184`;
      `js/shell/projectUI.js:72`; `MpiAudioRecorder.js:169`; `MpiErrorDialog.js:146`;
      `js/pages/components.js:630`; `js/data/modelConstants/models.js:1028`. The wordmark is
      already a component — `Cubric<span class="mpi-wordmark__suffix">Vision</span>` — so
      "Studio" drops into the same structure. **Do not touch `js/data/releaseNotes.js`** —
      those are shipped 1.x notes and rewriting them would misstate history. **Verify:**
      `grep -rn "Cubric Vision" js/ index.html` returns only `releaseNotes.js` and comments
      describing real on-disk paths; `npm run lint` and `npm run test:desktop` pass.

## Parallel Batch: Non-renderer sweep

Genuinely disjoint file ownership, safe to run concurrently. Every task must be briefed
with `/mpi-brief-rule` output plus the Critical Rules Snapshot before dispatch.

- [ ] **Main process and server strings.** Ownership: `main.js`, `routes/**` **except
      `routes/shared.js`** (owned by the heal task below).
      Change `main.js:51,222`, `routes/remotePodState.js:153`, `routes/engine.js:52`
      (prose only — the `C:\CubricVision` path suggestion in that same line is a real path,
      leave it), `routes/system.js:323` `ISSUE_REPO`. **Keep `main.js:269`
      `app.setName('Cubric Vision')` exactly as it is** — D3a: for portable installs
      `main.js:283-292` overrides userData anyway, so this only names the dev path.
      `tests/issue-report-url.test.cjs:86` asserts the exact issue URL and must be updated in
      the same task. Briefings: root-cause. **Verify:** `node --test tests/` passes,
      including `issue-report-url.test.cjs`.
- [ ] **Heal the Documents folder.** Ownership: `routes/shared.js` **only**, plus its test.
      Both `getProjectsRoot()` (`:41-56`) and `getProjectPathsRegistryFile()` (`:65-74`)
      independently join `APP_DOCUMENTS` with the literal `'Cubric Vision'` — factor that into
      one resolver they both call. The resolver **prefers `Cubric Studio`, falls back to
      `Cubric Vision` when only the old folder exists**, and returns the new name for a fresh
      install. Then rename opportunistically: if the old folder exists and the new one does
      not, `fs.rename` it (same volume, atomic) and rewrite any `project-paths.json` entry
      carrying the old prefix. **A failed rename must be a no-op, never a fresh empty
      folder** — the resolver's fallback is what makes that safe. Leave the
      `.engine-config.json` `projectsPath` branch untouched; a user with a custom location is
      not in scope. Briefings: root-cause. **Verify:** a test covering four cases — old
      folder only (resolves old, renames, rewrites registry entries), new folder only
      (resolves new), both present (resolves new, renames nothing), neither (resolves new) —
      plus a simulated rename failure that must still resolve to the old folder with the
      project list intact.
- [ ] **Docs sweep.** Ownership: `docs/**`, `README.md`. Change the ~24 Class-A prose lines
      plus the four live files in `docs/releases/`. **Do not touch `docs/archive/**` (603
      hits, declared historical by its own README) or the 20 dated
      `docs/releases/YYYY-MM-DD-vX.Y.Z.md` files.** Leave every line describing a real
      artifact filename, on-disk path, repo slug, Docker image or RunPod template. Two
      specifics: fix `docs/PROJECT.md:83` **back** to `Cubric Vision` (it is wrong today),
      and re-author `README.md:156` — "Vision is the first app in the Cubric Studio family"
      becomes self-referential after the rename and needs new wording, not a substitution.
      Briefings: root-cause. **Verify:** no line in `docs/` outside `archive/` and the dated
      release notes describes the product as Cubric Vision, and every path/filename mention
      still matches what the code actually produces.
- [ ] **Agent tooling and CI text.** Ownership: `.claude/**`, `.github/**`.
      The two that generate future artifacts matter most:
      `.claude/skills/mpi-version-bump/SKILL.md:335` is the release-notes header template
      (`# Cubric Vision vX.Y.Z — YYYY-MM-DD`) that stamps every future note, and
      `.claude/skills/mpi-release/references/build-dispatch.md:22` is the git tag
      annotation. Also the ~20 Class-A description lines across `.claude/rules/`,
      `.claude/agents/` and the skills. **Leave every hardcoded slug, absolute repo path,
      hook path, Docker image name, pod-name literal (`guard-runpod-create.py:8,24,53`
      matches `'cubric-vision'` exactly) and the `.claude/skills/cubric-vision/` folder
      name** — renaming that folder changes the skill's invocation name and breaks its
      cross-references. Briefings: root-cause, kanban. **Verify:** `claude plugin validate`
      passes where applicable, and a dry-run of the release-notes generator emits a
      Cubric Studio header.
- [ ] **Build identity.** Ownership: `scripts/build-portable.mjs`, `electron-builder.yml`,
      `release-baselines/*.json`, `package.json`, `package-lock.json`.
      Change `package.json` `productName` and `electron-builder.yml:2` `productName`;
      resolve the three-way spelling drift in `build-portable.mjs` (`:682,683` macOS bundle
      name, `:831` `displayName`) onto one name. Rename the artifacts (D1): `exeName`
      (`:41`), the three `rootName` templates (`:1183,1192,1198`) and the
      `release-baselines/*.json` `rootName` + `files[]` entries. **Add the old
      `CubricVision.exe` to `RETIRED_PATHS` (`:82-95`)** or every updated install keeps both
      binaries on disk forever — the delta bundle lists the new file but nothing deletes the
      old one. **Do not change `appId`** in either file (D2). If the `.code-workspace` file
      is ever renamed, `build-portable.mjs:119` must be updated in the same commit or it
      stops being excluded and ships inside every build. Briefings: root-cause.
      **Verify:** `npm run build:portable:dry-run` completes, the staged tree carries the new
      exe name with the unchanged `appId`, and `RETIRED_PATHS` names the old exe.

## Phase 3: The 2.0 release

- [ ] Write the 2.0 release-note section: separate apps were planned, they became one app,
      so the ecosystem name is now the product name. Say plainly that **the projects folder
      is renamed automatically and no action is needed**, and that 2.1 will drop the legacy
      download filenames. **Verify:** `npm run release:check` passes and the rename appears
      in `whatIsNew`.
- [ ] Cut 2.0.0 via `/mpi-release`, **dual-publishing the legacy `CubricVision-*` artifact
      names alongside the new ones** (D1) so a user who skipped the 1.5.1 bridge still
      matches on their old narrow pattern. **Verify:** the release lists both filenames for
      all three platforms.
- [ ] Raise a follow-up card for 2.1 to drop the legacy artifact names. **Verify:** the card
      exists and names the three `rootName` templates.

**Not this card:** the website and docs repos (`Cubric-Studio-Website`,
`Cubric-Studio-Docs`) and the MadPony-Identity brand statements. Fabio drives those from
MadPony-Identity, not from here. Recorded in Preservation Notes so the scope is deliberate
rather than forgotten.

## Plan Drift

- 2026-09-08: the brief assumed the website and docs sources live in MadPony-Identity. They
  are two separate repos (`Cubric-Studio-Website`, `Cubric-Studio-Docs`) — but Fabio drives
  both from MadPony-Identity, so they leave this card's scope entirely rather than becoming
  a phase here.
- 2026-09-08, **second pass after Fabio pushed back on both freezes**. The first draft took
  the conservative line twice: never rename the artifacts, never move the Documents folder.
  Both were replaced by healing the installed base instead of freezing it.
  - **Artifacts.** The updater that runs during an update is the one *already installed*
    (`main.js:1287` spawns `update/win-update.cjs` from the installed root), so a 1.5.1
    bridge that widens the pattern is what executes on the 1.5.1 → 2.0 hop. That plus a
    one-release dual-publish lets the legacy names actually die. The original D1 would have
    carried `CubricVision-*` forever.
  - **Documents folder.** Re-read of `routes/shared.js:41-74` and `main.js:283-292` showed
    the risk was smaller than the first draft assumed: a custom `projectsPath` bypasses the
    default entirely, `project-paths.json` holds *external* dirs by definition, and portable
    installs never use the AppData path at all. The heal is now in (D3) and the AppData
    rename stays out (D3a) — for a different reason than the first draft gave.
  - `brief.md` §C was cancelled in the first draft and is now **reinstated in a different
    shape**: Documents only, resolver-first, AppData untouched.

## Verification

**Verify mode:** user-ux

The mascot and logo work has a visual surface only Fabio can judge — whether the right
character appears on the right operation, and whether the downscaled assets still look
right at 66px and at titlebar size. Phases 0, 1 and the Parallel Batch are `auto`.

End to end, 2.0 is ready on this card when:

1. `git remote -v` shows `MadPonyInteractive/Cubric-Studio`, and the old slug 301s.
2. A CI portable build completes with the new slug — proving the `mpi-ci` auth gate fix.
3. The running app shows Cubric Studio in the titlebar, About screen, update prompt and
   window title, with the Studio logo and taskbar icon.
4. An image generation shows the Vision character and a video generation shows the Video
   character, in both the History peek and the gallery card.
5. `npm run lint`, `node --test tests/`, `npm run test:desktop` and `npm run release:check`
   all pass.
6. `npm run build:portable:dry-run` produces the renamed exe with `appId: cubric.vision`
   unchanged, and `RETIRED_PATHS` names the old exe.
7. **The three-hop fleet test — the one that cannot be reasoned about.** On a real portable
   install, not a sandbox: install 1.5.0 → update in-app to 1.5.1 → update in-app to 2.0.0
   with renamed artifacts. Every hop must apply and relaunch. This is what the whole 1.5.1
   bridge exists for, and the bridge is unverifiable any other way.
8. **The skipped-bridge test:** a 1.5.0 install pointed straight at 2.0.0 must also apply,
   via the dual-published legacy filename. Covers everyone who never took 1.5.1.
9. **The Documents heal, on a real profile with projects in it:** the folder is renamed, the
   project list is intact afterwards, and a `project-paths.json` entry that pointed inside
   the old folder still resolves. Then the failure case — make the rename fail and confirm
   the app falls back to the old folder with the project list still intact, rather than
   opening onto an empty gallery.

## Preservation Notes

- `docs/PROJECT.md:83` is a live defect independent of this card — fix it even if the card
  stalls.
- Follow-up cards to raise at close-out: **2.1 drops the legacy artifact names**;
  per-operation colours and media accent lines (parked by Fabio); the Audio and Prompt
  mascots; whether the `pod.cubric.studio/vision/` and `models.cubric.studio/vision/`
  namespaces still make sense once Vision is Studio; the broker `appId: 'cubric.studio'`
  (D6) if the CLI adopts the connector.
- **Out of scope by Fabio's decision, not by oversight:** the `Cubric-Studio-Website` and
  `Cubric-Studio-Docs` repos and the MadPony-Identity brand statements (`SOUL.md:23`,
  `PRODUCT.md:39`, `DESIGN.md:344`, `docs/product-briefs/cubric-vision.md:421`). He drives
  those from MadPony-Identity. One thing to hand over when he does: `initDownloads()` in the
  website's `scripts/vision.js` reads the GitHub releases API and will 301 rather than
  break, so it is easy to leave stale.
- `.claude/rules/` mentions the product name in ~20 places. Per CLAUDE.md rule 5, ask
  before editing rule files.
