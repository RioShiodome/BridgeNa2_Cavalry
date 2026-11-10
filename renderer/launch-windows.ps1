param([Parameter(Mandatory=$true)][string]$CacheRoot,[int]$OwnerProcessId=0,[switch]$Inspect)
$ErrorActionPreference='Stop'
$utf8=New-Object Text.UTF8Encoding($false)
function Read-Json([string]$p){try{return ([IO.File]::ReadAllText($p)|ConvertFrom-Json)}catch{return $null}}
function Write-Json([string]$p,$value){$temp=$p+'.supervisor-tmp';[IO.File]::WriteAllText($temp,($value|ConvertTo-Json -Depth 100 -Compress),$utf8);if([IO.File]::Exists($p)){[IO.File]::Replace($temp,$p,$null)}else{[IO.File]::Move($temp,$p)}}
function Same-Path([string]$a,[string]$b){return [string]::Equals([IO.Path]::GetFullPath($a).TrimEnd('\','/'),[IO.Path]::GetFullPath($b).TrimEnd('\','/'),[StringComparison]::OrdinalIgnoreCase)}
function Private-Path([string]$path){
 foreach($folder in @([Environment]::GetFolderPath('LocalApplicationData'),[Environment]::GetFolderPath('ApplicationData'))){
  $prefix=$folder.TrimEnd('\','/')+'\';$full=[IO.Path]::GetFullPath($path)
  if($full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){return Join-Path (Join-Path $folder 'qttest') $full.Substring($prefix.Length)}
 }
 throw 'Cavalry settings are outside standard Windows AppData; safe isolation is unavailable.'
}
function Rewrite-Workspace($node,[string]$script,[ref]$added){
 if($node.windowType -and ([string]$node.windowType).IndexOfAny([char[]]'\/') -ge 0){if($added.Value){$node.windowType='messageBar'}else{$node.windowType=$script;$added.Value=$true}}
 foreach($child in @($node.children)){if($child){Rewrite-Workspace $child $script $added}}
}
function Read-EditorState {
 try{$a=([IO.File]::ReadAllText((Join-Path $CacheRoot 'state.txt'))).Replace("`r",'').Split("`n");if($a.Length -eq 12 -and $a[0] -eq 'CAVALRY_NATIVE_4' -and $a[10] -eq 'END'){return @{owner=$a[1];stamp=[long]$a[3];phase=$a[4]}}}catch{};return $null
}
function Fresh-Show($show){$now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();return ($show -and $show.id -and $now-$show.stamp -lt 30000 -and $show.stamp -le $now+3000)}
$stopReason='';$failed=$false;$editorOwner='';$editors=@();$inspection=$false;$session=[Guid]::NewGuid().ToString('N');$owner=$null;$renderer=$null;$lock=$null;$ownsLock=$false
function Health([string]$phase,[string]$errorText=''){$child=0;if($renderer -and $renderer.Running){$child=$renderer.ProcessId};Write-Json (Join-Path $CacheRoot 'renderer-health.json') @{phase=$phase;error=$errorText;stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();supervisor=$PID;child=$child;session=$session;inspection=$inspection;reason=$stopReason}}
# Standard Win32 process creation, separate desktop and job ownership only.
# Qt loads qttestability.dll itself. No process injection or system changes.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Diagnostics;
public sealed class BridgeNa2Child : IDisposable {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO {public int cb;public string reserved,desktop,title;public int x,y,xsize,ysize,xchars,ychars,fill,flags;public short show,cbReserved;public IntPtr reserved2,input,output,error;}
 [StructLayout(LayoutKind.Sequential)] struct PROCESSINFO {public IntPtr process,thread;public int pid,tid;}
 [StructLayout(LayoutKind.Sequential)] struct BASICLIMIT {public long perProcess,perJob;public uint flags;public UIntPtr minWorking,maxWorking;public uint active;public UIntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IOCOUNTERS {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct EXTENDEDLIMIT {public BASICLIMIT basic;public IOCOUNTERS io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,int flags,uint access,IntPtr security);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desk);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,System.Text.StringBuilder command,IntPtr psa,IntPtr tsa,bool inherit,uint flags,IntPtr env,string directory,ref STARTUPINFO startup,out PROCESSINFO info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref EXTENDEDLIMIT data,int size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 IntPtr desk,job,process;public int ProcessId {get;private set;}
 static void Check(bool ok){if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error());}
 public bool Running {get{return process!=IntPtr.Zero&&WaitForSingleObject(process,0)==258;}}
 public uint ExitCode {get{uint code=0;return process!=IntPtr.Zero&&GetExitCodeProcess(process,out code)?code:0;}}
 delegate bool WindowCallback(IntPtr window,IntPtr state);
 [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback,IntPtr state);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int mode);
 public void Hide(){EnumWindows(delegate(IntPtr window,IntPtr state){uint id;GetWindowThreadProcessId(window,out id);if(id==(uint)ProcessId)ShowWindow(window,0);return true;},IntPtr.Zero);}
 public BridgeNa2Child(string executable,string directory,bool visible){
  try {
   string name="winsta0\\default";if(!visible){name="BridgeNa2-"+Guid.NewGuid().ToString("N");desk=CreateDesktop(name,IntPtr.Zero,IntPtr.Zero,0,0x10000000,IntPtr.Zero);Check(desk!=IntPtr.Zero);}
   job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero);var limit=new EXTENDEDLIMIT();limit.basic.flags=0x2000;Check(SetInformationJobObject(job,9,ref limit,Marshal.SizeOf(typeof(EXTENDEDLIMIT))));
   var startup=new STARTUPINFO();startup.cb=Marshal.SizeOf(typeof(STARTUPINFO));startup.desktop=name;startup.flags=1;startup.show=(short)(visible?5:0);PROCESSINFO child;
   // Windows 10 supports nested jobs. BREAKAWAY_FROM_JOB can be rejected when
   // the launching app is already managed by a non-breakaway parent job.
   Check(CreateProcess(executable,new System.Text.StringBuilder("\""+executable+"\""),IntPtr.Zero,IntPtr.Zero,false,0x00000004,IntPtr.Zero,directory,ref startup,out child));process=child.process;ProcessId=child.pid;
   try{Check(AssignProcessToJobObject(job,process));Check(ResumeThread(child.thread)!=0xffffffff);}finally{CloseHandle(child.thread);}
  }catch{Dispose();throw;}
 }
 public void Dispose(){if(process!=IntPtr.Zero){if(Running){TerminateProcess(process,0);WaitForSingleObject(process,5000);}CloseHandle(process);process=IntPtr.Zero;}if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}if(desk!=IntPtr.Zero){CloseDesktop(desk);desk=IntPtr.Zero;}}
}
'@
try {
 if(-not [Environment]::Is64BitProcess){throw 'The renderer requires 64-bit Windows PowerShell. Use the packaged CMD launcher.'}
 if($OwnerProcessId -gt 0){$owner=[Diagnostics.Process]::GetProcessById($OwnerProcessId)}elseif(-not $Inspect){throw 'Renderer owner is not running.'}
 if($Inspect){Write-Json (Join-Path $CacheRoot 'renderer-show.json') @{id=$session;stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}}
 $lock=New-Object Threading.Mutex($false,'Local\BridgeNa2_Cavalry_Renderer_4')
 try{$ownsLock=$lock.WaitOne(0)}catch [Threading.AbandonedMutexException]{$ownsLock=$true}
 if(-not $ownsLock){exit 0}
 $show=Read-Json (Join-Path $CacheRoot 'renderer-show.json');$lastShow='';if(Fresh-Show $show){$lastShow=$show.id;$inspection=$true}
 $initialJob=Read-Json (Join-Path $CacheRoot 'renderer-job.json');$inspectionJob=$initialJob.id
 $initialEditor=Read-EditorState;if($initialEditor){$editorOwner=$initialEditor.owner}
 if(-not $inspection -and $initialEditor -and ($initialEditor.phase -eq 'offline' -or [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$initialEditor.stamp -gt 15000)){$stopReason='editor-offline';return}
 Health 'starting'
 $config=Read-Json (Join-Path $CacheRoot 'renderer-config.json')
 if(-not $config -or -not(Same-Path $config.root $CacheRoot)){throw 'Invalid renderer configuration.'}
 $installDir=Split-Path -Parent $config.assets;$executable=Join-Path $installDir 'Cavalry.exe'
 if(-not(Test-Path -LiteralPath $executable -PathType Leaf)){throw 'Cavalry.exe was not found beside its assets folder.'}
 $preferences=Private-Path $config.preferences;$appData=Private-Path $config.appData;$scripts=Join-Path $appData 'Scripts';$bootstrap=Join-Path $scripts 'Cavalry AE Native.js';$role=Join-Path $preferences 'BridgeNa2-renderer.json'
 foreach($folder in @($preferences,$appData)){if((Test-Path -LiteralPath $folder) -and (Get-ChildItem -LiteralPath $folder -Force|Select-Object -First 1) -and -not(Test-Path -LiteralPath $role)){throw 'The Qt test profile already contains other settings; it was left unchanged.'}}
 New-Item -ItemType Directory -Path $preferences,$scripts -Force|Out-Null
 Copy-Item -LiteralPath $config.script -Destination $bootstrap -Force
 if(-not(Test-Path -LiteralPath (Join-Path $preferences 'preferences.json'))){Copy-Item -LiteralPath (Join-Path $config.preferences 'preferences.json') -Destination (Join-Path $preferences 'preferences.json')}
 $workspace=Read-Json (Join-Path $config.preferences 'workspace.json');$added=$false
 foreach($window in $workspace.windows){Rewrite-Workspace $window ($bootstrap.Replace('\','/')) ([ref]$added)}
 if(-not $added){throw 'Cavalry startup tab missing. Run the complete installer again.'}
 Write-Json (Join-Path $preferences 'workspace.json') $workspace
 $version=Read-Json (Join-Path $config.preferences 'wsv.json');if(-not $version){$version=@{workspaceVersion=1.2}};Write-Json (Join-Path $preferences 'wsv.json') $version
 $roleData=@{root=$CacheRoot.Replace('\','/');profile=(Split-Path -Parent $preferences).Replace('\','/');preferences=$preferences.Replace('\','/');appData=$appData.Replace('\','/');session=$session;ignoreJobId=$(if($inspection){$inspectionJob}else{''})}
 Write-Json $role $roleData
 if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'qttestability.dll'))){throw 'Renderer bootstrap missing. Reinstall the complete package.'}
 if(Test-Path -LiteralPath (Join-Path $installDir 'qttestability.dll')){throw 'Cavalry already has a different qttestability.dll; it was not replaced.'}
 # Environment variables affect only this supervisor and its new child.
 $env:QT_LOAD_TESTABILITY='1';$env:QT_FATAL_CRITICALS='1';$env:BRIDGENA2_RENDERER_ROLE=$role;$env:PATH=$PSScriptRoot+';'+$env:PATH
 # If this Qt build cannot load its bootstrap, its critical diagnostic aborts
 # startup. An extra private HOME keeps any accidental editor bridge off the
 # user's control channel as a second guard.
 $privateHome=Join-Path $CacheRoot 'renderer-profile';New-Item -ItemType Directory -Path $privateHome -Force|Out-Null
 $env:USERPROFILE=$privateHome;$env:HOMEDRIVE=[IO.Path]::GetPathRoot($privateHome).TrimEnd('\');$env:HOMEPATH=$privateHome.Substring($env:HOMEDRIVE.Length)
 $editors=@(Get-Process -Name Cavalry -ErrorAction SilentlyContinue | Where-Object {try{Same-Path $_.Path $executable}catch{$false}})
 $renderer=New-Object BridgeNa2Child($executable,$PSScriptRoot,$inspection)
 $started=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$lastDemand=$started;$ready=$false;$inspectUntil=$started+600000
 while(($null -eq $owner -or -not $owner.HasExited) -and $renderer.Running){
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$show=Read-Json (Join-Path $CacheRoot 'renderer-show.json')
  if((Fresh-Show $show) -and $show.id -ne $lastShow){
   $lastShow=$show.id;$inspection=$true;$inspectUntil=$now+600000
   $current=Read-Json (Join-Path $CacheRoot 'renderer-job.json');$inspectionJob=$current.id
   # A process cannot move from a private desktop. Restart only our child on
   # the interactive desktop for the explicit user inspection request.
   $renderer.Dispose();$session=[Guid]::NewGuid().ToString('N');$roleData.session=$session;$roleData.ignoreJobId=$inspectionJob;Write-Json $role $roleData
   $renderer=New-Object BridgeNa2Child($executable,$PSScriptRoot,$true);$started=$now;$ready=$false
  }
  $next=Read-Json (Join-Path $CacheRoot 'renderer-job.json')
  if($inspection -and $next -and $next.id -ne $inspectionJob){$inspection=$false;$started=$now;$freshEditor=Read-EditorState;if($freshEditor){$editorOwner=$freshEditor.owner}}
  if(-not $inspection){
   $editor=Read-EditorState
   if($editor -and $editorOwner -and $editor.owner -ne $editorOwner){$stopReason='editor-replaced';break}
   if($editor -and ($editor.phase -eq 'offline' -or ($editors.Count -eq 0 -and $now-$editor.stamp -gt 15000))){$stopReason='editor-offline';break}
   if($editors.Count -gt 0 -and @($editors | Where-Object {-not $_.HasExited}).Count -eq 0){$stopReason='editor-exited';break}
  }
  if(-not $inspection){$renderer.Hide()}
  $beat=Read-Json (Join-Path $CacheRoot 'renderer-heartbeat.json')
  if($beat -and $beat.session -eq $session -and $beat.error){throw $beat.error}
  $fresh=$beat -and $beat.session -eq $session -and $now-$beat.stamp -lt 3000 -and $beat.stamp -le $now+3000
  if($fresh){$ready=$true}
  if(-not $ready -and -not $inspection -and $now-$started -gt 45000){throw 'Cavalry startup timed out. Use Check background / Sign in in the Cavalry bridge, then reconnect in AE.'}
  try{$d=[long][IO.File]::ReadAllText((Join-Path $CacheRoot 'renderer-demand.txt'));if($d -gt 0 -and $d -le $now+3000){$lastDemand=$d}}catch{}
  if($inspection){if($now -gt $inspectUntil){break}}elseif($now-$started -gt 30000 -and $now-$lastDemand -gt 90000){break}
  $result=Read-Json (Join-Path $CacheRoot 'renderer-result.json')
  if($inspection){Health 'inspection'}elseif($fresh){Health 'ready'}elseif($result -and $result.session -eq $session -and $next -and $result.id -eq $next.id -and $result.phase -in @('loading','rendering')){Health $result.phase}elseif($ready){Health 'unresponsive'}else{Health 'starting'};Start-Sleep -Milliseconds 250
 }
 if(($null -eq $owner -or -not $owner.HasExited) -and -not $renderer.Running -and [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$lastDemand -lt 90000){
  $exitCode=$renderer.ExitCode
  $detail=switch($exitCode){72 {'Private renderer role file is missing.'};73 {'Cavalry Qt5Core/Qt6Core.dll was not loaded.'};74 {'This Cavalry Qt build does not expose the required QStandardPaths API.'};75 {'Qt private profile could not be enabled.'};default {'Check background / Sign in, graphics drivers and Cavalry startup.'}}
  throw ('The isolated Cavalry renderer exited (code '+$exitCode+'). '+$detail)
 }
} catch {$failed=$true;if($ownsLock){Health 'error' ([string]$_)}}
finally {
 if($renderer){$renderer.Dispose();$renderer=$null}
 if($ownsLock){if(-not $failed){Health 'stopped'};$lock.ReleaseMutex()}
 if($lock){$lock.Dispose()};if($owner){$owner.Dispose()};foreach($editor in $editors){$editor.Dispose()}
}
