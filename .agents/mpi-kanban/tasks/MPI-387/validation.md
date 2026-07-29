# MPI-387 — validation state

Umbrella card. Per-sub-item, because they ship independently.

| Fix | Commit | Validation state |
|---|---|---|
| A — MAX_PATH archive + install-depth preflight | `494228fe` | Unit-tested (`tests/install-path-depth.test.cjs`). **Never seen on the reproducing laptop.** |
| B — Impact-Pack `git+sam2` drop | `f371a162` | Pinned by a test. Not re-run on a git-less clean box. |
| C — failure attribution split | `494228fe` | Unit-tested. Not seen fire on a real failing install. |
| D — Windows standard-Electron relayout | `bbfd6295` | See below. |
| E — release note | `bbfd6295` | Written into `docs/releases/UNRELEASED.md` § importantChanges. Ships when the version is bumped. |
| F1 / F2 / F3 | — | Not started. |

## D — what was actually verified

Verified on 2026-07-29, on the maintainer Windows workstation, from a real
staged build (`--platform win32 --from-manifest release-baselines/win32-x64.json`):

- `CubricVision.exe` at the zip root; `resources/app/main.js` present; no `app/`
  directory; `resources/default_app.asar` removed; no duplicate
  `resources/app/node_modules/electron/dist`; no `.vbs` and no `start*` file.
- Delta bundle: 6501 changed/added, `delete: ["start-with-terminal.bat","start.vbs"]`
  — exactly the retired launchers, nothing else.
- The staged `CubricVision.exe` launched by its own path with **no environment
  set at all** and resolved every root inside the portable folder:
  `portable`, `engine`, `models`, `resources` — plus `APP_USER_DATA` pointing at
  `<root>/user-data`.
- `tests/portable-win-layout.test.cjs` (6 tests) pass. Full suite 262/271 with
  the failure LIST unchanged vs the 9 known pre-existing failures.
- eslint clean on every changed JS file.

## D — what is NOT verified (the open validation)

1. **Full app boot from the new layout.** The forked server died on
   `EADDRINUSE 127.0.0.1:3000` because the maintainer's dev app held the port
   (`server.js` hardcodes 3000). Attributable and unrelated to the relayout, but
   the app has not been driven end-to-end from `resources/app`. **Re-run with
   port 3000 free** — stage a build, launch `CubricVision.exe`, confirm the
   window loads and the engine-install screen appears.
2. **A clean Windows 11 machine with Smart App Control ON.** The whole point of D
   is that SAC blocks scripts and reputation-evaluates an exe. Nothing here
   proves the exe actually launches under SAC — expect a SmartScreen
   "More info → Run anyway", not a silent block. Only the reproducing laptop can
   settle this.
3. **A transition update applied by a v1.2.0 install.** The applier that runs it
   is the user's OLD one, so none of this session's applier hardening is in play.
   The design says it works (new files copied, `start.vbs` deleted, `app/`
   deliberately left behind), but it has not been run.
4. **A SECOND update, from the new layout.** That is the one that exercises
   `loadExtractZip`'s `resources/app` branch and `evictBusyFile`. A first update
   passes without touching either.

Items 2–4 need a real release to exist first. Item 1 needs only a free port.
