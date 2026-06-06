@echo off
setlocal
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

set "ELECTRON_EXE=%CUBRIC_PORTABLE_ROOT%\app\node_modules\electron\dist\electron.exe"
if exist "%ELECTRON_EXE%" (
  set "ELECTRON_RUN_AS_NODE=1"
  "%ELECTRON_EXE%" "%CUBRIC_PORTABLE_ROOT%\update\apply-update.cjs" -- --root "%CUBRIC_PORTABLE_ROOT%" --bundle "%~f1"
) else (
  node "%CUBRIC_PORTABLE_ROOT%\update\apply-update.cjs" --root "%CUBRIC_PORTABLE_ROOT%" --bundle "%~f1"
)
exit /b %ERRORLEVEL%
