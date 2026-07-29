Cubric Studio Vision - Portable (Windows)
=========================================

STARTING THE APP
----------------

CubricVision.exe
    Double-click this. That is the whole launch procedure.

    Windows may show a blue "Windows protected your PC" screen the first time,
    because this build is not code-signed yet. Click "More info", then
    "Run anyway". You only have to do this once.

The app writes a full log to user-data\logs\app.log every run - that is the file
to send if you need to report a problem.

There are no start scripts any more. Windows 11's Smart App Control blocks .bat
and .vbs files outright, with no way to allow them, so the launcher is now a
plain executable.


UPDATING THE APP
----------------

The easiest way to update is from inside the app: when a new version is
available it offers a one-click update on startup. That path works on every
Windows machine.

update.bat
    Online update from a double-click, for machines where Smart App Control is
    off. Downloads the latest update package from GitHub and applies it.

update-from-zip.bat
    Offline / manual update. Applies an update package (.zip) you already have
    on disk. Drag the update .zip onto this file, or run:
        update-from-zip.bat path\to\CubricVision-...-update.zip
    Use this when you received an update zip directly (e.g. from Discord) or
    have no internet on this machine.

If Windows refuses to run either .bat, that is Smart App Control. Update from
inside the app instead, or download a fresh full build.

All update paths preserve your engine, models, user data, and projects.
