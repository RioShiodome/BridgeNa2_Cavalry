const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../cavalry/source.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../renderer/host.js','utf8');
function fixture(overrides={}){
 const base=overrides.root||'/cache';let time=1000,tick,range,name,loaded=true;const files=new Map(),opened=[],rendered=[],batches=[];
 const api={filePathExists:p=>files.has(p),readFromFile:p=>files.get(p),writeToFile:(p,s)=>{files.set(p,s);return true;},getPreferencesFolder:()=>'/privateProfile/Library/Preferences/Cavalry',getAppDataFolder:()=>'/privateProfile/Library/Application Support/Cavalry',
  openScene:(p,force)=>{assert(force);opened.push(p);},getSceneFilePath:()=>loaded?opened[opened.length-1]:'/previous-scene.cv',setProject:()=>{},clearProject:()=>{},getRenderQueueItems:()=>['q'],getNiceName:id=>id,get:(q,k)=>k==='uuid'?'uuid':null,
  set:(q,v)=>{if(v.frameRange)range=v.frameRange;if(v.fileName)name=v.fileName;},render:()=>{batches.push(range.y-range.x+1);for(let i=range.x;i<=range.y;i++){rendered.push(i);files.set(base+'/gen/frame.'+String(i).padStart(6,'0')+'.png','x'.repeat(100));}time+=(range.y-range.x+1)*(overrides.cost||1)+(overrides.overhead||0);},
  getFileSize:p=>files.get(p).length/1024,Timer:function(o){tick=o.onTimeout;this.stop=()=>{};this.start=()=>{};this.setInterval=()=>{};this.setRepeating=()=>{};}};
 const ui={setTitle:()=>{},setCallbacksActive:()=>{}};
 const role={root:base,profile:'/privateProfile',session:'S'};
 const h={files,api,opened,rendered,batches,put:(p,v)=>files.set(base+'/'+p,JSON.stringify(v)),result:()=>JSON.parse(files.get(base+'/renderer-result.json')),request:(id,count,extra={})=>h.put('renderer-job.json',{id,scene:base+'/requests/'+id+'.cv',queueUUID:'uuid',kind:'preview',directory:base+'/gen',first:0,count,...extra}),start:(extra={},r=role)=>{const c={Date:{now:()=>time},createBakeBridge:h.bakeFactory};vm.createContext(c);vm.runInContext(source,c);c.runRendererHost({...api,...extra},ui,r);},tick:()=>tick(),finish:()=>{for(let i=0;i<300&&h.result().phase!=='complete';i++)tick();assert.equal(h.result().phase,'complete');},loaded:v=>loaded=v,advance:ms=>{time+=ms;},name:()=>name};return h;
}
{
 const h=fixture();h.request('fast',200);h.start();assert.equal(h.rendered.length,2);h.finish();assert.equal(h.rendered.length,200);assert.equal(new Set(h.rendered).size,200);assert(h.batches.some(n=>n>16));assert(Math.max(...h.batches)<=64);
 const count=h.opened.length;h.start();assert.equal(h.rendered.length,200,'restart must not overwrite complete frames');
 h.request('cancelled',200);h.put('renderer-cancel.json',{id:'cancelled'});h.tick();assert.equal(h.rendered.length,200);
 h.request('invalid',2,{scene:'/unrelated.cv'});h.tick();assert.equal(h.result().phase,'error');assert.equal(h.opened.length,count+1);
}
{
 const h=fixture();h.request('tail',3);h.start();h.finish();assert.equal(h.name(),'frame.000002','a single tail frame needs its explicit number');
}
{
 const h=fixture({cost:4000});h.request('slow',8);h.start();assert.equal(h.rendered.length,2);h.tick();assert.equal(h.rendered.length,3,'very slow frames keep cancellation batches bounded');h.put('renderer-cancel.json',{id:'slow'});h.tick();assert.equal(h.rendered.length,3);assert.equal(h.result().phase,'cancelled');
}
{
 const h=fixture();h.request('resume',19);h.put('renderer-result.json',{id:'resume',phase:'rendering',done:2,sizes:['100','100']});h.loaded(false);h.start();assert.equal(h.rendered.length,0,'do not render a previous scene with an identical queue UUID');assert.equal(h.result().done,2,'loading must retain the published prefix');
 h.start();assert.equal(h.result().done,2,'a second restart while loading retains the prefix');h.loaded(true);h.finish();assert.equal(h.rendered[0],2);assert.equal(h.rendered.length,17);
}
{
 const h=fixture();h.request('bake-once',0,{kind:'bake'});h.put('renderer-result.json',{id:'bake-once',phase:'complete'});h.start({render:()=>{throw Error('Completed bake repeated');}});assert.equal(h.opened.length,0);
}
{
 const h=fixture();h.request('wrong-profile',4);h.start({getPreferencesFolder:()=>'/real/editor/preferences'});assert.equal(h.opened.length,0);assert(JSON.parse(h.files.get('/cache/renderer-heartbeat.json')).error);
 const base='C:/Users/测试 用户/Cache',win=fixture({root:base});win.request('wrong-profile',4);
 const windows={getPreferencesFolder:()=> 'C:\\Users\\Test\\AppData\\Local\\qttest\\Cavalry',getAppDataFolder:()=> 'C:/Users/Test/AppData/Roaming/qttest/Cavalry',getSceneFilePath:()=> 'c:\\users\\测试 用户\\cache\\requests\\WRONG-PROFILE.CV'};
 const role={root:base,profile:'C:/Users/Test/AppData/Local/qttest',preferences:'c:/users/test/appdata/local/qttest/cavalry',appData:'c:/users/test/appdata/roaming/qttest/cavalry',session:'W'};
 win.start(windows,role);assert(!JSON.parse(win.files.get(base+'/renderer-heartbeat.json')).error);assert.equal(win.rendered.length,2,'Windows scene paths compare without case or slash mismatches');
 win.start({...windows,getAppDataFolder:()=> 'C:/Users/Test/AppData/Roaming/Cavalry'},role);assert(JSON.parse(win.files.get(base+'/renderer-heartbeat.json')).error);assert.equal(win.rendered.length,2);
}
console.log('PASS adaptive batching, cancellation, async scene identity, immutable resume, bake idempotence and Windows isolation');
{
 const h=fixture();h.request('ack-before-open',2);
 h.start({setProject:()=>{assert.equal(h.result().phase,'loading');},openScene:()=>{assert.equal(h.result().phase,'loading');throw Error('modal load failed');}});
 assert.equal(h.result().phase,'error');assert.match(h.result().error,/modal load failed/);
}
{
 const h=fixture();h.request('old-bake',0,{kind:'bake'});
 h.start({}, {root:'/cache',profile:'/privateProfile',session:'inspect',ignoreJobId:'old-bake'});
 assert.equal(h.opened.length,0);assert.equal(h.rendered.length,0,'diagnostics must not replay an old bake');
 h.request('new-preview',2);h.tick();assert.equal(h.result().phase,'complete');assert.equal(h.rendered.length,2);
}
console.log('PASS pre-load acknowledgement, failure propagation and inspection skips old work but accepts reconnect');

