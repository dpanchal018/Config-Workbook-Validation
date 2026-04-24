@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [ERROR] node_modules not found. Run: npm install
  echo.
  exit /b 1
)

echo ========================================
echo  Playwright test run
echo  %date% %time%
echo ========================================
echo.

call npx playwright test --reporter=list

echo.
echo ========================================
if errorlevel 1 (
  echo  Outcome: FAIL - one or more test cases failed
  echo ========================================
  exit /b 1
)

echo  Outcome: PASS - all test cases passed
echo ========================================
exit /b 0
