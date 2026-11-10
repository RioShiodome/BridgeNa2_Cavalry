@echo off
setlocal
echo Reading BridgeNa2 cache with the plug-in PNG decoder. No apps will be started.
"%~dp0Check-Preview-Windows.exe" --out "%~dp0Preview-Report"
if errorlevel 1 (
 echo Check failed. Keep the message above.
 pause
 exit /b 1
)
echo Done. Open the BMP previews and Preview-Report.txt in the Preview-Report folder.
start "" "%~dp0Preview-Report"
pause
