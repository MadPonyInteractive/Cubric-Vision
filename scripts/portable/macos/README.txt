Cubric Studio Vision - Portable (macOS)
=======================================

STARTING THE APP
----------------

start.command
    Double-click to launch the app. On macOS this opens a Terminal window
    that stays open while the app runs. (The app also writes a full log to
    logs/app.log.)


FIRST LAUNCH — "cannot be opened" / "is damaged" (macOS Gatekeeper)
-------------------------------------------------------------------

This build is not signed or notarized (it is open-source and runs in place),
so on first launch macOS may block it with a security warning. Two ways past it:

  Easiest: right-click (or Control-click) start.command -> Open -> Open.
  You only need to do this once.

  If macOS still refuses, open Terminal, drag this folder onto the window to
  get its path, then run:
      xattr -dr com.apple.quarantine "/path/to/this/folder"
  Then double-click start.command again.

start.command also tries to clear this automatically each time it runs, so the
warning usually appears only on the very first launch.


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
