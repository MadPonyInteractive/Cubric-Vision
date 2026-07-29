@echo off
setlocal
rem Cubric Studio Vision - online updater (Windows).
rem
rem All the work lives in update\win-update.cjs, run through the app's own
rem Electron binary as Node (the same electron-as-node trick the Linux/macOS
rem updaters use). This .bat is only a double-clickable convenience: Smart App
rem Control blocks it outright on a clean Windows 11 install, which is exactly
rem why the in-app update button spawns win-update.cjs directly rather than
rem calling this file (MPI-387). One implementation, two entry points.
set "CUBRIC_PORTABLE_ROOT=%~dp0."
set "MPI_RESOURCES_PATH=%CUBRIC_PORTABLE_ROOT%\resources"
set "ELECTRON_RUN_AS_NODE=1"

if not exist "%CUBRIC_PORTABLE_ROOT%\CubricVision.exe" (
  echo CubricVision.exe not found next to this script. Is this a complete portable install?
  pause
  exit /b 2
)

"%CUBRIC_PORTABLE_ROOT%\CubricVision.exe" "%CUBRIC_PORTABLE_ROOT%\update\win-update.cjs" --root "%CUBRIC_PORTABLE_ROOT%"
if errorlevel 1 pause
exit /b %ERRORLEVEL%