{
 const h=fixture({cost:200,overhead:800});h.request('setup-heavy',32);h.start();h.finish();
 assert(h.batches.length<=10,'high setup cost must not cause one new render per frame');
 assert.equal(h.result().done,32);assert.equal(new Set(h.rendered).size,32);
 assert(h.result().renderMs>0&&h.result().renderFps>0&&h.result().firstFrameMs>0);
 assert.equal(h.result().batches,h.batches.length);
}
console.log('PASS continuous batches amortize setup; complete-frame fidelity and measured progress');

{
 const h=fixture();h.request('asset-loading',2);h.loaded(false);h.start();
 h.advance(3000);h.tick();h.advance(6000);h.tick();
 assert.equal(h.opened.length,1,'a slow asset load must not be reentered by openScene retries');
 h.loaded(true);h.tick();assert.equal(h.result().phase,'complete');
}
console.log('PASS slow asset loading is not restarted');

{
 const h=fixture(),settings=[];let target;
 h.request('readonly-editor',3,{protocol:2,sourceUUID:'comp-uuid',queueUUID:undefined,scale:25,transparent:true});
 h.start({getComps:()=>['unrelated','comp'],get:(id,k)=>id==='comp'?(k==='uuid'?'comp-uuid':{r:10,g:20,b:30,a:255}):'other',
  addRenderQueueItem:source=>{target=source;return 'new-queue';},setGenerator:()=>{},getCurrentGeneratorType:()=> 'renderPNG',
  set:(id,values)=>{settings.push({id,values});h.api.set(id,values);}});
 h.finish();assert.equal(target,'comp');assert(settings.some(s=>s.id==='comp'&&s.values.backgroundColor.a===0));
 assert(settings.some(s=>s.id==='new-queue'&&s.values.resolutionScale===25&&s.values.padding===6));
 assert.deepEqual(h.rendered,[0,1,2]);
}
console.log('PASS unmodified editor snapshot creates preview queue and transparent background only inside renderer');

