@echo off
REM Workflow-generation orchestrator. Run after dropping an updated source
REM workflow in the App folder. Rebuilds only changed sources.
REM   generate.bat        rebuild changed only
REM   generate.bat --all  force full rebuild
python "%~dp0orchestrate.py" %*
pause
