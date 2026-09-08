# MPI-706 — validation evidence

## 0. PUBLISHED — 1.5.0 is live, 2026-09-08 09:03:51Z

`https://github.com/MadPonyInteractive/Cubric-Vision/releases/tag/v1.5.0`

Reachability check (`mpi-release` step 7) — the one that decides whether any install
ever sees this release, because `check-for-update` reads exactly this endpoint:

```
"tag_name": "v1.5.0"   "draft": false   "prerelease": false
```

6 assets `uploaded`, `targetCommitish` and `refs/tags/v1.5.0^{}` both `a8691834`.

**The update prompt was OBSERVED firing, not just reasoned about.** Launched the real
1.4.0 portable at `D:\cubric-install-test\CubricVision-windows-x64-v1.3.0` (the folder name
lies — it was updated in place to 1.4.0, `package.json` says so) and its log recorded:

```
[update] portable check — current=1.4.0 latest=1.5.0
[update] update available: v1.4.0 -> v1.5.0, prompting
```

That install has its own `user-data` and its engine already stamped 0.31.0, so nothing
else was disturbed. **Update was NOT pressed** — the in-place apply + relaunch leg is still
unobserved, and 1.4.0 -> 1.5.0 is the first transition where the MPI-422 relaunch fix can
be seen at all. Worth doing once on that install; it costs a 2.6 MB bundle.

Post-publish, both done and pushed:
- `release-baselines/{win32-x64,darwin-arm64,linux-x64}.json` restamped 1.4.4 -> 1.5.0 from
  the published FULL builds (6527 / 6669 / 6489 files). Taken from the **top-level**
  `resources/cubric/update-manifest.json`; every archive also carries a nested
  `resources/app/resources/cubric/update-manifest.json` and picking that one would poison
  the next delta. Left stale, the next release silently ships a FULL bundle.
- Maintenance branch `1.5.0` cut at `v1.5.0` (`a8691834`) and pushed.

## 1. GitHub release draft — 2026-09-08 (superseded by § 0)

- Draft ids seen, in order: `untagged-bfa5bd7320374c558473` ->
  `untagged-667d383aca975d05f7a1` -> `untagged-75aa9f86afdb0414db33`. **A draft's id is
  reminted by every `gh release edit`**, so the id from the previous call is already dead.
- `isDraft: true`, `isPrerelease: false`, `name: v1.5.0`, `tagName: v1.5.0`
- `targetCommitish` pinned to `a869183483932dfddfe5a8f8534091f001771aa7` (was `master`
  by default — a wrong-code-tag failure mode if the tag ever went missing). Remote tag
  `refs/tags/v1.5.0^{}` already resolves to that same sha, so publish attaches to the
  existing tag.
- All 6 assets uploaded, `state: uploaded`, byte sizes identical to the local artifacts.

Body edits made this session (GitHub-only half — `releaseNotes.js` untouched, approval
hash intact):
- Opening line: "a second FLUX.2 Klein" -> "Klein 9B" (Fabio, 2026-09-08; he typed "9b",
  written as "9B" to match every other mention in the body).
- Added a `## First launch` section. `docs/releases/github-release-checklist.md` says the
  Windows and macOS first-launch notes "must appear in every release body" and neither was
  present: an unsigned build with no note reads as malware. Wording taken from that doc,
  including "may show" rather than "will".
- **Platform status rewritten (Fabio, 2026-09-08).** Linux and macOS now read "not tested
  on this version" — the old lines claimed Ubuntu-laptop launch validation and asked for
  macOS community validation, and neither happened for 1.5.0, so both were false. The
  contributor-validation paragraph under them went with it. His standing rule: macOS is
  tested on a rented box when it is tested at all, so "community validation is needed"
  must never appear in a release body again. **The source of that boilerplate is
  `docs/releases/github-release-checklist.md` § Platform Disclosure + § Contributor
  Validation Request, which prescribe it verbatim — unchanged, it comes back next release.**
- **`## Updating` rewritten — the old copy was wrong, not just confusing.** It told users
  to run an "online `update` script". Verified in code: `main.js` `check-for-update` hits
  `releases/latest` on launch, `js/services/updateChecker.js` compares and shows the
  dialog, and `run-update` downloads the bundle, applies it and relaunches — on Windows
  through the app's own binary as node, deliberately never a `.bat` (MPI-387, SAC). There
  is nothing for a user to run. Also confirmed, because it was asked: **there is no
  Settings-page update surface on this line.** `updateChecker.js` is the only caller of
  `run-update` and `js/init.js` its only consumer; after 3 dismissals of the same version
  it mutes until a newer one lands. The "Update" labels elsewhere are the model manager.

## 2. Windows local install test — PASSED, generate smoke included

Test bed: `D:\CVTest\CubricVision-v1.5.0`, fresh extract of the shipped
`CubricVision-windows-x64-v1.5.0.zip`, with `engine/` and `models/` moved in from the old
1.3.0 install at `D:\CVTest\CubricVision-v1.3.0` (Fabio chose option A). Fresh
`user-data/` — the portable redirects `userData` into its own root, so the user's
`%APPDATA%\Cubric Vision` profile was never touched.

### PASSED

