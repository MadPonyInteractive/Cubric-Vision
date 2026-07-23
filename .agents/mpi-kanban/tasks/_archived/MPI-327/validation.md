# MPI-327 Validation

## Scope delivered (this session): changelog aggregation into public 1.1.0

Public version target changed 1.2.0 -> 1.1.0 (user, 2026-07-21). The dev branch
internally called "1.2.0" ships publicly as 1.1.0; the internal 1.1.0 + 1.1.1
never shipped publicly, so all content folds into one `RELEASE_NOTES['1.1.0']`.

### Done + verified
- `js/data/releaseNotes.js` — rebuilt as a single curated `'1.1.0'` entry
  (2 importantChanges, 43 whatIsNew, 33 fixes, 1 engineNote). Dropped the stale
  `'1.2.0'` stub and the old Patreon `'1.1.0'` block; their content folded in.
  Apostrophe-free strings (the overlay renders `textContent`; an escaped quote
  would print a literal backslash). Caps-lead to match house style.
- `docs/releases/2026-07-09-v1.1.0.md` — overwritten with the aggregate archival.
- `docs/releases/2026-07-09-v1.2.0.md` — DELETED (never ships; folded into 1.1.0).
- `docs/releases/.approved-1.2.0.json` — DELETED (orphan token).
- `docs/releases/UNRELEASED.md` — cleared back to its header.
- Dedup calls applied (1.1 <-> 1.2 overlap): download queue kept as a feature,
  its "reliably queues" fix dropped; RunPod folded to one "remote engine" intro;
  Reuse Prompt merged (video/audio + refreshed dialog); missing-LoRA + auto-mask
  collapsed to one line each; scroll/playback fix subsumed the 1.1 off-screen one;
  Chroma Flash presented as an intro. 1.1.1's 3 fixes were already in UNRELEASED.
- VERIFIED: `node --check js/data/releaseNotes.js` OK; `release-notes-approval.mjs
  show --version 1.1.0` renders cleanly in overlay order (Beta . v1.1.0), no
  markdown/backslash artifacts. Confirmed exactly one `'1.1.0'` key, zero
  `'1.2.0'`/`'1.1.1'` keys; all remaining runtime keys have archival md.

## Remaining for the 1.2.0 -> master MERGE agent (NOT done here, by design)
These are the version-rename steps that belong to the branch promote:
1. `js/core/appVersion.js` APP_VERSION `1.2.0` -> `1.1.0` (SCHEMA_VERSION stays 4).
2. `package.json` version -> `1.1.0`.
3. `package-lock.json` root `version` + `packages[""].version` -> `1.1.0`.
4. `js/core/operationRegistry.js` AND `operation_registry.json`:
   `appVersionIntroduced` `1.2.0` -> `1.1.0` for the 9 ops introduced this cycle:
   poseReference, krea2Edit, qwenEdit, removeBackground, imageDescribe,
   appImageRegen, appSdxl4k, appVideoStitch, appHeadSwap. (Keep both files in
   lockstep — release:check compares them. Required so a public-1.1.0 project
   referencing these ops passes isOperationAvailableIn: 1.2.0 <= 1.1.0 is false.)
5. Re-approve notes: `npm run release:approve` (writes a fresh
   `.approved-1.1.0.json`; the current one is stale from the Patreon 1.1.0 hash).
6. `npm run release:check` -> must pass (it stays RED until step 1 lands:
   "missing runtime release notes for 1.2.0" is the expected mid-flight signal).

## Not in scope (flagged, untouched)
- Branch rename `1.2.0` -> `1.1.0` and the public naming (MadPony-Identity agent).
- The 18+ modal backdrop fix (shell.js) — separate code change.
- Git commit — owned by mpi-end / the merge flow.
