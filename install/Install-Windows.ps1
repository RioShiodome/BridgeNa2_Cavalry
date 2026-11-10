[CmdletBinding()]
param([switch]$Elevated,[string]$UserAppData=$env:APPDATA,[string]$UserLocalData=$env:LOCALAPPDATA,[switch]$FixtureOnly,[string]$WorkspacePath,[string]$BridgePath)
$ErrorActionPreference='Stop'
function Has-Tab($node,[string]$path) {
 if ($node.windowType -and ([string]$node.windowType).Replace('\','/') -ieq $path.Replace('\','/')) { return $true }
 foreach($child in @($node.children)) { if($child -and (Has-Tab $child $path)){ return $true } };return $false
}
function Add-Tab($node,[string]$path) {
 if($node.mode -eq 2 -and $null -ne $node.children) { $node.children=@($node.children)+@([pscustomobject]@{height=220;width=380;mode=0;windowType=$path});return $true }
 foreach($child in @($node.children)) { if($child -and (Add-Tab $child $path)){return $true} };return $false
}
function Set-Workspace([string]$path,[string]$bridge) {
 if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Start and close Cavalry once, then run the installer again. Its workspace does not exist yet.'}
 $original=[IO.File]::ReadAllText($path);$data=$original|ConvertFrom-Json
 if(-not $data.windows){throw 'Unknown workspace format; existing layout was not changed.'}
 foreach($w in $data.windows){if(Has-Tab $w $bridge){return}}
 $added=$false;foreach($w in $data.windows){if(Add-Tab $w $bridge){$added=$true;break}}
 if(-not $added){throw 'No tab group found; existing layout was not changed.'}
 $backup=Join-Path (Split-Path -Parent $path) 'AE Native Backups';New-Item -ItemType Directory -Path $backup -Force|Out-Null
 Copy-Item -LiteralPath $path -Destination (Join-Path $backup ('workspace-'+[Guid]::NewGuid().ToString('N')+'.json'))
 $temp=$path+'.native-tmp';[IO.File]::WriteAllText($temp,($data|ConvertTo-Json -Depth 100),(New-Object Text.UTF8Encoding($false)))
 $null=[IO.File]::ReadAllText($temp)|ConvertFrom-Json
 if(-not $FixtureOnly -and (Get-Process -Name Cavalry -ErrorAction SilentlyContinue)){Remove-Item -LiteralPath $temp;throw 'Cavalry reopened during setup. Close it and try again.'}
 Move-Item -LiteralPath $temp -Destination $path -Force
}
if($FixtureOnly){Set-Workspace $WorkspacePath $BridgePath;exit 0}
function Install-BridgeFiles($entries,[string]$backupDir,[scriptblock]$beforeCommit) {
 # Stage and verify every component before replacing any installed file.
 # The JS and startup workspace participate in the same rollback as the AEX.
 $nonce=[Guid]::NewGuid().ToString('N');$jobs=@();$touched=@()
 New-Item -ItemType Directory -Path $backupDir -Force|Out-Null
 try {
  foreach($entry in $entries){
   $target=[string]$entry.target;$folder=Split-Path -Parent $target
   New-Item -ItemType Directory -Path $folder -Force|Out-Null
   $job=[pscustomobject]@{target=$target;stage=$null;backup=$null};$jobs+=@($job)
   if(Test-Path -LiteralPath $target){
    if(-not(Test-Path -LiteralPath $target -PathType Leaf)){throw ('Expected a file: '+$target)}
    $job.backup=Join-Path $backupDir ((Split-Path -Leaf $target)+'-'+$nonce+'.disabled')
    Copy-Item -LiteralPath $target -Destination $job.backup
    if((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $job.backup).Hash){throw 'Installation backup verification failed.'}
   }
   if($entry.source){
    $job.stage=Join-Path $folder ('.bridge-'+$nonce+'-'+$jobs.Count+'.disabled')
    Copy-Item -LiteralPath $entry.source -Destination $job.stage
    if((Get-FileHash -LiteralPath $entry.source).Hash -ne (Get-FileHash -LiteralPath $job.stage).Hash){throw 'Installation copy verification failed.'}
    Unblock-File -LiteralPath $job.stage
   }
  }
  if($beforeCommit){& $beforeCommit}
  foreach($job in $jobs){
   $touched+=@($job)
   if($job.stage){Move-Item -LiteralPath $job.stage -Destination $job.target -Force}
   elseif($job.backup){Remove-Item -LiteralPath $job.target -Force}
  }
 } catch {
  $failure=$_;$rollbackErrors=@()
  for($i=$touched.Count-1;$i -ge 0;$i--){
   $job=$touched[$i]
   try {
    if($job.backup){
     # An unsuccessful move can leave a locked original intact. Don't rewrite it.
     if(-not(Test-Path -LiteralPath $job.target -PathType Leaf) -or (Get-FileHash -LiteralPath $job.target).Hash -ne (Get-FileHash -LiteralPath $job.backup).Hash){Copy-Item -LiteralPath $job.backup -Destination $job.target -Force}
    }elseif(Test-Path -LiteralPath $job.target -PathType Leaf){Remove-Item -LiteralPath $job.target -Force}
   }catch{$rollbackErrors+=@([string]$_)}
  }
  if($rollbackErrors.Count){throw ('Install failed: '+$failure+'; restore from '+$backupDir+'. Rollback errors: '+($rollbackErrors -join '; '))}
  throw $failure
 } finally {
  foreach($job in $jobs){if($job.stage -and (Test-Path -LiteralPath $job.stage)){Remove-Item -LiteralPath $job.stage -Force -ErrorAction SilentlyContinue}}
 }
}
try {
 if(-not [Environment]::Is64BitOperatingSystem){throw 'Windows x64 is required.'}
 if(-not [Environment]::Is64BitProcess){throw 'Use Install-Windows.cmd to run the 64-bit Windows PowerShell installer.'}
 $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
 if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
  if($Elevated){throw 'Administrator access is needed for the Adobe shared plug-in folder.'}
  $argsList=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Elevated','-UserAppData',('"'+$UserAppData+'"'),'-UserLocalData',('"'+$UserLocalData+'"'))
  $systemPowerShell=Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
  $child=Start-Process -FilePath $systemPowerShell -Verb RunAs -ArgumentList $argsList -PassThru -Wait
  exit $child.ExitCode
 }
 $package=Split-Path -Parent $PSScriptRoot;$source=Join-Path $package 'plugin\BridgeNa2_Cavalry.aex';$js=Join-Path $package 'cavalry\Cavalry AE Native.js';$helper=Join-Path $package 'plugin\renderer\launch-windows.ps1'
 if(-not(Test-Path -LiteralPath $source -PathType Leaf) -or -not(Test-Path -LiteralPath $js -PathType Leaf) -or -not(Test-Path -LiteralPath $helper -PathType Leaf)){throw 'Extract the complete Windows 4.6.4 package first, including its renderer folder.'}
 $bootstrap=Join-Path $package 'plugin\renderer\qttestability.dll'
 if(-not(Test-Path -LiteralPath $bootstrap -PathType Leaf)){throw 'Missing renderer/qttestability.dll. Extract the complete package.'}
 Add-Type -AssemblyName System.Windows.Forms
 if((Get-Process -Name Cavalry,AfterFX -ErrorAction SilentlyContinue)){
  [System.Windows.Forms.MessageBox]::Show('Please save and normally close After Effects and Cavalry. Setup will wait. It will not close or save your projects automatically.','BridgeNa2_Cavalry Setup')|Out-Null
  $deadline=[DateTime]::UtcNow.AddMinutes(10)
  while(Get-Process -Name Cavalry,AfterFX -ErrorAction SilentlyContinue){if([DateTime]::UtcNow -gt $deadline){throw 'Timed out waiting for the apps to close; run setup again when ready.'};Start-Sleep -Milliseconds 500}
 }
 $scripts=Join-Path $UserAppData 'Cavalry\Scripts';$bridge=Join-Path $scripts 'Cavalry AE Native.js';New-Item -ItemType Directory -Path $scripts -Force|Out-Null
 $backups=Join-Path $UserAppData 'Cavalry\AE Native Backups';New-Item -ItemType Directory -Path $backups -Force|Out-Null
 $workspace=Join-Path $UserLocalData 'Cavalry\workspace.json'
 if(-not(Test-Path -LiteralPath $workspace -PathType Leaf)){throw 'Start and close Cavalry once, then run the installer again. Its workspace does not exist yet.'}
 $prepared=Join-Path $backups ('workspace-prepared-'+[Guid]::NewGuid().ToString('N')+'.json')
 Copy-Item -LiteralPath $workspace -Destination $prepared
 Set-Workspace $prepared ($bridge.Replace('\','/'))
 $programFilesRoot=$env:ProgramW6432;if(-not $programFilesRoot){$programFilesRoot=$env:ProgramFiles}
 $destDir=Join-Path $programFilesRoot 'Adobe\Common\Plug-ins\7.0\MediaCore\CavalryNative';New-Item -ItemType Directory -Path $destDir -Force|Out-Null
 $dest=Join-Path $destDir 'BridgeNa2_Cavalry.aex'
 $rendererDir=Join-Path $destDir 'renderer';New-Item -ItemType Directory -Path $rendererDir -Force|Out-Null
 $helperDest=Join-Path $rendererDir 'launch-windows.ps1'
 $bootstrapDest=Join-Path $rendererDir 'qttestability.dll'
 $entries=@(
  @{source=$js;target=$bridge},@{source=$prepared;target=$workspace},
  @{source=$helper;target=$helperDest},@{source=$bootstrap;target=$bootstrapDest},
  @{source=$source;target=$dest},@{source=$null;target=(Join-Path $destDir 'CavalryNative.aex')}
 )
 Install-BridgeFiles $entries $backups {
  if(Get-Process -Name Cavalry,AfterFX -ErrorAction SilentlyContinue){throw 'An app reopened during setup. Close AE and Cavalry and try again.'}
 }
 Remove-Item -LiteralPath $prepared
 [System.Windows.Forms.MessageBox]::Show('Installed. Open Cavalry and AE. Add Cavalry > BridgeNa2_Cavalry to a solid, set Duration, and click Connect. Or run the included Create Layer JSX.','BridgeNa2_Cavalry Setup')|Out-Null
} catch {Write-Error $_;exit 1}
