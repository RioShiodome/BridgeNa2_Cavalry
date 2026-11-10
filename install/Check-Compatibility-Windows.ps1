# Read-only environment/package check. Does not start apps, render, or edit settings.
$ErrorActionPreference='Stop'
$script:problems=0
function Result([string]$level,[string]$message){Write-Host ('['+$level+'] '+$message);if($level -eq 'FAIL'){$script:problems++}}
function Check-PE([string]$path){
 if(-not(Test-Path -LiteralPath $path -PathType Leaf)){Result 'FAIL' ('Missing: '+$path);return}
 $bytes=[IO.File]::ReadAllBytes($path)
 if($bytes.Length -lt 64 -or [BitConverter]::ToUInt16($bytes,0) -ne 0x5a4d){Result 'FAIL' ('Invalid PE: '+$path);return}
 $offset=[BitConverter]::ToInt32($bytes,0x3c)
 if($offset -lt 0 -or $offset+26 -gt $bytes.Length -or [BitConverter]::ToUInt32($bytes,$offset) -ne 0x4550 -or [BitConverter]::ToUInt16($bytes,$offset+4) -ne 0x8664){Result 'FAIL' ('Expected Windows x64 PE: '+$path);return}
 Result 'OK' ('x64 binary: '+(Split-Path -Leaf $path))
}
function Check-Package([string]$package){
 $manifest=Join-Path $package 'SHA256SUMS.txt'
 if(-not(Test-Path -LiteralPath $manifest -PathType Leaf)){Result 'FAIL' 'SHA256SUMS.txt is missing. Extract the complete package.';return}
 $checked=0
 foreach($line in [IO.File]::ReadAllLines($manifest)){
  if($line -notmatch '^([a-f0-9]{64})  (.+)$'){throw 'Invalid package checksum list.'}
  $hash=$Matches[1];$relative=$Matches[2]
  if([IO.Path]::IsPathRooted($relative) -or ($relative -match '^[A-Za-z]:|^[\\/]') -or (($relative -split '[\\/]') -contains '..')){throw 'Invalid checksum path.'}
  $file=Join-Path $package $relative
  if(-not(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $hash){Result 'FAIL' ('Package mismatch: '+$relative)}else{$checked++}
 }
 if($checked -eq 0){Result 'FAIL' 'Package checksum list contains no matching files.'}
 Result 'INFO' ($checked.ToString()+' package files match SHA-256 checksums.')
}
try {
 Write-Host 'BridgeNa2_Cavalry 4.6.4 - Windows compatibility check'
 if(-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess){throw 'Use this package on Windows x64 via Check-Compatibility-Windows.cmd.'}
 $os=Get-CimInstance -ClassName Win32_OperatingSystem
 if([version]$os.Version -lt [version]'10.0'){Result 'FAIL' 'Windows 10 or later is required.'}else{Result 'OK' ($os.Caption+' / '+$os.Version+' / '+$os.OSArchitecture)}
 if($env:PROCESSOR_ARCHITECTURE -ne 'AMD64'){Result 'WARN' 'This package targets x64. ARM64 emulation has not been validated.'}
 Result 'OK' ('PowerShell '+$PSVersionTable.PSVersion+' / .NET '+[Environment]::Version)
 $package=Split-Path -Parent $PSScriptRoot
 $payload=@('plugin\BridgeNa2_Cavalry.aex','plugin\renderer\qttestability.dll','plugin\renderer\launch-windows.ps1','cavalry\Cavalry AE Native.js')
 Check-PE (Join-Path $package $payload[0]);Check-PE (Join-Path $package $payload[1])
 Check-Package $package
 $programFilesRoot=$env:ProgramW6432;if(-not $programFilesRoot){$programFilesRoot=$env:ProgramFiles}
 $installed=Join-Path $programFilesRoot 'Adobe\Common\Plug-ins\7.0\MediaCore\CavalryNative'
 $installedFiles=@((Join-Path $installed 'BridgeNa2_Cavalry.aex'),(Join-Path $installed 'renderer\qttestability.dll'),(Join-Path $installed 'renderer\launch-windows.ps1'),(Join-Path $env:APPDATA 'Cavalry\Scripts\Cavalry AE Native.js'))
 for($i=0;$i -lt $payload.Count;$i++){
  $source=Join-Path $package $payload[$i];$target=$installedFiles[$i]
  if(-not(Test-Path -LiteralPath $target -PathType Leaf)){Result 'WARN' ('Not installed: '+$target)}
  elseif((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash){Result 'FAIL' ('Installed version differs from package: '+$target)}
  else{Result 'OK' ('Installed file matches: '+(Split-Path -Leaf $target))}
 }
 $profile=[Environment]::GetFolderPath('UserProfile');$root=Join-Path $profile 'Cavalry AE Native\default'
 if($profile.TrimEnd('\') -ine $env:USERPROFILE.TrimEnd('\')){Result 'FAIL' 'USERPROFILE differs from the Windows profile folder. AE and Cavalry must run as the same normal user.'}
 Result 'INFO' ('Cache: '+$root)
 $workspace=Join-Path $env:LOCALAPPDATA 'Cavalry\workspace.json'
 if(-not(Test-Path -LiteralPath $workspace)){Result 'WARN' 'Cavalry workspace missing. Open and close Cavalry once before installation.'}
 $config=Join-Path $root 'renderer-config.json'
 if(Test-Path -LiteralPath $config){
  $c=[IO.File]::ReadAllText($config)|ConvertFrom-Json;$exe=Join-Path (Split-Path -Parent $c.assets) 'Cavalry.exe';Check-PE $exe
  $health=Join-Path $root 'renderer-health.json'
  if(Test-Path -LiteralPath $health){$h=[IO.File]::ReadAllText($health)|ConvertFrom-Json;Result 'INFO' ('Last background state: '+$h.phase+'; '+$h.error+'; timestamp='+$h.stamp)}
 }else{Result 'INFO' 'No background configuration yet. Choose a composition in AE after installation.'}
 Result 'INFO' 'These checks do not prove AE playback, GPU support or Cavalry sign-in. Use Check-Renderer-Windows.cmd for the background login window.'
} catch {Result 'FAIL' ([string]$_)}
if($script:problems -gt 0){Write-Host ('Found '+$script:problems+' problem(s).');exit 1}
Write-Host 'File and environment checks finished. Review any WARN entries above.'
