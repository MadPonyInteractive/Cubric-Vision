# In-app error reporter - add stage/build GitHub labels

## Current State

- Project mode: scalable-foundation.
- The app already has a manual `MpiErrorDialog` report flow that reads `/logs/read`, posts `{ title, message, summary, log }` to `/github/create-issue`, and opens the created Issue.
- `routes/system.js` creates the GitHub Issue with `labels: ['bug']` only.
- App version lives in `js/core/appVersion.js`; no build-stage or build-hash source exists yet.
- This task is app-local only. Discord tester-room policy and cross-link workflow live in MadPony-Identity `MPI-23`.

## Implementation

- [ ] Implement stage/build metadata and GitHub labels end to end. Add exported `APP_STAGE` and `BUILD_HASH` metadata beside `APP_VERSION` in `js/core/appVersion.js`, using safe `globalThis.process?.env` fallbacks so browser dev mode still works. Import those values in `MpiErrorDialog`, send them to `/github/create-issue`, then update `routes/system.js` to normalize `alpha|beta|release`, include version/stage/build in the Issue body, and create Issues with `bug`, `auto-report`, `stage:<x>`, and `build:<hash>` labels. If dynamic labels may be missing, add a small backend helper that ensures labels exist or degrades with a logged warning rather than failing the whole report. **Verify:** Node-parse the touched modules, run the app/server route in a mocked or dry-run path where possible, and inspect the generated request/body/labels without creating a real public Issue unless Fabio explicitly asks.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement the planned change end to end.

## Plan Drift

- None yet.

## Verification

1. Confirm `MpiErrorDialog` sends `build: { appVersion, stage, hash }` or equivalent metadata in the JSON body.
2. Confirm `/github/create-issue` defaults invalid/missing stage to `release` or another explicitly chosen safe value and never rejects a report because optional metadata is absent.
3. Confirm the GitHub Issue body includes app version, stage, build hash, user summary, error message, and trimmed log.
4. Confirm labels include `bug`, `auto-report`, `stage:<x>`, and `build:<short-hash-or-dev>` in the create request.
5. Confirm failure to create dynamic labels is logged through `routes/logger.js` and does not prevent issue creation with the remaining valid labels.

## Preservation Notes

- No `.claude/rules/` update is expected unless implementation introduces a new build metadata convention beyond `js/core/appVersion.js`.
- Do not add Discord capture or Discord deeplinks in this repo.
- Avoid committing secrets; `.env` contains GitHub credentials locally and must remain ignored.
