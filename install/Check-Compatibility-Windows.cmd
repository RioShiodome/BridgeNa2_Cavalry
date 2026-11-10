@echo off
setlocal
set "BRIDGE_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if defined PROCESSOR_ARCHITEW6432 set "BRIDGE_POWERSHELL=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%BRIDGE_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Check-Compatibility-Windows.ps1"
set "BRIDGE_RESULT=%ERRORLEVEL%"
pause
exit /b %BRIDGE_RESULT%
