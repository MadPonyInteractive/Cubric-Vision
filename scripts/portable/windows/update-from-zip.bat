@echo off
setlocal
set "CUBRIC_PORTABLE_ROOT=%~dp0"
set "MPI_RESOURCES_PATH=%CUBRIC_PORTABLE_ROOT%resources"
if "%~1"=="" (
  echo Usage: update-from-zip.bat path\to\CubricVision-update.zip
  exit /b 2
)
if not exist "%~1" (
  echo Update bundle not found: %~1
  exit /b 2
)
echo Cubric Vision local update validation skeleton.
echo Portable root: %CUBRIC_PORTABLE_ROOT%
echo Bundle: %~f1
echo Manifest: %MPI_RESOURCES_PATH%\cubric\update-manifest.json
echo No files were changed.
exit /b 2
