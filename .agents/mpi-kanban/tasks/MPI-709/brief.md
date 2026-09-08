# MPI-709 Brief — 1.5.0 delta update silently corrupts any install more than one version behind

P0. Reported by Fabio 2026-09-08 with a screenshot: after updating in-app, the landing
screen renders but the recent-projects panel spins forever and LOCAL / MODELS / LAST
SESSION all read as dashes.

## Root cause

**`scripts/portable/apply-update.cjs` has no precondition check on a delta bundle.** Line
246 is the only validation it does:

```js
if (manifest.appId !== 'cubric.vision') {
    throw new Error(`Wrong update appId: ${manifest.appId}`);
}
```

The manifest carries `fromVersion` (written by `build-portable.mjs:820,841`), and the
applier never reads it. So a delta computed for one baseline is applied onto *any*
installation, and the updater reports success either way.

The 1.5.0 update bundle is a **1.4.4 → 1.5.0** delta — it contains only the files that
changed between those two versions. Fabio's install was **1.3.0**. Applying that delta
leaves every file added or changed during the whole 1.4.x line absent, producing a
1.3.0-base / 1.5.0-delta hybrid that stamps itself `"version": "1.5.0"`.

## Evidence

Install: `D:\cubric-install-test\CubricVision-windows-x64-v1.3.0` (updated in place, so the
folder keeps its old name).

`update/update.log` reports a clean run:

```
[2026-09-08T10:24:14.851Z]   [fetch-release.cjs] Downloading CubricVision-windows-x64-update-v1.5.0.zip...
[2026-09-08T10:24:17.044Z]   [apply-update.cjs] Applied Cubric Vision update to 1.5.0.
[2026-09-08T10:24:17.044Z] Update applied successfully.
[2026-09-08T10:24:17.076Z] Relaunched Cubric Vision.
```

Diffing `resources/app` against a known-good full 1.5.0 install
(`D:\CVTest\CubricVision-v1.5.0`, which works — it ran a generation at 08:19 UTC):
**6438 files in the good install, 6371 in the updated one. 67 missing.** Every one is a
1.4.x-era addition:

- `js/shell/agentDispatch.js`, `js/utils/markdown.js`
- `js/components/Compounds/MpiMediaPicker/{js,css}`
- `js/components/Organisms/MpiStepPreview/{js,css}`
- `js/components/Primitives/MpiCanvas/managers/holeFlood.js`
- `node_modules/dompurify/**`, `node_modules/.bin/marked*`, `@types/trusted-types/**`
- `comfy_workflows/flow_ltx_extend.json`, `flow_ltx_foley.json`, `raw/ltx_v2v_lipdub_template.json`
- `docs/releases/2026-08-11-v1.4.1.md` … `2026-09-03-v1.4.4.md` and their `.approved-1.4.*.json`

## Why it presents as a hang

The **server is healthy**. `user-data/logs/app.log` records the relaunch completing
normally:

```
[2026-09-08T10:24:18.291Z] [INFO] [system] Server started at http://127.0.0.1:3000
[2026-09-08T10:24:18.292Z] [INFO] [main] Server signaled ready.
```

This is a **renderer** failure. `index.html` paints — which is why the hero copy and
layout look correct in the screenshot — and then a static ESM import of one of the missing
modules throws, killing the module graph before the landing page can populate. The panel
keeps its spinner and the stat row keeps its placeholder dashes. No error reaches the log
because `clientLogger` is part of the graph that failed.

## Blast radius

- **Fresh installs are fine.** A full artifact carries all 6438 files;
  `D:\CVTest\CubricVision-v1.5.0` is one and it works. New users are unaffected.
- **Users exactly one version behind (1.4.4) are fine.** The delta matches their baseline.
- **Broken: anyone on 1.4.3 or older who took the in-app update.** That is anyone who had
  not updated in roughly a month.

## Fix

1. **Ship 1.5.1's update bundle as FULL, not delta** — omit `--from-manifest` in the build
   dispatch. `build-portable.mjs:894,917` already treats a missing baseline as "ship a full
   bundle", so this is a dispatch-input change, not a code change. A full bundle self-heals
   every corrupted install regardless of the version it is on. This is the part that has to
   ship today.
2. **Add the missing precondition to `apply-update.cjs`**: read `manifest.fromVersion` and
   refuse to apply when it does not match the installed version, instead of corrupting the
   tree and reporting success. Same caveat as every updater change — the applier that runs
   is the one already installed, so this protects 1.5.1-and-later updates only. That is
   precisely why (1) cannot be skipped in favour of (2).

Do **not** fix this by deleting or re-cutting the 1.5.0 release: `updateChecker.js` compares
semver, so anyone already on 1.5.0 would be offered nothing and stranded on the broken build
permanently. The fix has to carry a new version number.

## Related

- Rides in the same release as the MPI-708 updater bridge (widened asset pattern, relaunch
  resolution, appId acceptance). One 1.5.1 cut, three payloads.
- `RETIRED_PATHS` (`build-portable.mjs:82-95`) is untouched by this and is not implicated.
