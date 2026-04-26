@echo off
:: setup-worktree.bat — Run as Administrator.
:: Prompts for a worktree path, then creates node_modules and engine symlinks
:: pointing to this repo's copies.

setlocal

set "MAIN=%~dp0"
if "%MAIN:~-1%"=="\" set "MAIN=%MAIN:~0,-1%"

echo === Worktree Symlink Setup ===
echo Main repo: %MAIN%
echo.
set /p WORKTREE="Paste worktree path and press Enter: "

if "%WORKTREE%"=="" (
    echo ERROR: No path entered.
    pause
    exit /b 1
)

if not exist "%WORKTREE%" (
    echo ERROR: Path does not exist: %WORKTREE%
    pause
    exit /b 1
)

echo.

if exist "%WORKTREE%\node_modules" (
    echo [SKIP] node_modules already exists
) else (
    mklink /D "%WORKTREE%\node_modules" "%MAIN%\node_modules"
    echo [OK]   node_modules linked
)

if exist "%WORKTREE%\engine" (
    echo [SKIP] engine already exists
) else (
    mklink /D "%WORKTREE%\engine" "%MAIN%\engine"
    echo [OK]   engine linked
)

echo.
echo Done. Run "npm start" from %WORKTREE%
pause
