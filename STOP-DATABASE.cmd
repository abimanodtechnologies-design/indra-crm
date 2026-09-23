@echo off
cd /d "%~dp0"
node local-crm.cjs stop-db
pause
