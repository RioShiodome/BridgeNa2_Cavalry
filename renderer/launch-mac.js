// Built-in macOS JXA supervisor. Owns only the new instance returned by Launch Services.
ObjC.import('Foundation');ObjC.import('AppKit');
ObjC.bindFunction('kill',['int',['int','int']]);
ObjC.bindFunction('flock',['int',['int','int']]);
function run(argv){
 var root=argv[0],parentPID=Number(argv[1]),manual=argv[2]==='inspect',fm=$.NSFileManager.defaultManager,child=null,locked=false,lockFile=null;
 function readText(p){if(!fm.fileExistsAtPath($(p)))return '';var s=$.NSString.stringWithContentsOfFileEncodingError($(p),$.NSUTF8StringEncoding,null);var t=ObjC.unwrap(s);return typeof t==='string'?t:'';}
 function editorState(){var a=readText(root+'/state.txt').replace(/\r/g,'').split('\n');return a.length===12&&a[0]==='CAVALRY_NATIVE_4'&&a[10]==='END'?{owner:a[1],stamp:Number(a[3]),phase:a[4]}:null;}
 function read(p){if(!fm.fileExistsAtPath($(p)))return null;var s=$.NSString.stringWithContentsOfFileEncodingError($(p),$.NSUTF8StringEncoding,null);var text=ObjC.unwrap(s);if(typeof text!=='string')return null;try{return JSON.parse(text);}catch(_){return null;}}
 function mkdir(p){if(!fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(p),true,$(),null))throw Error('Cannot create renderer profile');}
 function write(p,x){if(!$(JSON.stringify(x)).writeToFileAtomicallyEncodingError($(p),true,$.NSUTF8StringEncoding,null))throw Error('Cannot write renderer status');}
 function copy(a,b){var s=$.NSString.stringWithContentsOfFileEncodingError($(a),$.NSUTF8StringEncoding,null);if(!s||!s.writeToFileAtomicallyEncodingError($(b),true,$.NSUTF8StringEncoding,null))throw Error('Cannot copy renderer bootstrap');}
 function processAlive(pid){return pid>0&&$.kill(pid,0)===0;}
 function alive(){return child&&processAlive(child.processIdentifier);}
 function health(phase,error){write(root+'/renderer-health.json',{phase:phase,error:error||'',stamp:Date.now(),supervisor:$.NSProcessInfo.processInfo.processIdentifier,child:alive()?child.processIdentifier:0,session:session,inspection:inspection,reason:stopReason,editors:editorPIDs.map(function(e){return e.pid;})});}
 function freshShow(s){return s&&s.id&&Date.now()-s.stamp<30000&&s.stamp<=Date.now()+3000;}
 var session=ObjC.unwrap($.NSUUID.UUID.UUIDString),started=Date.now(),profile=root+'/renderer-profile',inspection=false,stopReason='',failed=false,editorOwner='',editorPIDs=[];
 try{
  if(!root||(!manual&&!processAlive(parentPID)))throw Error('Renderer owner is not running');
  mkdir(root);
  // Send the request even when another supervisor owns the lock.
  if(manual)write(root+'/renderer-show.json',{id:session,stamp:Date.now()});
  var lockPath=root+'/renderer-supervisor.lock';
  if(!fm.fileExistsAtPath($(lockPath)))fm.createFileAtPathContentsAttributes($(lockPath),$.NSData.data,$({}));
  lockFile=$.NSFileHandle.fileHandleForWritingAtPath($(lockPath));
  if(!lockFile)throw Error('Cannot open renderer lock');
  // The kernel releases flock on exit/crash. No stale directory lock survives.
  if($.flock(lockFile.fileDescriptor,2|4)!==0)return;
  locked=true;var previousHealth=read(root+'/renderer-health.json');
  var show=read(root+'/renderer-show.json'),lastShow=freshShow(show)?show.id:'';inspection=!!lastShow;
  var initialJob=read(root+'/renderer-job.json'),inspectionJob=initialJob?initialJob.id:'';
  var initialEditor=editorState();editorOwner=initialEditor?initialEditor.owner:'';
  if(!inspection&&initialEditor&&(initialEditor.phase==='offline'||Date.now()-initialEditor.stamp>15000)){stopReason='editor-offline';health('stopped');return;}
  var c=read(root+'/renderer-config.json');if(!c||c.root!==root||!c.preferences||!c.script||!c.assets)throw Error('Invalid renderer configuration. Connect once in After Effects first.');
  // Qt does not reliably emit ui.onClose on application quit. Identify the
  // editor by its open crash-report lock in the configured preference profile,
  // not by whichever same-name window is active. lsof is read-only; no process
  // environments or unrelated files are read or logged.
  var editors=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.scenegroup.cavalry'),crashDir=c.preferences+'/.crashdb';
  var profileIdentifiable=fm.fileExistsAtPath($(crashDir));
  if(profileIdentifiable){
   var probe=$.NSTask.alloc.init,pipe=$.NSPipe.pipe;
   probe.launchPath='/usr/sbin/lsof';probe.arguments=$(['-n','-P','-a','-c','Cavalry','-Fpn']);probe.standardOutput=pipe;probe.standardError=$.NSFileHandle.fileHandleWithNullDevice;
   probe.launch;var output=ObjC.unwrap($.NSString.alloc.initWithDataEncoding(pipe.fileHandleForReading.readDataToEndOfFile,$.NSUTF8StringEncoding));probe.waitUntilExit;
   var matching={},observedPID=0;String(output||'').split('\n').forEach(function(line){if(/^p[0-9]+$/.test(line))observedPID=Number(line.slice(1));else if(observedPID&&line.indexOf('n'+crashDir+'/')===0&&/\.run\.lock$/.test(line))matching[observedPID]=true;});
   for(var ei=0;ei<editors.count;ei++){var ed=editors.objectAtIndex(ei);if(matching[ed.processIdentifier]&&processAlive(ed.processIdentifier))editorPIDs.push({pid:ed.processIdentifier,launch:ObjC.unwrap(ed.launchDate.description)});}
   if(!inspection&&initialEditor&&!editorPIDs.length){stopReason='editor-exited';health('stopped');return;}
  }
  function existingEditors(){return editorPIDs.map(function(e){var a=$.NSRunningApplication.runningApplicationWithProcessIdentifier(e.pid);return processAlive(e.pid)&&a&&ObjC.unwrap(a.launchDate.description)===e.launch?a:null;}).filter(function(a){return !!a;});}
  health(inspection?'inspection':'starting');
  var executable=c.assets.replace(/\/Contents\/assets\/?$/,'/Contents/MacOS/Cavalry');
  if(executable===c.assets||!fm.fileExistsAtPath($(executable)))throw Error('Cavalry executable not found');
  var previousRole=read(profile+'/Library/Preferences/Cavalry/BridgeNa2-renderer.json'),adopted=false;
  if(previousHealth&&previousRole&&previousHealth.session===previousRole.session&&previousRole.root===root&&processAlive(previousHealth.child)&&!processAlive(previousHealth.supervisor)){
   var orphan=$.NSRunningApplication.runningApplicationWithProcessIdentifier(previousHealth.child);
   if(orphan&&ObjC.unwrap(orphan.executableURL.path)===executable){
    var verify=$.NSTask.alloc.init,verification=$.NSPipe.pipe;verify.launchPath='/usr/sbin/lsof';verify.arguments=$(['-n','-P','-a','-p',String(previousHealth.child),'-Fn']);verify.standardOutput=verification;verify.standardError=$.NSFileHandle.fileHandleWithNullDevice;
    verify.launch;var evidence=ObjC.unwrap($.NSString.alloc.initWithDataEncoding(verification.fileHandleForReading.readDataToEndOfFile,$.NSUTF8StringEncoding));verify.waitUntilExit;
    if(String(evidence||'').split('\n').some(function(line){return line.indexOf('n'+profile+'/Library/Preferences/Cavalry/.crashdb/')===0&&/\.run\.lock$/.test(line);})){child=orphan;session=previousRole.session;adopted=true;}
   }
  }
  if(!adopted){
  var prefs=profile+'/Library/Preferences/Cavalry',scripts=profile+'/Library/Application Support/Cavalry/Scripts',bootstrap=scripts+'/Cavalry AE Native.js';
  mkdir(profile);fm.setAttributesOfItemAtPathError($({NSFilePosixPermissions:448}),$(profile),null);
  mkdir(prefs);mkdir(scripts);copy(c.script,bootstrap);if(!fm.fileExistsAtPath($(prefs+'/preferences.json')))copy(c.preferences+'/preferences.json',prefs+'/preferences.json');
  var workspace=read(c.preferences+'/workspace.json'),added=false;
  function visit(n){if(!n||typeof n!=='object')return;if(n.windowType&&(/[\\/]/.test(n.windowType))){n.windowType=added?'messageBar':bootstrap;added=true;}if(n.children)n.children.forEach(visit);}
  ((workspace&&workspace.windows)||[]).forEach(visit);if(!added)throw Error('Cavalry bridge startup tab missing');
  write(prefs+'/workspace.json',workspace);write(prefs+'/wsv.json',read(c.preferences+'/wsv.json')||{workspaceVersion:1.2});
  write(prefs+'/BridgeNa2-renderer.json',{root:root,profile:profile,session:session,ignoreJobId:inspection?inspectionJob:''});
  var env=ObjC.deepUnwrap($.NSProcessInfo.processInfo.environment);env.CFFIXED_USER_HOME=profile;
  var config=$.NSMutableDictionary.alloc.init;
  config.setObjectForKey($(env),$.NSWorkspaceLaunchConfigurationEnvironment);
  var flags=$.NSWorkspaceLaunchNewInstance|$.NSWorkspaceLaunchWithoutActivation|$.NSWorkspaceLaunchAndHide|$.NSWorkspaceLaunchWithoutAddingToRecents;
  child=$.NSWorkspace.sharedWorkspace.launchApplicationAtURLOptionsConfigurationError($.NSURL.fileURLWithPath($(executable.replace(/\/Contents\/MacOS\/Cavalry$/,''))),flags,config,null);
  if(!child||!child.processIdentifier)throw Error('Cannot launch isolated Cavalry');
  }
  try{ObjC.bindFunction('setpriority',['int',['int','int','int']]);$.setpriority(0,child.processIdentifier,10);}catch(_){}
  function reveal(){child.unhide;child.activateWithOptions($.NSApplicationActivateAllWindows|$.NSApplicationActivateIgnoringOtherApps);}
  if(inspection)reveal();
  var ready=false,lastDemand=Date.now(),inspectUntil=inspection?Date.now()+600000:0;
  while(alive()){
   if(parentPID>0&&!processAlive(parentPID)){stopReason='ae-exited';break;}
   show=read(root+'/renderer-show.json');
   if(freshShow(show)&&show.id!==lastShow){lastShow=show.id;inspection=true;inspectUntil=Date.now()+600000;var current=read(root+'/renderer-job.json');inspectionJob=current?current.id:'';reveal();}
   var next=read(root+'/renderer-job.json');
   // Reconnecting resumes normal hidden rendering in the same authenticated instance.
   if(inspection&&next&&next.id!==inspectionJob){inspection=false;started=Date.now();var freshEditor=editorState();editorOwner=freshEditor?freshEditor.owner:editorOwner;child.hide;}
   var beat=read(root+'/renderer-heartbeat.json'),fresh=beat&&beat.session===session&&Date.now()-beat.stamp<3000&&beat.stamp<=Date.now()+3000;
   if(beat&&beat.session===session&&beat.error)throw Error(beat.error);
   if(fresh)ready=true;
   if(!ready&&!inspection&&Date.now()-started>45000)throw Error('后台启动超时。请点“检查后台 / 登录”，处理 Cavalry 提示后重新连接。');
   if(!inspection){
    var editor=editorState(),surviving=existingEditors();
    if(editor&&editorOwner&&editor.owner!==editorOwner){stopReason='editor-replaced';break;}
    if(editor&&(editor.phase==='offline'||(!editorPIDs.length&&Date.now()-editor.stamp>15000))){stopReason='editor-offline';break;}
    if(editorPIDs.length&&!surviving.length){stopReason='editor-exited';break;}
    // A Dock/Finder click can target our same-bundle child. Hand it back to the
    // editing instance, rather than hiding its window over and over.
    var currentChild=$.NSRunningApplication.runningApplicationWithProcessIdentifier(child.processIdentifier);
    if(currentChild&&currentChild.active&&surviving.length===1){var front=surviving[surviving.length-1];front.unhide;front.activateWithOptions($.NSApplicationActivateAllWindows|$.NSApplicationActivateIgnoringOtherApps);child.hide;}
   }
   var s=$.NSString.stringWithContentsOfFileEncodingError($(root+'/renderer-demand.txt'),$.NSUTF8StringEncoding,null);if(s){var d=Number(ObjC.unwrap(s));if(d>0&&d<=Date.now()+3000)lastDemand=d;}
   if(inspection){if(Date.now()>inspectUntil){stopReason='inspection-expired';break;}}
   else if(Date.now()-started>30000&&Date.now()-lastDemand>90000){stopReason='idle';break;}
   var result=read(root+'/renderer-result.json'),active=result&&result.session===session&&next&&result.id===next.id;
   health(inspection?'inspection':fresh?'ready':active&&(result.phase==='loading'||result.phase==='rendering')?result.phase:ready?'unresponsive':'starting');delay(.5);
  }
  if(!alive()&&Date.now()-lastDemand<90000)throw Error('后台 Cavalry 已退出，请在 AE 重新连接。若再次退出，请检查后台登录状态。');
 }catch(e){failed=true;if(locked)health('error',String(e));else if(manual)throw e;}
 finally{
  if(alive()){child.terminate;var until=Date.now()+1500;while(alive()&&Date.now()<until)delay(.05);if(alive()){child.forceTerminate;var forcedUntil=Date.now()+1000;while(alive()&&Date.now()<forcedUntil)delay(.05);}}
  if(locked&&!failed)health('stopped');
  if(lockFile)lockFile.closeFile;
 }
}
