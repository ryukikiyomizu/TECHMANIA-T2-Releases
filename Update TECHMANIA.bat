@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0MXGG-TECHMANIA-Launcher.exe" if exist "%~dp0TECHMANIA-Launcher.exe" move /y "%~dp0TECHMANIA-Launcher.exe" "%~dp0MXGG-TECHMANIA-Launcher.exe" >nul
if exist "%~dp0MXGG-TECHMANIA-Launcher.exe" (
  if exist "%~dp0TECHMANIA-Launcher.exe" del /f /q "%~dp0TECHMANIA-Launcher.exe" >nul 2>&1
  start "" "%~dp0MXGG-TECHMANIA-Launcher.exe"
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0TECHMANIA-Updater.ps1"
set "UPDATE_EXIT=%ERRORLEVEL%"
echo.
if not "%UPDATE_EXIT%"=="0" echo Update failed with code %UPDATE_EXIT%.
pause
exit /b %UPDATE_EXIT%