{
 const h=fixture();let staged=null,restores=0,renders=0;
 h.bakeFactory=()=>({close:()=>{staged=null;},snapshot:()=>staged,restore:(saved,source)=>{assert.equal(source,'comp');staged=saved;restores++;},poll:()=>{},dispatch:req=>{
  if(req.action==='open')staged={id:req.id,sourceUUID:'comp-uuid'};
  else {assert.equal(staged.id,req.session);if(req.action==='render'){renders++;staged=null;}}
  h.put('bake-response.json',{id:req.id,phase:req.action==='render'?'complete':'settings'});
 }});
 const options={getComps:()=>['comp'],get:()=> 'comp-uuid',addRenderQueueItem:()=> 'q',setGenerator:()=>{},getCurrentGeneratorType:()=> 'renderPNG'};
 function command(id,req){h.request(id,0,{protocol:2,sourceUUID:'comp-uuid',kind:'bake-control',bakeRequest:{protocol:1,...req}});}
 command('settings',{id:'bopen',action:'open'});h.start(options);assert.equal(h.result().phase,'complete');
 h.request('preview-between-settings',2,{protocol:2,sourceUUID:'comp-uuid',scale:50});h.tick();assert.equal(h.result().phase,'complete');
 command('apply',{id:'bapply',action:'apply',session:'bopen'});h.tick();assert.equal(restores,1);assert.equal(h.result().phase,'complete');
 command('render',{id:'brender',action:'render',session:'bopen'});h.tick();assert.equal(restores,2);assert.equal(renders,1);
 h.start(options);assert.equal(renders,1,'restarting must not repeat a completed bake-control render');
 command('expired',{id:'bstale',action:'render',session:'bopen'});h.tick();assert.equal(h.result().phase,'error');
 const response=JSON.parse(h.files.get('/cache/bake-response.json'));assert.equal(response.id,'bstale');assert.match(response.error,/设置已过期/);
}
console.log('PASS background bake settings survive preview loads; control response identity, restart idempotence and expired-session errors');

