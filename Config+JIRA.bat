@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem BU × Division matrix: full = every pair; fast = read options + one select per BU
set SF_PART3_MATRIX_MODE=full

rem Jira Bug creation runs automatically when part3-jira-bugs.txt exists and credentials are set.
rem Set JIRA_SKIP_AUTO_PUSH=1 to skip auto-create for a run.

if not exist "node_modules\" (
  echo [WARN] node_modules not found. Run: npm install
  echo Skipping tests. This script still exits successfully.
  set TEST_EXIT=0
  goto :END_OK
)

echo ========================================
echo  Config+JIRA — Playwright + Jira
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

echo ========================================
echo  Jira ^(Part 3 bug drafts — auto-create when credentials exist^)
echo ========================================
echo.
if exist "test-results\part3-jira-bugs.txt" (
  echo Part 3 draft file: test-results\part3-jira-bugs.txt
) else (
  echo No test-results\part3-jira-bugs.txt — Part 3 did not run or had no failing rows.
)
echo.
echo After tests: if drafts exist and JIRA_CLOUD_ID, JIRA_EMAIL, JIRA_API_TOKEN are set, Bug issues are created automatically ^(Relates to QAP-74 unless JIRA_RELATES_TO_KEY is set^).
echo Set JIRA_SKIP_AUTO_PUSH=1 to skip. Manual push: push-part3-jira-bugs.bat or npm run jira:push-part3-bugs
echo.
if not exist "test-results\part3-jira-bugs.txt" goto :AFTER_JIRA_PUSH
if not defined JIRA_CLOUD_ID goto :JIRA_NO_CREDS
if not defined JIRA_EMAIL goto :JIRA_NO_CREDS
if not defined JIRA_API_TOKEN goto :JIRA_NO_CREDS
if /i "%JIRA_SKIP_AUTO_PUSH%"=="1" (
  echo JIRA_SKIP_AUTO_PUSH=1 — skipping automatic Jira Bug creation ^(use push-part3-jira-bugs.bat to push later^).
  goto :AFTER_JIRA_PUSH
)
echo Creating Bug issues from Part 3 drafts...
call node scripts\jira-create-bugs-from-part3.cjs
if errorlevel 1 (
  echo [WARN] Jira Bug step failed; see messages above.
)
goto :AFTER_JIRA_PUSH

:JIRA_NO_CREDS
echo [INFO] Jira credentials not set — skipping auto-create. Set JIRA_CLOUD_ID, JIRA_EMAIL, JIRA_API_TOKEN to create bugs after each run with drafts.

:AFTER_JIRA_PUSH
echo.

if exist "playwright-report\index.html" (
  echo Opening HTML report in Google Chrome ^(video, screenshots, trace^).
  echo Report server runs in this window. Press Ctrl+C when finished, then any key to close.
  echo.
  call node scripts\open-playwright-report-chrome.cjs
  if errorlevel 1 (
    echo [WARN] Could not open report in Chrome — try: npm run report:chrome
  )
) else (
  echo [WARN] playwright-report\index.html not found. Run tests once with HTML reporter enabled.
)

:END_OK
echo.
if "%TEST_EXIT%"=="0" (
  echo Batch finished — all test cases passed.
) else (
  echo Batch finished — one or more test cases failed.
)
echo.
echo Terminal left open — press any key to close this window.
pause >nul
endlocal
exit /b %TEST_EXIT%
