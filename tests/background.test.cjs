const fs=require('fs'),vm=require('vm'),assert=require('assert');let time=1000,dirty=true,file='/scene/unsaved.cv',exportCount=0;
const data=new Map(),dirs=new Set(['/cache','/prefs','/app']),api={filePathExists:p=>data.has(p)||dirs.has(p),makeFolder:p=>{dirs.add(p);return true;},getFolderFromPath:p=>p.slice(0,p.lastIndexOf('/')),writeToFile:(p,s)=>{data.set(p,s);return true;},readFromFile:p=>data.get(p),uuid:()=> 'abc',getSceneFilePath:()=>file,sceneHasUnsavedChanges:()=>dirty,exportSceneAs:p=>{exportCount++;data.set(p,'snapshot');return true;},getPreferencesFolder:()=>'/prefs',getAppDataFolder:()=>'/app',getAppAssetsPath:()=>'/Applications/Cavalry.app/Contents/assets',getProjectPath:()=>'/project',get:()=> 'queueUUID',render:()=>{throw Error('Foreground render forbidden');}};
const c={Date:{now:()=>time}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/background.js','utf8'),c);const b=c.createBackgroundRenderer(api,'/cache');const h=b.submit('q',{kind:'preview',count:48,first:0,directory:'/cache/gen'});
assert.equal(exportCount,1);assert.equal(file,'/scene/unsaved.cv');assert(dirty);const request=JSON.parse(data.get('/cache/renderer-job.json'));assert.equal(request.project,'/project');assert.equal(request.sourceUUID,'queueUUID');assert.equal(request.protocol,3);assert.equal(request.sourceNodeId,'q');assert(!request.queueUUID);assert.equal(b.poll(h).phase,'starting');
data.set('/cache/renderer-result.json',JSON.stringify({id:'stale',phase:'complete'}));assert.equal(b.poll(h).phase,'starting');
time+=101;data.set('/cache/renderer-result.json',JSON.stringify({id:h.id,phase:'rendering',done:2,sizes:['100','100']}));assert.equal(b.poll(h).done,2);b.cancel(h);assert.equal(JSON.parse(data.get('/cache/renderer-cancel.json')).id,h.id);
time+=101;data.set('/cache/renderer-health.json',JSON.stringify({phase:'error',stamp:time,error:'No renderer'}));assert.throws(()=>b.poll(h),/No renderer/);
const broken={...api,exportSceneAs:()=>{file='/changed';return true;}};assert.throws(()=>c.createBackgroundRenderer(broken,'/cache').submit('q',{kind:'bake'}),/工程状态/);
const bundle=fs.readFileSync(__dirname+'/../cavalry/Cavalry AE Native.js','utf8');assert(!bundle.includes('createRenderGuard'));
console.log('PASS immutable snapshot dispatch, scene preservation, job identity, cancellation, startup failure, no foreground fallback');
// A stale ready supervisor and a different job result caused the infinite wait.
data.delete('/cache/renderer-health.json');
for(const wrongResult of [null,{id:'older-job',phase:'complete',done:48}]){
 const h2=b.submit('q',{kind:'preview'});data.set('/cache/renderer-health.json',JSON.stringify({phase:'ready',stamp:time}));
 if(wrongResult)data.set('/cache/renderer-result.json',JSON.stringify(wrongResult));else data.delete('/cache/renderer-result.json');
 time+=45001;assert.throws(()=>b.poll(h2),/后台未响应当前任务/);
}
const waiting=b.submit('q',{kind:'preview'});data.set('/cache/renderer-result.json',JSON.stringify({id:waiting.id,phase:'loading',done:0}));assert.equal(b.poll(waiting).phase,'loading');time+=60001;assert.throws(()=>b.poll(waiting),/后台未能加载动画/);
const longBake=b.submit('q',{kind:'bake'});data.set('/cache/renderer-result.json',JSON.stringify({id:longBake.id,phase:'rendering',kind:'bake'}));time+=600000;assert.equal(b.poll(longBake).phase,'rendering','a synchronous long render is not a startup timeout');
data.set('/cache/renderer-result.json',JSON.stringify({id:longBake.id,phase:'complete'}));time+=101;assert.equal(b.poll(longBake).phase,'complete');
b.inspect();assert(JSON.parse(data.get('/cache/renderer-show.json')).id);assert.equal(Number(data.get('/cache/renderer-demand.txt')),time);
console.log('PASS no-ack timeout despite ready, stale job, loading/login timeout, long bake, inspection demand');
