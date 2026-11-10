$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$tokens=$null;$parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $project 'install/Install-Windows.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw $parseErrors[0]}
foreach($fn in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $fn.Extent.Text}
function Assert($ok,$msg){if(-not $ok){throw $msg}}
# Only NTFS zone streams and deliberate IO faults are mocked; the staging,
# backups, hash checks, replacements and restoration use real files.
function Unblock-File([string]$LiteralPath){Assert (Test-Path -LiteralPath $LiteralPath -PathType Leaf) 'Unblock must target staged file'}
$script:failTarget='';$script:faultUsed=$false
function Move-Item([string]$LiteralPath,[string]$Destination,[switch]$Force){
 if($Destination -eq $script:failTarget -and -not $script:faultUsed){$script:faultUsed=$true;throw 'Injected locked destination'}
 Microsoft.PowerShell.Management\Move-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
}
function Remove-Item([string]$LiteralPath,[switch]$Force,$ErrorAction){
 if($LiteralPath -eq $script:failTarget -and -not $script:faultUsed){$script:faultUsed=$true;throw 'Injected locked legacy AEX'}
 Microsoft.PowerShell.Management\Remove-Item -LiteralPath $LiteralPath -Force:$Force
}
$FixtureOnly=$true;$temp=Join-Path ([IO.Path]::GetTempPath()) ('BridgeNa2 测试 [AE] O''Brien & '+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp|Out-Null
try {
 $ws=Join-Path $temp 'workspace.json';$bridge='C:/Users/测试 用户/AppData/Roaming/Cavalry/Scripts/Cavalry AE Native.js'
 $original='{"windows":[{"mode":2,"children":[{"mode":0,"windowType":"viewport","preserve":42}]}],"keep":{"text":"测试"}}'
 [IO.File]::WriteAllText($ws,$original)
 Set-Workspace $ws $bridge
 $updated=[IO.File]::ReadAllText($ws);$data=$updated|ConvertFrom-Json
 Assert ($data.windows[0].children.Count -eq 2) 'Startup tab missing'
 Assert ($data.windows[0].children[0].preserve -eq 42 -and $data.keep.text -eq '测试') 'User layout altered'
 Set-Workspace $ws $bridge.ToUpper().Replace('/','\');Assert ([IO.File]::ReadAllText($ws) -ceq $updated) 'Duplicate startup tab on case/slash change'
 [IO.File]::WriteAllText($ws,'{"windows":[{"mode":0,"windowType":"viewport"}]}');$before=[IO.File]::ReadAllText($ws)
 try{Set-Workspace $ws $bridge;throw 'Expected workspace rejection'}catch{Assert ([string]$_ -like '*No tab group*') 'Wrong workspace failure'}
 Assert ([IO.File]::ReadAllText($ws) -ceq $before) 'Rejected layout was changed'
 Write-Output 'PASS workspace preservation, Unicode paths, case/slash idempotence and unsupported layout rejection'
 $names=@('bridge.js','workspace.json','renderer.ps1','bootstrap.dll','plugin.aex','old.aex')
 # Fail each replacement after different prefixes have already committed.
 foreach($failureIndex in @(0,1,2,3,4,5,6,7,8)){
  $run=Join-Path $temp ('case'+$failureIndex);$source=Join-Path $run 'source';$dest=Join-Path $run 'dest';$backup=Join-Path $run 'backups'
  New-Item -ItemType Directory -Path $source,$dest|Out-Null
  $entries=@();$originals=@{}
  for($i=0;$i -lt $names.Count;$i++){
   $name=$names[$i];$target=Join-Path $dest $name;$src=Join-Path $source $name
   if($i -ne 3){[IO.File]::WriteAllText($target,('old:'+ $name));$originals[$target]=[IO.File]::ReadAllText($target)}
   if($i -lt 5){[IO.File]::WriteAllText($src,('new:'+ $name));$entries+=@(@{source=$src;target=$target})}else{$entries+=@(@{source=$null;target=$target})}
  }
  $script:faultUsed=$false;$script:failTarget=if($failureIndex -lt 6){$entries[$failureIndex].target}else{''}
  if($failureIndex -eq 6){$entries[4].source=Join-Path $source 'missing.aex'}
  $beforeCommit=if($failureIndex -eq 7){{throw 'Injected app reopened'}}else{{$null}}
  $failed=$false;try{Install-BridgeFiles $entries $backup $beforeCommit}catch{$failed=$true}
  if($failureIndex -eq 8){
   Assert (-not $failed) 'Normal install failed'
   for($i=0;$i -lt 5;$i++){Assert ([IO.File]::ReadAllText($entries[$i].target) -ceq ('new:'+$names[$i])) 'Incomplete success'}
   Assert (-not(Test-Path -LiteralPath $entries[5].target)) 'Legacy AEX not retired'
  }else{
   Assert $failed 'Injected failure unexpectedly succeeded'
   foreach($target in $originals.Keys){Assert ([IO.File]::ReadAllText($target) -ceq $originals[$target]) ('Rollback failed: '+$target)}
   Assert (-not(Test-Path -LiteralPath $entries[3].target)) 'New DLL left behind after failed install'
  }
  Assert (@(Get-ChildItem -LiteralPath $dest -Force|Where-Object {$_.Name -like '.bridge-*'}).Count -eq 0) 'Staged files leaked'
 }
 Write-Output 'PASS real-file installer transaction: every replacement failure rolls back JS/workspace/AEX/renderer, new files removed, staging failures preserve installation'
}finally{Microsoft.PowerShell.Management\Remove-Item -LiteralPath $temp -Recurse -Force}
