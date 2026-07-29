# MPI-392 Validation

Fix landed 2026-07-29. Diagnosis was already complete in `brief.md`; this records what
shipped, what is proven, and the one thing only a live app can prove.

## What shipped

1. **The mount guard is gone** — `MpiSettings.js` no longer inspects the cached path at
   all. It was NOT rewritten as an `os.tmpdir()` prefix test, because the guard turned out
   to be **redundant as well as harmful**: `_hydrateComfyPath()` runs immediately after
   mount and already reconciles both the field and localStorage from the YAML, so clearing
   the cache bought nothing. Deleting it is the smaller and safer change. A comment in its
   place records why, so it does not grow back.
2. **`POST /comfy/set-path` logs every successful write** — `models root <old> -> <new>`,
   on both branches (custom root and revert-to-default, which is tagged
   `(reverted to default)`). The old root is read via `getCustomRoot()` **before** the
   write, so the log names the folder that was lost, which is what makes a future mystery
   attributable from `app.log` alone.

## Sweep (acceptance item 6)

Every other `_setComfyPath` / `setComfyRootPath` call site was classified, not just the
reported one:

| Site | Verdict |
|---|---|
| `MpiSettings.js:361` (input `change`) | user-initiated — fine |
| `MpiSettings.js:383` (Browse click) | user-initiated — fine |
| `MpiEngineInstall.js:201/209` (Browse) | user-initiated, localStorage only — fine |
| `MpiEngineInstall.js:229` (Install click) | user-initiated; an empty path there legitimately means "default" — fine |

The mount-time call was the **only** place server state was written from a heuristic. This
is also the link the brief flagged as inferred: `:229` is how the poisoned `C:/tmp/...`
value reached localStorage during MPI-387 testing, and it is correct behaviour — the user
did install to that root. The bug was always the guard's reaction to it.

## Proven

- `node --test tests/*.test.cjs` → **282/282, 0 failures** (280 baseline + the 2 new).
- `tests/settings-models-root-guard.test.cjs`, both halves **negative-controlled**:
  - source assertions re-run against `git show HEAD:...MpiSettings.js` → both match
    (`set-path-empty: true`, `tmp-substring: true`), i.e. the test would have failed before
    the fix and passes after.
  - the route assertions read a **patched `logger.info`** and assert the old root is named
    in the revert line; with the log lines removed they collect zero lines and fail.

## Not covered — read before calling this done

- **There is no jsdom in this suite**, so the component cannot actually be mounted. The
  "YAML byte-identical after mounting Settings" assertion in the acceptance list is
  therefore approximated by a **source-text pin**: no `_setComfyPath('')` and no
  `includes('tmp')` anywhere in `MpiSettings.js`. That is a real regression pin (it fails on
  the pre-fix file) but it is a proxy, not the live behaviour.
- **`routes/` is main-process — the log line needs a full app restart**, not Ctrl+R.
- The log does not record *who* asked. There is no reliable caller identity on a
  same-origin renderer `fetch`, and a `referer` would be the same page for every call, so
  it would have added noise without narrowing anything. The old-root value is what
  attributes an incident.

## Live check (do it on the next app restart — it rides along with MPI-385)

1. Restart the app (kill the ROOT `electron.exe` tree, not the port-3000 child).
2. Open **Settings**. Confirm the models root still reads `G:/CubricModels` and that
   `extra_model_paths.yaml` is unchanged. Before the fix, the poisoned-cache case rewrote it
   on mount.
3. Set the path to something else and back, then grep `logs/app.log` for
   `set-path: models root` — expect one line per change, naming both folders.
