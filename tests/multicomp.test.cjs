const fs=require('fs'),vm=require('vm'),assert=require('assert');
let time=1000,serial=0,activeComp='A',tick,callbacks,liveJob=null;
const root='/home/Cavalry AE Native/default',files=new Map(),dirs=new Set(['/home']),submitted=[],cancelled=[];
const nodes={A:{uuid:'uuidA',name:'Same name',first:0,last:7,fps:24,resolution:{x:320,y:180},sig:'a1'},B:{uuid:'uuidB',name:'Same name',first:10,last:13,fps:30,resolution:{x:200,y:200},sig:'b1'}};
class Clock extends Date{static now(){return time;}}
const api={getPreferencesFolder:()=>'/prefs',getHomeFolder:()=>'/home',getSceneFilePath:()=>'/project.cv',uuid:()=> 'u'+(++serial),getActiveComp:()=>activeComp,getComps:()=>Object.keys(nodes),layerExists:id=>!!nodes[id],getNiceName:id=>nodes[id].name,getChildren:()=>['shape'],
 get:(id,p)=>({uuid:nodes[id].uuid,startFrame:nodes[id].first,endFrame:nodes[id].last,fps:nodes[id].fps,resolution:nodes[id].resolution}[p]),
 filePathExists:p=>files.has(p)||dirs.has(p),getFolderFromPath:p=>p.slice(0,p.lastIndexOf('/')),makeFolder:p=>{dirs.add(p);return true;},writeToFile:(p,s)=>{files.set(p,s);return true;},readFromFile:p=>files.get(p)||'',
 Timer:function(o){tick=o.onTimeout;this.start=()=>{};this.stop=()=>{};this.setRepeating=()=>{};this.setInterval=()=>{};}};
