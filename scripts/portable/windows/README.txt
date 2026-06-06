Cubric Studio Vision - Portable (Windows)
=========================================

STARTING THE APP
----------------

start.vbs
    Normal way to launch. Starts the app with NO terminal window.
    Double-click this for everyday use.

start-with-terminal.bat
    Same launch, but keeps a console window open showing live output.
    Use this only when you need to see diagnostics or report a problem.
    (The app also writes a full log to logs\app.log either way.)


UPDATING THE APP
----------------

update.bat
    Online update. Downloads the latest update package from GitHub and
    applies it automatically. Use this when you have internet access and
    just want the newest version.

update-from-zip.bat
    Offline / manual update. Applies an update package (.zip) you already
    have on disk. Drag the update .zip onto this file, or run:
        update-from-zip.bat path\to\CubricVision-...-update.zip
    Use this when you received an update zip directly (e.g. from Discord)
    or have no internet on this machine.

Both updaters preserve your engine, models, user data, and projects.
