const fs=require('fs'),vm=require('vm'),assert=require('assert');
let time=1000,frame=17,timer,callbacks,sig='initial',submissions=0,cancels=0,probeCost=0,probes=0;
const sourceBG={r:12,g:34,b:56,a:255},settings=[],requests=[];
const root='/home/Cavalry AE Native/default',magic='CAVALRY_NATIVE_4',files=new Map(),dirs=new Set(['/home','/home/Cavalry AE Native',root]);
class Clock extends Date{static now(){return time;}}
const api={getPreferencesFolder:()=>'/prefs',getHomeFolder:()=>'/home',uuid:()=> 'testowner',getFrame:()=>frame,getActiveComp:()=> 'comp',
 render:()=>{throw Error('The editor must never render');},setFrame:()=>{throw Error('The editor must never change the playhead');},
 filePathExists:p=>files.has(p)||dirs.has(p),getFolderFromPath:p=>p.slice(0,p.lastIndexOf('/')),makeFolder:p=>{dirs.add(p);return true;},writeToFile:(p,s)=>{files.set(p,s);return true;},readFromFile:p=>files.get(p)||'',getNiceName:()=> 'Test',layerExists:()=>true,getChildren:()=>['shape'],
 get:(_,p)=>({backgroundColor:sourceBG,startFrame:0,endFrame:47,fps:24,resolution:{x:320,y:180}}[p]),
 Timer:function(o){timer=o.onTimeout;this.stop=()=>{};this.start=()=>{};this.setRepeating=()=>{};this.setInterval=()=>{};}};
for(const method of ['duplicate','rename','deleteLayer','addRenderQueueItem','setGenerator','set','connect','deserialise','saveScene','saveSceneAs'])api[method]=()=>{throw Error('Editor scene mutation forbidden: '+method);};
const ui={setTitle:()=>{},setMinimumWidth:()=>{},Button:function(){},Label:function(){this.setText=()=>{};},add:()=>{},show:()=>{},addCallbackObject:o=>callbacks=o};
const background={submit:(q,o)=>{submissions++;requests.push(o);return {done:0,options:o};},cancel:()=>cancels++,poll:h=>{h.done=Math.min(h.options.count,h.done+2);return {phase:h.done===h.options.count?'complete':'rendering',done:h.done,sizes:Array(h.done).fill('150')};}};
const context={api,Date:Clock,editFingerprint:()=>{probes++;time+=probeCost;return sig;}};vm.createContext(context);
for(const n of ['source.js','channel.js'])vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/'+n,'utf8'),context);
const channel=context.createPreviewChannel(api,root,background,'testowner',()=>true);timer=channel.tick;callbacks=channel.callbacks;ui.onClose=channel.shutdown;

function tick(n=1){while(n--){time+=25;timer();}}
function phase(){return files.get(root+'/state.txt').split('\n')[4];}
function connect(n){files.set(root+'/control.txt',[magic,'request'+n,'connect','50',time,'AE','END',''].join('\n'));}
function until(predicate){let i=0;while(!predicate()&&i++<300)tick();assert(predicate(),'state machine made progress');}
connect(1);until(()=>String(files.get(root+'/preview.txt')).includes('\n2\nDOT\nEND\n'));
const beforeScrub=files.get(root+'/preview.txt');for(let i=0;i<8;i++){frame++;tick();}assert.notEqual(files.get(root+'/preview.txt'),beforeScrub,'scrubbing must not block background publication');
const first=beforeScrub.split('\n')[1];assert(files.has(root+'/'+first+'/ready-2.txt'));
frame=29;sig='edited';callbacks.onAttrChanged('shape','position');tick(8);assert.equal(frame,29);assert.equal(files.get(root+'/preview.txt').split('\n')[1],'IDLE');assert(cancels>0);
until(()=>phase()==='ready');const complete=files.get(root+'/complete.txt');assert.equal(complete.split('\n')[2],'48');assert.equal(complete.split('\n')[5],'24');assert.equal(frame,29);
const count=submissions;tick(50);assert.equal(submissions,count,'idle does not rebuild');
files.set(root+'/control.txt',[magic,'pause1','pause','50',time,'AE','END',''].join('\n'));tick(4);assert.equal(phase(),'paused');assert.equal(files.get(root+'/complete.txt'),complete);
console.log('PASS editor never renders or sets frame, background publication, edit cancellation, fresh snapshot, idle and old-cache retention');

probeCost=250;sig='large scene';connect(2);until(()=>phase()==='rendering');
const probeStart=probes;for(let i=0;i<12;i++){callbacks.onAttrChanged('shape','position');tick();}
assert(probes-probeStart<=1,'expensive scene fingerprints must not run on every timer tick');
until(()=>phase()==='ready');assert.equal(files.get(root+'/complete.txt').split('\n')[2],'48','a deferred final prefix still publishes');
assert.equal(frame,29);
console.log('PASS large scene probe throttling and publication after deferred final chunk');

function rangeCommand(id,first,last,transparent){files.set(root+'/control.txt',[magic,id,'connect','50',time,'AE','1',first,last,transparent?'1':'0','END',''].join('\n'));}
probeCost=0;rangeCommand('range1',12,20,true);until(()=>requests.length&&requests[requests.length-1].first===12&&phase()==='ready');
let ranged=files.get(root+'/complete.txt').split('\n');assert.equal(ranged[2],'9');assert.equal(ranged[6],'12');
assert.equal(requests[requests.length-1].transparent,true);assert.equal(requests[requests.length-1].scale,50);assert.equal(sourceBG.a,255);
rangeCommand('singleframe',17,17,false);until(()=>requests[requests.length-1].first===17&&phase()==='ready');assert.equal(files.get(root+'/complete.txt').split('\n')[2],'1');
rangeCommand('clamped',45,200,false);until(()=>requests[requests.length-1].first===45&&phase()==='ready');assert.equal(requests[requests.length-1].count,3);
const kept=files.get(root+'/complete.txt'),submitted=submissions;
rangeCommand('emptyrange',80,90,false);until(()=>phase()==='error');assert.equal(submissions,submitted);assert.equal(files.get(root+'/complete.txt'),kept);
rangeCommand('reversed',25,15,false);tick(8);assert.equal(phase(),'error');assert.equal(submissions,submitted);
console.log('PASS inclusive custom ranges, alpha dispatch, old-cache retention and zero editing-scene mutations');
// Host teardown must not touch destroyed UI or scene nodes. An exception in
// the old node cleanup prevented offline from ever reaching the supervisor.
api.layerExists=()=>{throw Error('Scene is being destroyed');};api.deleteLayer=()=>{throw Error('Scene is being destroyed');};
background.cancel=()=>{throw Error('Cancellation IO failed');};
ui.onClose();assert.equal(phase(),'offline');
assert.equal(files.get(root+'/preview.txt').split('\n')[1],'IDLE');
const closedState=files.get(root+'/state.txt');tick(10);callbacks.onSceneChanged();assert.equal(files.get(root+'/state.txt'),closedState);
console.log('PASS shutdown signals offline first, never accesses scene/UI, and stops callbacks even when cancellation fails');
