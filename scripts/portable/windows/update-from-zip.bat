@echo off
setlocal
rem Cubric Studio Vision - offline updater (Windows). Applies an update .zip you
rem already have on disk. Smart App Control blocks this file on a clean Windows 11
rem install; those users update from inside the app instead (MPI-387).
set "CUBRIC_PORTABLE_ROOT=%~dp0."
set "MPI_RESOURCES_PATH=%CUBRIC_PORTABLE_ROOT%\resources"
if "%~1"=="" (
  echo Usage: update-from-zip.bat path\to\CubricVision-update.zip
  exit /b 2
)
if not exist "%~1" (
  echo Update bundle not found: %~1
  exit /b 2
)

rem The portable install's only guaranteed runtime is the app itself. Since the
rem standard-Electron relayout that binary is CubricVision.exe at the root, not a
rem nested node_modules\electron\dist\electron.exe.
set "ELECTRON_EXE=%CUBRIC_PORTABLE_ROOT%\CubricVision.exe"
if exist "%ELECTRON_EXE%" (
  set "ELECTRON_RUN_AS_NODE=1"
  "%ELECTRON_EXE%" "%CUBRIC_PORTABLE_ROOT%\update\apply-update.cjs" -- --root "%CUBRIC_PORTABLE_ROOT%" --bundle "%~f1"
) else (
  node "%CUBRIC_PORTABLE_ROOT%\update\apply-update.cjs" --root "%CUBRIC_PORTABLE_ROOT%" --bundle "%~f1"
)
exit /b %ERRORLEVEL%
