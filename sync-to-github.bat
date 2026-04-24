@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Usage: sync-to-github.bat
REM    or: sync-to-github.bat Your commit message here

set "MSG=%*"
if "%MSG%"=="" set "MSG=chore: update project files"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-github.ps1" -Message "%MSG%"

endlocal
exit /b %ERRORLEVEL%
