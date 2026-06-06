@echo off
setlocal
set "CUBRIC_PORTABLE_ROOT=%~dp0"
set "CUBRIC_ENGINE_ROOT=%CUBRIC_PORTABLE_ROOT%engine"
set "CUBRIC_MODELS_ROOT=%CUBRIC_PORTABLE_ROOT%models"
set "CUBRIC_USER_DATA_ROOT=%CUBRIC_PORTABLE_ROOT%user-data"
set "MPI_RESOURCES_PATH=%CUBRIC_PORTABLE_ROOT%resources"

pushd "%CUBRIC_PORTABLE_ROOT%app" || exit /b 1
if exist "node_modules\.bin\electron.cmd" (
  call "node_modules\.bin\electron.cmd" .
) else (
  npm start
)
set "CUBRIC_EXIT=%ERRORLEVEL%"
popd
exit /b %CUBRIC_EXIT%