for(const method of ['duplicate','deleteLayer','set','setFrame','setActiveComp','addRenderQueueItem','render','rename','connect','saveScene'])api[method]=()=>{throw Error('Editing scene mutation forbidden: '+method);};
const ui={setTitle(){},setMinimumWidth(){},Label:function(){this.setText=()=>{};},Button:function(){},add(){},show(){},addCallbackObject:o=>callbacks=o};
const backend={submit:(source,options)=>{assert(!liveJob,'only one renderer job may run at once');const h={id:'native'+submitted.length,source,options,done:0};submitted.push(h);liveJob=h;return h;},poll:h=>{assert(liveJob===h);if(h.cancelled){liveJob=null;return {phase:'cancelled'};}h.done=Math.min(h.options.count,h.done+2);const r={phase:h.done===h.options.count?'complete':'rendering',done:h.done,sizes:Array(h.done).fill('150')};if(r.phase==='complete')liveJob=null;return r;},cancel:h=>{h.cancelled=true;cancelled.push(h);},keepAlive(){},inspect(){}};
const ctx={api,ui,Date:Clock,createBackgroundRenderer:()=>backend,editFingerprint:(_,id)=>nodes[id].sig};vm.createContext(ctx);
for(const n of ['source.js','scheduler.js','channel.js','worker.js'])vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/'+n,'utf8'),ctx);
function put(path,o){files.set(root+path,JSON.stringify(o));}
function command(id,action='connect',quality=50,first=0,last=99,alpha=false){files.set(root+'/channels/'+id+'/control.txt',['CAVALRY_NATIVE_4','r'+(++serial),action,quality,time,'AE','1',first,last,alpha?'1':'0','END',''].join('\n'));}
let ids=['101','202'];
function step(n=1){while(n--){time+=33;files.set(root+'/active-channels.txt',['CNCHANNELS1',time,...ids,'END',''].join('\n'));tick();}}
function state(id){return (files.get(root+'/channels/'+id+'/state.txt')||'').split('\n')[4];}
function until(f){for(let n=0;n<500&&!f();n++)step();assert(f(),'channels made progress');}
put('/channels/101/binding.json',{uuid:'uuidA',name:'Same name'});put('/channels/202/binding.json',{uuid:'uuidB',name:'Same name'});
command('101','connect',25,1,5,true);command('202','connect',100,10,13,false);
until(()=>state('101')==='ready'&&state('202')==='ready');assert.deepEqual(submitted.map(x=>x.source),['A','B']);
assert.equal(submitted[0].options.count,5);assert.equal(submitted[1].options.count,4);assert.equal(submitted[0].options.transparent,true);assert.equal(submitted[1].options.scale,100);
const aCache=files.get(root+'/channels/101/complete.txt'),bCache=files.get(root+'/channels/202/complete.txt');assert.notEqual(aCache,bCache);
activeComp='B';nodes.A.name='Renamed A';step(40);assert.equal(submitted.length,2,'switching active comp or renaming does not cross-bind UUIDs');
let catalog=JSON.parse(files.get(root+'/compositions.json'));assert.equal(catalog.compositions.find(c=>c.uuid==='uuidA').name,'Renamed A');
nodes.A.sig='a2';callbacks.onAttrChanged('shapeA','position');until(()=>submitted.length===3&&state('101')==='ready');assert.equal(submitted[2].source,'A');assert.equal(files.get(root+'/channels/202/complete.txt'),bCache,'editing A must not replace B cache');
command('101','pause');step(12);assert.equal(state('101'),'paused');nodes.B.sig='b2';callbacks.onAttrChanged('shapeB','position');until(()=>submitted.length===4&&state('202')==='ready');assert.equal(state('101'),'paused');
// Simultaneous edits cancel only their own requests and both eventually finish.
command('101');nodes.B.sig='b3';callbacks.onAttrChanged('shapeB','position');until(()=>state('101')==='rendering'||state('101')==='starting');nodes.A.sig='a3';callbacks.onAttrChanged('shapeA','position');until(()=>state('101')==='ready'&&state('202')==='ready');
const oldGeneration=files.get(root+'/channels/101/complete.txt').split('\n')[1];ids=['202'];step(12);assert.equal(state('101'),'offline');ids=['101','202'];until(()=>state('101')==='ready');assert.notEqual(files.get(root+'/channels/101/complete.txt').split('\n')[1],oldGeneration,'reopening a channel must never overwrite published frames');
// Missing UUID cannot fall back to whichever comp is active.
const sourceA=nodes.A;delete nodes.A;command('101');step(15);assert.equal(state('101'),'missingSource');assert.equal(state('202'),'ready');
const count=submitted.length;nodes.B.uuid='replacedUUID';command('202','connect',100,10,13,true);step(15);assert.equal(state('202'),'missingSource');assert.equal(submitted.length,count);
// Reopening a project may load its compositions after the scene callback.
callbacks.onSceneChanged();step(40);assert.equal(submitted.length,count,'never bind a missing UUID by name or active comp');
nodes.A=sourceA;nodes.B.uuid='uuidB';until(()=>state('101')==='ready'&&state('202')==='ready');assert.equal(submitted.length,count+2,'same UUIDs recover without another Connect command');
assert.equal(submitted.at(-1).options.scale,100);assert.equal(submitted.at(-1).options.first,10);
command('101','pause');step(12);callbacks.onSceneChanged();until(()=>state('202')==='ready');assert.equal(state('101'),'paused','scene reopen never enables a paused stream');
delete nodes.B;callbacks.onSceneChanged();step(40);command('202','pause');step(12);assert.equal(state('202'),'paused');
nodes.B={uuid:'uuidB',name:'Same name',first:10,last:13,fps:30,resolution:{x:200,y:200},sig:'b1'};const stoppedCount=submitted.length;step(50);assert.equal(submitted.length,stoppedCount,'pause cancels pending source recovery');
ui.onClose();assert.equal(files.get(root+'/state.txt').split('\n')[4],'offline');assert.equal(files.get(root+'/renderer-demand.txt'),'0');
console.log('PASS two UUID-bound compositions, FIFO shared renderer, independent ranges/quality/alpha/pause/caches, rename, edits, cancellation, removal and immutable reopening');
