# MPI-369 - Boot-crash evidence + release packaging

Raised 2026-07-28 from a live Discord support thread. A user on Windows 10 reported
1.2.0 flashing and closing instantly. He looked in every folder we named and found no
log at all. We could not diagnose it, and the release was already Latest on GitHub.

Two separate defects surfaced. Neither is his fault.

## 1. A fatal boot error produces no evidence

`main.js` installs NO `uncaughtException` or `unhandledRejection` handler. Any throw
during boot exits the process silently - that is exactly the flash-and-close shape.

Worse, it could not have been logged even if we had looked in the right place:
`routes/logger.js` line 99 appends with `await fs.appendFile(...)`. A dying process
exits before the promise resolves, so the line never reaches disk.

There is also a path split nobody knew about. `main.js` requires `routes/logger` at
top level, in the MAIN process, where `APP_USER_DATA` is never set - main.js only
injects it into the forked server's env. So `LOGS_DIR` falls back to the directory
above the app dir, while the server fork logs under the user-data folder. Two
different app.log files, and the support instructions only ever name one of them.

Fix: install both handlers, write SYNCHRONOUSLY (`appendFileSync`), and show an
Electron error box so the user has something to screenshot even when the disk write
fails. Target the same user-data logs folder support asks for.

## 2. The update-only bundle looks exactly like the app

`CubricVision-<platform>-<arch>-update-v<version>.zip` unzips into a folder called
`CubricVision-v<version>` containing `app/`, `resources/`, `start.vbs` and
`start-with-terminal.bat`. What it does NOT contain is the Electron runtime -
the delta prunes it because it has not changed since the baseline.

Run `start.vbs` from that folder and `start-with-terminal.bat` falls through its
`if exist node_modules/.bin/electron.cmd` test to `npm start`, which is not installed
on a normal user's machine. It exits in milliseconds. `start.vbs` runs the bat with
window mode 0 (hidden), so the error text is invisible. Flash, close, no log,
because nothing ever ran.

The word "update" also reads as "the newer version" to a non-technical user.

### Constraint - do NOT rename the update archive

The update scripts that live in every already-installed folder match the asset by
name:

- `scripts/portable/windows/update.bat` line 11 - `CubricVision-windows-x64-update-v*.zip`
- `scripts/portable/linux/update.sh` line 42 - `^CubricVision-linux-x64-update-v.*\\.zip$`
- `scripts/portable/macos/update.command` line 19 - same shape

Rename the asset and every 1.0.1 / 1.1.0 / 1.2.0 install fails its next update,
including the in-app update prompt from MPI-334. If the asset name must change,
dual-upload the same bytes under both names for two or three releases first.

What IS free: the extracted ROOT FOLDER name (`updateRootName`,
`scripts/build-portable.mjs` line 1016). The applier walks down to find the manifest,
so the root name is transparent to it. Keep the version early in the name - MPI-62
found Safari truncates long zip basenames and the version was what got lost.

## 3. Delta baselines are stale

The 1.2.0 Windows update manifest reads `from 1.0.0 -> 1.2.0`. `release-baselines/*.json`
has not been restamped since 1.0.1, so every "delta" bundle since has been computed
against 1.0.0 and ships far more than it needs to. Restamp all three from the 1.2.0
full-build manifests.

## Status of the original report

NOT confirmed. The user first said he could not find logs, then that he had the full
506 MB download and had also run the update file (which explains a second download).
The applier was checked and is safe - `scripts/portable/apply-update.cjs` copies
file-by-file from the manifest and deletes only the 33 explicit stale-doc entries,
none of them Electron - so running the updater over a good install did not damage it.

If his install really is the full build, the crash cause is still unknown and we
remain blind until fix 1 ships. That is the whole point of fix 1.

## Already shipped (website, separate repo)

`c:/AI/Mpi/Cubric Studio (Website)` commits `e0156ae` and `f1b1a6e`, pushed live:
three per-platform download buttons on the Vision page that resolve the latest full
installer from the GitHub API and explicitly exclude any asset whose name contains
"update". Bypasses the release page entirely for anyone arriving from the site.
