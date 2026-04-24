@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [WARN] node_modules not found. Run: npm install
  echo Skipping tests. This script still exits successfully.
  goto :END_OK
)

echo ========================================
echo  Playwright test run
echo  %date% %time%
echo ========================================
echo.

call npx playwright test
set TEST_EXIT=0
if errorlevel 1 set TEST_EXIT=1

echo.
echo ========================================
if "%TEST_EXIT%"=="0" (
  echo  Outcome: PASS - all test cases passed
) else (
  echo  Outcome: FAIL - one or more test cases failed
)
echo ========================================
echo.

if exist "playwright-report\index.html" (
  echo Opening HTML report in your browser ^(video, screenshots, trace^).
  echo Same terminal: report server runs here. Press Ctrl+C when finished to close the server.
  echo.
  call npx playwright show-report
) else (
  echo [WARN] playwright-report\index.html not found. Run tests once with HTML reporter enabled.
)

:END_OK
echo.
echo Batch finished successfully ^(exit code 0^).
endlocal
exit /b 0
