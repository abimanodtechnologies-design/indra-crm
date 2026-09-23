@echo off
cd /d "%~dp0"
node local-crm.cjs start
if errorlevel 1 pause
