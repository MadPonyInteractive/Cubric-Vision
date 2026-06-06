Cubric Studio Vision - Portable (Linux)
=======================================

STARTING THE APP
----------------

start.sh
    Normal way to launch. Starts the app detached with NO terminal window.
    Run this for everyday use:  ./start.sh

start-with-terminal.sh
    Same launch, but stays attached to the terminal and shows live output.
    Use this only when you need to see diagnostics or report a problem.
    (The app also writes a full log to logs/app.log either way.)


UPDATING THE APP
----------------

update.sh
    Online update. Downloads the latest update package from GitHub and
    applies it automatically. Use this when you have internet access and
    just want the newest version.

update-from-zip.sh
    Offline / manual update. Applies an update package (.zip) you already
    have on disk. Run:
        ./update-from-zip.sh path/to/CubricVision-...-update.zip
    Use this when you received an update zip directly (e.g. from Discord)
    or have no internet on this machine.

Both updaters preserve your engine, models, user data, and projects.
