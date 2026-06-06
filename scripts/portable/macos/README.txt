Cubric Studio Vision - Portable (macOS)
=======================================

STARTING THE APP
----------------

start.command
    Double-click to launch the app. On macOS this opens a Terminal window
    that stays open while the app runs. (The app also writes a full log to
    logs/app.log.)


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
