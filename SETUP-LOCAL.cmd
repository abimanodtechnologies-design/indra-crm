@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js 24 LTS first. & pause & exit /b 1)
if not exist "CRM-backend-\node_modules\pg" (
  pushd "CRM-backend-"
  call npm ci
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)
if not exist "CRM\node_modules\vite" (
  pushd "CRM"
  call npm ci
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)
node local-crm.cjs setup
if errorlevel 1 (pause & exit /b 1)
pushd CRM
call npm run build
if errorlevel 1 (popd & pause & exit /b 1)
popd
echo Setup complete. Open local\FIRST-LOGIN.txt for your initial login.
pause
