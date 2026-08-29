# MPI-500 — Recycle Bin or permanent delete: a Settings toggle

Scope SETTLED by Fabio 2026-08-29, and it **supersedes the 2026-08-09 decision recorded
in the card description**. That one said "delete them permanently, everywhere". Read this
file, not that paragraph, for what to build.

> "The recycle bin is easily accessed by the user anyway. What we can do is, because we
> already have the system in place, we can simply give the user the settings toggle for
> deciding. So if the toggle is off, everything gets deleted. If the toggle is on,
> everything that can go goes into the recycle bin, obviously."

**Toggle OFF → permanent delete. Toggle ON → Recycle Bin, with the existing size-quota
fallback intact.** Default OFF — his stated preference before landing on the toggle was
"just get rid of them". Confirm the default in one line before shipping if it is cheap to
ask; do not block on it.

"Everything that can go" is his own acknowledgement of the quota fallback below. The
toggle does not promise the bin, it only asks for it.

## Why this is not a rewrite

The trash-then-fallback machinery already exists and works. This card adds a boolean in
front of it. Do not rip `_trash` out and do not drop `trash@8` from `package.json` —
earlier drafts of this card said to, and that is now wrong.

## The behaviour being explained to the user

Today's outcome is decided by FILE SIZE, not by any preference, and that is the
"some models end up in my recycle bin and others don't" Fabio has reported three times:

- `_trash()` first. Windows refuses to recycle a file larger than the drive's Recycle Bin
  **quota** (this is the bin cap, NOT free space — a 6.9GB file failed with 37GB free,
  MPI-258). `windows-trash.exe` exits 255 and throws.
- On a throw, `fs.remove()` runs instead and logs `trash failed (…) — permanently deleted`.

So small weights land in the bin (space NOT freed), large ones are deleted (space freed).
Same code, two outcomes. The toggle makes the choice explicit instead of emergent.

## Where the flag has to live — the one real design problem

`downloadManager.js` is **server-side**. Every cross-session setting in this app is
`localStorage` mirrored from `js/state.js` (see its § "cross-session, localStorage-mirrored"
blocks), which the server cannot read. There is no general server-side settings store, and
this card must not invent one.

**Thread the boolean through the existing uninstall request.** Verified 2026-08-29: the
sweep is only ever reachable from an uninstall —

```
routes/downloadManager.js:3109  _sweepOrphanedDeps(...)        ← local uninstall
routes/downloadManager.js:2956  _sweepOrphanedDepsRemote()     ← remote uninstall
```

No boot path, no timer, no other caller. So one field on the uninstall POST body reaches
both call sites and needs no new persistence layer on the server.

## Blast radius — both call sites, one pass

Per the root-cause rule, a one-branch fix here is a false done.

| Site | What it is | Toggle applies? |
|---|---|---|
| `downloadManager.js:305` | orphan sweep, `_trash` → `fs.remove` fallback | **yes** |
| `downloadManager.js:3077` | uninstall loop, same pair | **yes** |
| `_sweepOrphanedDepsRemote` / `remoteUninstallDep` | Pod volume, deletes through the wrapper | **no** — there is no Recycle Bin on a Pod volume. Leave it; say so in the UI copy or the setting reads as a lie on remote. |

## Steps

1. **State + UI.** Add the flag to `js/state.js` as a cross-session localStorage-mirrored
   boolean, matching the neighbouring prefs. Render it in
   `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` as an
   `MpiCheckbox` with `variant: 'switch'` — the pattern is already in that file
   (`reuse-setting-ask`, ~line 528). **Every UI element is a component**: no bare input.
2. **Thread it.** Add the field to the uninstall request body, read it in the route, pass
   it into `_sweepOrphanedDeps` and the uninstall loop.
3. **Branch it.** Where the code calls `_trash`, skip straight to `fs.remove` when the
   flag is off. Keep the try/catch fallback for when it is on — that is the quota case and
   it must not regress.
4. **Log it.** The existing lines (`moved to trash` / `permanently deleted`) are how this
   gets diagnosed from `app.log`; keep both and make the chosen mode obvious.
5. **Test.** `tests/orphan-sweep.test.cjs` already exercises the sweep against a throwaway
   root. Add one case per mode. Do NOT weaken the assertion that the sweep really removed
   the file — that assertion is the whole point of MPI-462.
6. **Docs.** `docs/download-manager.md:479` documents the current two-outcome behaviour and
   must be rewritten to describe the toggle. **That file was owned by MPI-653's live
   session on 2026-08-29** — check it is free before editing.

## Traps

- **A test/sandbox root still trashes.** Every sweep against a throwaway root puts real
  entries in the developer's Recycle Bin, and the toggle will not help because there is no
  renderer to read. MPI-499 shipped the zero-byte fixture, which changed the SIZE of what
  lands, never that it lands. Latest occurrence 2026-08-29 11:03 from an agent sandbox
  (`scratchpad\sandbox655\models\vae\ae.safetensors`, 6 bytes). Consider defaulting the
  server side to permanent-delete when no flag is supplied — that covers tests and
  sandboxes without a second mechanism.
- **The bin does not free the disk.** With the toggle ON, an uninstall reports success and
  the drive is no fuller than before. If that surprises users, it is a UI-copy problem, not
  a bug — say it in the setting's label.
- **An open handle survives the delete.** Live case, 2026-08-29: the sweep trashed
  `qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors` (24.55GB) at 11:11
  local while an `rclone` upload to R2 held it open. The bin was then emptied, NTFS marked
  it delete-pending, and the bytes lived on ONLY inside rclone's handle — gone from the
  namespace, absent from `$RECYCLE.BIN`, still uploading. Neither mode of this toggle
  prevents that, and nothing in the app can see a foreign process's handle. Recorded so the
  next person does not chase it as a sweep bug.

## Verification

- Toggle OFF: uninstall a small weight → file gone, nothing in the bin, `app.log` says
  permanently deleted, disk space returned.
- Toggle ON: uninstall the same weight → it IS in the bin, log says moved to trash.
- Toggle ON with a weight over the bin quota → fallback fires, log says
  `trash failed … permanently deleted`, and the uninstall does not silently no-op (MPI-258).
- `npm test` → `tests/orphan-sweep.test.cjs` green, and the run leaves NO new Recycle Bin
  entries.
