@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [WARN] node_modules not found. Run: npm install
  exit /b 1
)

echo Push Part 3 bug drafts to Jira as Bug issues linked to the story/ticket.
echo Requires: JIRA_CLOUD_ID, JIRA_EMAIL, JIRA_API_TOKEN ^(optional: JIRA_RELATES_TO_KEY, default QAP-74^)
echo.

node scripts\jira-create-bugs-from-part3.cjs
set EXIT=%ERRORLEVEL%

endlocal
exit /b %EXIT%
