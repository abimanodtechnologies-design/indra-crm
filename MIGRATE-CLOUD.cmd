@echo off
cd /d "%~dp0"
echo This downloads a one-time copy of your existing cloud database.
node CRM-backend-\scripts\import-cloud.cjs
pause
