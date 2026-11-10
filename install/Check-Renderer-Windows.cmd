@echo off
setlocal
set "BRIDGE_PROGRAM_FILES=%ProgramW6432%"
if not defined BRIDGE_PROGRAM_FILES set "BRIDGE_PROGRAM_FILES=%ProgramFiles%"
set "BRIDGE_LAUNCHER=%BRIDGE_PROGRAM_FILES%\Adobe\Common\Plug-ins\7.0\MediaCore\CavalryNative\renderer\launch-windows.ps1"
if not exist "%BRIDGE_LAUNCHER%" (
 echo Install the complete BridgeNa2_Cavalry package first.
 pause
 exit /b 1
)
echo Opening the isolated background Cavalry. Complete any sign-in prompt, then reconnect in AE.
set "BRIDGE_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if defined PROCESSOR_ARCHITEW6432 set "BRIDGE_POWERSHELL=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%BRIDGE_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%BRIDGE_LAUNCHER%" -CacheRoot "%USERPROFILE%\Cavalry AE Native\default" -Inspect
pause
