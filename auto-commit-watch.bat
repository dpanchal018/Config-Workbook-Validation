@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [ERROR] node_modules not found. Run: npm install
  exit /b 1
)

echo Auto-commit watcher: commits on branch main after file changes stop for ~2.5s.
echo Leave this window open while you work. Press Ctrl+C to stop.
echo.

call npm run auto-commit:watch

endlocal
