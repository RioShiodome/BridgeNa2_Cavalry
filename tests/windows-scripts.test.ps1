# Portable structural checks. Run with PowerShell; Win32 calls are not invoked.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
function Assert($ok,[string]$message){if(-not $ok){throw $message}}
foreach($path in @('renderer/launch-windows.ps1','install/Install-Windows.ps1','install/Check-Compatibility-Windows.ps1')){
 $tokens=$null;$parseErrors=$null
 $ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $project $path),[ref]$tokens,[ref]$parseErrors)
 Assert ($parseErrors.Count -eq 0) ('PowerShell parse failed: '+$path+'; '+$parseErrors)
 if($path -eq 'renderer/launch-windows.ps1'){
  $code=$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.Contains('public sealed class BridgeNa2Child')},$true)[0].Value
  Add-Type -TypeDefinition $code
  Assert ([IntPtr]::Size -eq 8) 'Run ABI checks using a 64-bit PowerShell process'
  $sizes=@{STARTUPINFO=104;PROCESSINFO=24;BASICLIMIT=64;IOCOUNTERS=48;EXTENDEDLIMIT=144}
  foreach($name in $sizes.Keys){
   $type=[BridgeNa2Child].GetNestedType($name,[Reflection.BindingFlags]::NonPublic)
   Assert ([Runtime.InteropServices.Marshal]::SizeOf([type]$type) -eq $sizes[$name]) ('Win64 ABI mismatch: '+$name)
  }
  Write-Output 'PASS embedded C# compilation and Win64 structure sizes (no Windows API execution)'
 }
 if($path -eq 'install/Check-Compatibility-Windows.ps1'){
  foreach($fn in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $fn.Extent.Text}
 }
 Write-Output ('PASS syntax: '+$path)
}
# Capture diagnostics while using the real PE/checksum functions and file IO.
function Result([string]$level,[string]$message){if($level -eq 'FAIL'){$script:problems++}}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('BridgeNa2 校验 [AE] '+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp|Out-Null
try {
 $script:problems=0
 Check-PE (Join-Path $project 'build/out/BridgeNa2_Cavalry.aex');Check-PE (Join-Path $project 'build/out/qttestability.dll')
 Assert ($script:problems -eq 0) 'Built binary is missing or is not x64'
 $bad=Join-Path $temp 'broken.aex';[IO.File]::WriteAllBytes($bad,[byte[]](0,1,2));Check-PE $bad
 Assert ($script:problems -eq 1) 'Truncated PE accepted'
 $bytes=New-Object byte[] 128;$bytes[0]=0x4d;$bytes[1]=0x5a
 [BitConverter]::GetBytes([int]2147483647).CopyTo($bytes,60);[IO.File]::WriteAllBytes($bad,$bytes);Check-PE $bad
 Assert ($script:problems -eq 2) 'Out-of-bounds PE accepted'
 $file=Join-Path $temp '动画 O''Brien & test.js';[IO.File]::WriteAllText($file,'first')
 $manifest=Join-Path $temp 'SHA256SUMS.txt';$hash=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText($manifest,($hash+'  '+(Split-Path -Leaf $file)))
 $script:problems=0;Check-Package $temp;Assert ($script:problems -eq 0) 'Valid package rejected'
 [IO.File]::WriteAllText($file,'changed');Check-Package $temp;Assert ($script:problems -gt 0) 'Changed file accepted'
 foreach($relative in @('../outside','sub\..\outside','C:\outside','C:outside','/outside','\\server\share\outside')){
  [IO.File]::WriteAllText($manifest,($hash+'  '+$relative));$rejected=$false
  try{Check-Package $temp}catch{$rejected=$true}
  Assert $rejected ('Invalid manifest path accepted: '+$relative)
 }
 [IO.File]::WriteAllText($manifest,'');$script:problems=0;Check-Package $temp;Assert ($script:problems -gt 0) 'Empty manifest accepted'
 Write-Output 'PASS diagnostic checks: x64 PE, malformed PE, Unicode paths, checksums, changed files and path traversal'
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}