| check | result |
|---|---|
| Extract | 6528 entries, 14.6s, `CubricVision.exe` at root (no wrapper folder) |
| **Artifact provenance** | `BUILD_HASH = 'a86918348393'` in the shipped tree == tag `v1.5.0`. The zip carries the tagged commit — stronger than "CI ref matched" |
| Version stamp | `APP_VERSION = '1.5.0'`, `SCHEMA_VERSION = 4` |
| Launch | Window opens, server ready in ~0.4s, `portable roots` all resolved under the install |
| Update check | `[update] portable check — current=1.5.0 latest=1.4.4` -> "up to date". Confirms the draft is correctly invisible to `releases/latest` |
| **Engine in-place upgrade** | 0.29.2 -> **0.34.0** on Windows. Took the in-place path, NOT the 11 GB wipe. `.mpi_engine_version` = 0.34.0, `comfyui_version.py` = 0.34.0, engine git HEAD `12d5279438bfefc058a269eae805ceab6047777f` == `node_lock.comfyui.core.commit` exactly |
| Node repair | "In-place upgrade repaired 7 outstanding dep(s)"; drifted `comfyui-kjnodes` pre-wiped and re-fetched at the pinned commit |
| Custom nodes | 16 packs incl. LanPaint and `Comfyui_Minimax_h3_latent_Upscaler`. **0 IMPORT FAILED** |
| Engine boot | ComfyUI 0.34.0 serving on 48188, ~90s cold |
| **Floor check** | `node scripts/engine-floor-check.mjs --url http://127.0.0.1:48188` -> 1981 class_types registered, **42 workflows, 194 used, 0 missing**, exit 0 |
| Shipped model ids | `klein-9b` present; `sdxl-realistic` declares `supportedOps: [t2i, i2i, control, inpaint, upscale, detail]` — the two headline claims exist in the built tree |

### The generate smoke — PASSED ON THE PIXELS

`sdxl-realistic` / `t2i`, "a red vintage bicycle leaning against a white stone wall,
bright midday sunlight, sharp focus, photograph". 768x1024, **72.5s** on the 4060 Ti,
1.98 MB PNG at
`C:\Users\Fabio\Documents\Cubric Vision\Projects\1.5.0 Local Test\Media\t2i_001.png`.

**The image was OPENED and looked at, per the checklist rule that a log never passes this
gate** (MPI-419, the 1.3.0 macOS grey-noise leg). It is a coherent photograph: a red
vintage bicycle on its stand against a white rendered wall, hard midday sun casting the
bike's shadow up the wall, cobbled paving, black leather pannier on the rear rack, chrome
mudguards, intact spokes / chainring / pedals, tree and blue sky over a stone wall behind.
Every prompt term is satisfied and the lighting direction is consistent between subject
and cast shadow. Gibberish lettering on the frame badge is ordinary SDXL text behaviour,
not a defect signal.

It landed as a **real gallery card**, not a bare file: `project.json` carries
`itemGroups[0] = t2i_001` with `history: ["81b7f8bc-..."]`, and `Media/.meta/` holds both
`81b7f8bc-....json` (recording `modelId: sdxl-realistic`, `operation: t2i`) and its
`.thumb.jpg`. `schemaVersion: 4`.

**Getting a project open needed a human.** `/connector/generate` returned `NO_PROJECT`
until Fabio cleared the first-launch 18+ consent gate and made a project. Two notes for
next time:
- This line has **no `/connector/open-project` route** (master/2.0 only), so an agent
  cannot open a project over HTTP.
- The landing page's Recent list is **loaded at boot and does not refresh**, so a project
  created over the API after launch is invisible in the UI and cannot be opened without a
  restart. That is why the scratch project was unusable and Fabio made his own.

Only model on disk was `SDXL_Realistic.safetensors` (the app's own footer read
**MODELS 1 / 21**), so t2i on `sdxl-realistic` was the only smoke available. Inpaint
cannot be dispatched over the connector at all (`MEDIA_UNSUPPORTED`), so that headline
claim is verified only as declared support, never executed here.

### Teardown

Test instance stopped by its captured root PID; zero `CubricVision.exe` left, nothing
LISTENING on 3000 or 48188, no orphaned engine `python.exe`, GPU lease released. The empty
scratch project `1.5.0 Local Install Test` was deleted (`/delete-project` needs BOTH
`projectId` and `folderPath` — it fails `folderPath required` with the id alone).
Fabio's own `1.5.0 Local Test` project and its image are left in place as the evidence.

### Limitations of this box — do not read the pass as wider than it is

- **Smart App Control is OFF** here (`VerifiedAndReputablePolicyState = 0x0`) and the
  extracted exe carries **no mark-of-the-web** (`Get-Item -Stream *` shows `:$DATA` only —
  the zip came down via `gh`, not a browser). The SAC leg of the checklist is untested.
- `git` IS on PATH (`/mingw64/bin/git`) and the engine upgrade used it ("using host git"),
  so the git-less install path is untested.
- GPU is an RTX 4060 Ti, 16 GB VRAM / 65 GB RAM — not the 5090 the H3 work was measured on.

### Findings (neither a 1.5.0 blocker)

1. **A moved install root leaves ComfyUI blind to its models.** Moving `engine/` and
   `models/` invalidated `extra_model_paths.yaml`, which still carried
   `base_path: D:/CVTest/CubricVision-v1.3.0/models`, and nothing self-healed it — the app
   went on to download vae_approx decoders into the dead path. Repaired by hand; after the
   fix `GET /comfy/get-path` reports the correct root. This is my staging artifact, but a
   user who renames or moves their portable folder hits the same thing. Pre-existing, not a
   regression.
2. **Node stderr is logged at ERROR level.** `MODULE_TYPELESS_PACKAGE_JSON` (a performance
   warning about `modelDeps.js`) and `tar: Cannot connect to D: resolve failed` (msys tar
   reading `D:\...` as a remote host; the extract-zip fallback works) both land as
   `[ERROR] [server]` on every boot. Cosmetic, but it makes a clean log look broken.
