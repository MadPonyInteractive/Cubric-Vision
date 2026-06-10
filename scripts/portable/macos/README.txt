Cubric Studio Vision - Portable (macOS)
=======================================

FIRST: CLEAR THE QUARANTINE ONCE (macOS Gatekeeper)
---------------------------------------------------

This build is not signed or notarized (it is open-source and runs in place),
so macOS marks the download as "quarantined" and blocks it on first launch
("Apple could not verify ... is free of malware"). On recent macOS, even
right-click -> Open hits the same dead-end dialog for a downloaded .command, so
the one reliable way to clear it is a single Terminal command. You only do this
ONCE per download:

  1. Open Terminal (Applications -> Utilities -> Terminal).
  2. Type  xattr -dr com.apple.quarantine  followed by a space, then DRAG this
     folder from Finder onto the Terminal window (that pastes its full path).
     The line should look like:
         xattr -dr com.apple.quarantine "/Users/you/Downloads/CubricVision-macos-arm64-vX.Y.Z"
  3. Press Return.
  4. Now double-click start.command in Finder — it launches normally, no popup.

(After an in-app update via update.command the files are not re-downloaded by
the browser, so no re-quarantine and no need to repeat this.)


STARTING THE APP
----------------

start.command
    Double-click to launch the app (after clearing the quarantine once, above).
    On macOS this opens a Terminal window that stays open while the app runs.
    (The app also writes a full log to logs/app.log.)


UPDATING THE APP
----------------

update.command
    Online update. Downloads the latest update package from GitHub and
    applies it automatically. Use this when you have internet access and
    just want the newest version.

update-from-zip.command
    Offline / manual update. Applies an update package (.zip) you already
    have on disk. Run:
        ./update-from-zip.command path/to/CubricVision-...-update.zip
    Use this when you received an update zip directly (e.g. from Discord)
    or have no internet on this machine.

Both updaters preserve your engine, models, user data, and projects.


SETTING UP THE AI ENGINE (ComfyUI)
----------------------------------

The first time you install the engine, the app needs "git" to download
ComfyUI. Most Macs already have it via the Xcode Command Line Tools. If git is
missing, the installer will use Homebrew when available, or ask you to run:
    xcode-select --install
Complete the install, then click Retry on the install screen.
