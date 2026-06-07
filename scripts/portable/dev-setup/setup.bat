@echo off
REM Cubric Studio Vision - DEV/TEST setup (Windows).
REM Only exists in --no-node-modules dev/test builds. Shipped artifacts bundle
REM node_modules and never need this.
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo == Cubric Vision dev/test setup ==

where npm >nul 2>&1
if errorlevel 1 (
  echo !! npm not found. Install Node.js from https://nodejs.org/ then re-run setup.bat
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo ^>^> node %%v

echo ^>^> Installing app dependencies (npm ci) ...
cd /d "%ROOT%app"
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)
cd /d "%ROOT%"

echo.
echo == Setup complete. Launch with start.vbs (or start-with-terminal.bat). ==
