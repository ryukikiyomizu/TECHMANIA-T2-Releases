@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0TECHMANIA-Updater.ps1"
set "UPDATE_EXIT=%ERRORLEVEL%"
echo.
if not "%UPDATE_EXIT%"=="0" echo Update failed with code %UPDATE_EXIT%.
pause
exit /b %UPDATE_EXIT%
