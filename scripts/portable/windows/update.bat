@echo off
setlocal
set "CUBRIC_PORTABLE_ROOT=%~dp0."
set "MPI_RESOURCES_PATH=%CUBRIC_PORTABLE_ROOT%\resources"
set "CUBRIC_GITHUB_REPO_DEFAULT=MadPonyInteractive/Cubric-Vision"
if "%CUBRIC_GITHUB_REPO%"=="" set "CUBRIC_GITHUB_REPO=%CUBRIC_GITHUB_REPO_DEFAULT%"
set "DOWNLOAD_DIR=%CUBRIC_PORTABLE_ROOT%\update\downloads"
if not exist "%DOWNLOAD_DIR%" mkdir "%DOWNLOAD_DIR%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$repo=$env:CUBRIC_GITHUB_REPO; $pattern='CubricVision-windows-x64-update-v*.zip'; $outDir=$env:DOWNLOAD_DIR; $release=Invoke-RestMethod -Headers @{ 'User-Agent'='CubricVision-Updater' } -Uri ('https://api.github.com/repos/'+$repo+'/releases/latest'); $asset=$release.assets | Where-Object { $_.name -like $pattern } | Select-Object -First 1; if (-not $asset) { throw ('No matching update asset found: '+$pattern) }; $target=Join-Path $outDir $asset.name; Invoke-WebRequest -Headers @{ 'User-Agent'='CubricVision-Updater' } -Uri $asset.browser_download_url -OutFile $target; Write-Output $target" > "%DOWNLOAD_DIR%\latest-update-path.txt"
if errorlevel 1 exit /b %ERRORLEVEL%
set /p UPDATE_ZIP=<"%DOWNLOAD_DIR%\latest-update-path.txt"
call "%CUBRIC_PORTABLE_ROOT%\update-from-zip.bat" "%UPDATE_ZIP%"
exit /b %ERRORLEVEL%