{
 const h=fixture(),restored=[];h.bakeFactory=(api,root)=>{let state=null;return {close:()=>{state=null;},snapshot:()=>state,restore:s=>{state=s;restored.push({root,id:s.id});},poll:()=>{},dispatch:req=>{if(req.action==='open')state={id:req.id};h.files.set(root+'/bake-response.json',JSON.stringify({id:req.id,phase:'settings'}));}};};
 const opts={getComps:()=>['comp'],get:()=> 'comp-uuid'};
 function command(id,channel,req){h.request(id,0,{protocol:2,sourceUUID:'comp-uuid',kind:'bake-control',responseRoot:'/cache/channels/'+channel,bakeRequest:{protocol:1,...req}});}
 command('open-a',101,{id:'bA',action:'open'});h.start(opts);
 command('open-b',202,{id:'bB',action:'open'});h.tick();
 command('apply-a',101,{id:'bApply',session:'bA',action:'apply'});h.tick();assert.deepEqual(restored,[{root:'/cache/channels/101',id:'bA'}]);
 assert.equal(JSON.parse(h.files.get('/cache/channels/101/bake-response.json')).id,'bApply');assert.equal(JSON.parse(h.files.get('/cache/channels/202/bake-response.json')).id,'bB');
 command('wrong-session',202,{id:'bWrong',session:'bA',action:'apply'});h.tick();assert.equal(h.result().phase,'error');assert.equal(JSON.parse(h.files.get('/cache/channels/202/bake-response.json')).id,'bWrong');
 command('escape','../outside',{id:'bEscape',action:'open'});h.tick();assert.equal(h.result().phase,'error');assert(!h.files.has('/cache/channels/../outside/bake-response.json'));
}
console.log('PASS bake sessions and responses isolated by channel; cross-channel sessions and path traversal rejected');
{
 const h=fixture(),targets=[];
 const opts={getComps:()=>['compNode#1','compNode#11'],get:()=> 'shared',getNiceName:id=>id==='compNode#11'?'case5':'Composition 1',addRenderQueueItem:id=>{targets.push(id);return 'q';},setGenerator:()=>{},getCurrentGeneratorType:()=> 'renderPNG'};
 h.request('case5',2,{protocol:3,sourceNodeId:'compNode#11',sourceUUID:'shared'});h.start(opts);h.finish();
 assert.deepEqual(targets,['compNode#11']);assert.equal(h.result().sourceNodeId,'compNode#11');assert.equal(h.result().sourceName,'case5');
 h.request('firstcomp',2,{protocol:3,sourceNodeId:'compNode#1',sourceUUID:'shared'});h.tick();h.finish();assert.deepEqual(targets,['compNode#11','compNode#1']);
 h.request('ambiguouslegacy',2,{protocol:2,sourceUUID:'shared'});h.tick();assert.equal(h.result().phase,'error');assert.equal(targets.length,2,'legacy ambiguous source must not silently render first comp');
 h.request('missingnode',2,{protocol:3,sourceNodeId:'deleted',sourceUUID:'shared'});h.tick();h.advance(45001);h.tick();assert.equal(h.result().phase,'error');assert.equal(targets.length,2,'missing exact node must not fall back to a shared UUID');
}
console.log('PASS actual requested node reaches preview queue and diagnostic reply; ambiguous legacy and missing-node requests never render another comp');
{
 const base='C:/Users/测试 用户/Cache',h=fixture({root:base}),targets=[];
 h.bakeFactory=(api,root)=>({close(){},snapshot:()=>({id:'b1'}),poll(){},dispatch:req=>{targets.push(root);h.files.set(root+'/bake-response.json',JSON.stringify({id:req.id,phase:'settings'}));}});
 const opts={getComps:()=>['compNode#11'],get:()=> 'shared'};
 const extra={protocol:3,sourceNodeId:'compNode#11',sourceUUID:'shared',kind:'bake-control',responseRoot:'c:\\USERS\\测试 用户\\CACHE\\channels\\202',scene:'c:\\users\\测试 用户\\cache\\requests\\win-bake.cv',bakeRequest:{protocol:1,id:'b1',action:'open'}};
 h.request('win-bake',0,extra);h.start(opts);assert.equal(h.result().phase,'complete');assert.deepEqual(targets,[base+'/channels/202']);
 assert(h.files.has(base+'/channels/202/bake-response.json'));
 for(const path of ['c:/users/测试 用户/cache/channels/../202','c:/users/测试 用户/cache-other/channels/202','c:/users/测试 用户/cache/channels/202/../../outside']){
  h.request('unsafe',0,{...extra,scene:base+'/requests/unsafe.cv',responseRoot:path});h.start(opts);assert.equal(h.result().phase,'error');
 }
 assert.equal(targets.length,1,'normalizing Windows separators must not weaken response directory isolation');
}
console.log('PASS Windows drive-case/backslash/Unicode snapshot and bake response routing; traversal and sibling-root requests rejected');
