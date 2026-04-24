# Stage all changes, commit if needed, push to origin/main.
param(
  [string]$Message = "chore: update project files"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

git add -A
$dirty = git status --porcelain
if (-not $dirty) {
  Write-Host "No changes to commit."
  exit 0
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

git push origin main
exit $LASTEXITCODE
