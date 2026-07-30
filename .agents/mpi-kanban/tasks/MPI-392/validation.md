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

## Live check — DONE 2026-07-30, and it did NOT need the app restart

Verified without restarting the user's app, and **non-vacuously** — which mattered more than
the restart did. The plan below said "open Settings and confirm the root still reads
`G:/CubricModels`", but on a clean machine that test proves **nothing**: the guard only ever
fired when the cached path contained `temp`/`tmp`, and the real localStorage holds
`G:\CubricModels`. Mounting Settings with a clean cache exercises the deleted branch zero
times. So the cache was **deliberately poisoned first**.

Driven through the browser at `127.0.0.1:3000` (`MpiSettings` is a landing page, so it is the
same renderer code) — which also left the user's Electron localStorage untouched.

1. Poisoned the cache: `localStorage['mpi_comfy_root_path'] = "D:/AI/temp_models"`. Contains
   `temp`, so the pre-fix substring match would have fired. Confirmed it survived a reload.
2. Recorded `extra_model_paths.yaml` at `sha256 22ff5a6a3f62e98a`, 2006 bytes.
3. Mounted Settings (`settingsMounted: true`, `#mpiSettingsComfyRootPathSlot` present).
4. **Result:**
   - YAML **byte-identical**, `22ff5a6a3f62e98a` → `22ff5a6a3f62e98a`. No rewrite.
   - `app.log` holds **exactly one** `set-path:` line for the whole session, and it is the
     deliberate route test from step 6 below. **The mount fired no POST at all** — the
     strongest form of the assertion, since it shows the call is gone rather than merely
     harmless.
   - The field rendered the **real** root `G:\CubricModels`, and localStorage was
     **reconciled** `"D:/AI/temp_models"` → `"G:\\CubricModels"`. That is `_hydrateComfyPath()`
     doing exactly what § "What shipped" predicted, and it is why deleting the guard lost
     nothing.
5. **Negative control on the live code, comments stripped** (the comment still names
   `_setComfyPath('')`, so a naive grep reads as unfixed):
   - pre-fix `2f8b865e~1`: `if (saved.toLowerCase().includes('temp') || ...includes('tmp'))` →
     `_setComfyPath('')` at lines 323-326.
   - HEAD: no match. No live guard remains.
6. Route half, proven by an idempotent same-value `POST /comfy/set-path`:
   `[comfy] set-path: models root G:\CubricModels -> G:\CubricModels` at `11:43:52`, and the
   YAML stayed byte-identical across it. Pre-fix this route logged **only on error**.

**Acceptance 1, 2, 3, 4, 5 are live-proven; 6 was the source sweep above.** The jsdom gap
noted in § "Not covered" is now closed by real mount evidence rather than a source-text proxy.

Trap for the next person: `curl -d '{"path":"G:\\CubricModels"}'` through Git Bash arrives at
the server as a **malformed** body (`Bad escaped character in JSON at position 12`) — the shell
eats a backslash. Write the JSON with `JSON.stringify` to a file and use `-d @file`.
