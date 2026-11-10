@echo off
setlocal
set "BRIDGE_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if defined PROCESSOR_ARCHITEW6432 set "BRIDGE_POWERSHELL=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%BRIDGE_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Windows.ps1"
if errorlevel 1 (
 echo Installation did not finish. See the message above.
 pause
 exit /b 1
)
pause
