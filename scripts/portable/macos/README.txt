Cubric Studio Vision - Portable (macOS)
=======================================

STARTING THE APP
----------------

CubricVision.app
    Double-click to launch the app with NO Terminal window — this is the
    normal way to start. It also gives Cubric Vision a proper Dock icon.
    (The app still writes a full log to logs/app.log.)

start-with-terminal.command
    Same launch, but opens a Terminal window that stays open while the app
    runs. Use this only if you want to watch the live log output for
    troubleshooting.


FIRST LAUNCH — "cannot be opened" / "is damaged" (macOS Gatekeeper)
-------------------------------------------------------------------

This build is not signed or notarized (it is open-source and runs in place),
so on first launch macOS may block it with a security warning. Two ways past it:

  Easiest: right-click (or Control-click) CubricVision.app -> Open -> Open.
  You only need to do this once. (Same trick works on
  start-with-terminal.command.)

  If macOS still refuses, open Terminal, drag this folder onto the window to
  get its path, then run:
      xattr -dr com.apple.quarantine "/path/to/this/folder"
  Then double-click CubricVision.app again.

Both launchers also try to clear this automatically each time they run, so the
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
