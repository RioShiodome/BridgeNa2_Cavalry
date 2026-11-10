// Built-in macOS JavaScript for Automation. Only installs one Cavalry runtime JS.
ObjC.import('Foundation');ObjC.import('AppKit');
function run(argv){
 var fm=$.NSFileManager.defaultManager,home=ObjC.unwrap($.NSHomeDirectory());
 var source=argv[0],fixture=argv[1]==='--fixture';
 var scripts=home+'/Library/Application Support/Cavalry/Scripts',workspace=home+'/Library/Preferences/Cavalry/workspace.json';
 if(fixture){workspace=argv[2];scripts=argv[3];}
 var dest=scripts+'/Cavalry AE Native.js';
 function exists(p){return !!fm.fileExistsAtPath($(p));}
 function mkdir(p){if(!fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(p),true,$(),null))throw Error('Cannot create '+p);}
 function read(p){var s=$.NSString.stringWithContentsOfFileEncodingError($(p),$.NSUTF8StringEncoding,null);if(!s)throw Error('Cannot read '+p);return ObjC.unwrap(s);}
 function write(p,s){if(!$(s).writeToFileAtomicallyEncodingError($(p),true,$.NSUTF8StringEncoding,null))throw Error('Cannot write '+p);}
 function isRunning(){return $.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.scenegroup.cavalry').count>0;}
 function has(n){if(n.windowType===dest)return true;return (n.children||[]).some(has);}
 function add(n){if(n.mode===2&&n.children){n.children.push({height:220,width:380,mode:0,windowType:dest});return true;}return(n.children||[]).some(add);}
 if(!exists(source))throw Error('Missing packaged Cavalry JS. Extract the whole ZIP first.');
 if(!fixture&&isRunning()){
  var host=Application.currentApplication();host.includeStandardAdditions=true;
  host.displayDialog('请保存工程并正常关闭 Cavalry。安装器会等待关闭后自动配置 JS 的启动。不会自动保存或强制关闭工程。',{withTitle:'BridgeNa2_Cavalry 安装',buttons:['继续等待'],defaultButton:'继续等待'});
  var until=Date.now()+600000;while(isRunning()){if(Date.now()>until)throw Error('Cavalry is still open; setup timed out without changing the workspace.');delay(0.5);}
 }
 mkdir(scripts);var backups=scripts.substring(0,scripts.lastIndexOf('/'))+'/AE Native Backups';mkdir(backups);
 if(exists(dest))write(backups+'/bridge-'+Date.now()+'.disabled',read(dest));write(dest,read(source));
 if(!exists(workspace))throw Error('JS installed, but no Cavalry workspace was found. Start and close Cavalry once, then run this installer again.');
 var original=read(workspace),data=JSON.parse(original);
 if(!data.windows||!data.windows.length)throw Error('Unknown workspace format. The existing layout was not changed.');
 if(!data.windows.some(has)){
  if(!data.windows.some(add))throw Error('No tab group in workspace. Existing layout was not changed.');
  if(!fixture&&isRunning())throw Error('Cavalry reopened during setup. Close it and run installer again.');
  write(backups+'/workspace-'+Date.now()+'.json',original);write(workspace,JSON.stringify(data,null,2));
 }
 return 'Cavalry JS installed and workspace startup configured. Open Cavalry and AE when ready.';
}
