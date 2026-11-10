const fs=require('fs'),vm=require('vm'),assert=require('assert');let serial=0,rendered=0,interruptNext=false;const files=new Map(),nodes=new Map([['source',{uuid:'sourceUUID',fps:25,startFrame:0,endFrame:7,backgroundColor:{a:255,r:255,g:255,b:255}}]]),dirs=new Set(['/root','/root/cache','/renders']);
const definitions={filePath:{type:'string'},fileName:{type:'string'},frameRangeMode:{type:'enum',enumValues:[0,1,2,3]},frameRange:{type:'int2'},resolutionScale:{type:'double',numericInfo:{hardMin:.1}},'targets.0.remapFPS':{type:'bool'},backgroundColor:{type:'color'},fps:{type:'double'},startFrame:{type:'int'},endFrame:{type:'int'},uuid:{type:'string',isAttrReadOnly:true}};
const api={readFromFile:p=>files.get(p)||'',writeToFile:(p,v)=>{files.set(p,v);return true;},layerExists:id=>nodes.has(id),get:(id,p)=>nodes.get(id)[p],getNiceName:()=> 'Test',getCavalryVersion:()=> '2.7.2',duplicate:id=>{const n='copy'+ ++serial;nodes.set(n,{...nodes.get(id),uuid:n});return n;},rename:()=>{},deleteLayer:id=>nodes.delete(id),addRenderQueueItem:id=>{const q='q'+ ++serial;nodes.set(q,{uuid:q,filePath:'/renders',fileName:'Test',frameRangeMode:0,frameRange:{x:0,y:7},resolutionScale:100,'targets.0.remapFPS':false,target:id});return q;},setGenerator:(id,p,t)=>{if(['renderPNG','renderMP4'].includes(t))nodes.get(id).format=t;},getCurrentGeneratorType:id=>nodes.get(id).format,getAttributes:id=>Object.keys(nodes.get(id)).filter(p=>definitions[p]),getAttributeDefinition:(id,p)=>({attrId:p,numericInfo:{},enumValues:[],...definitions[p]}),getAttributeNiceName:(id,p)=>p,getDropdownNiceName:(id,p,v)=>String(v),hasAttribute:(id,p)=>!!definitions[p],set:(id,values)=>{assert.notEqual(id,'source','must never change editor composition');Object.assign(nodes.get(id),values);},connect:(from,attr,to,path,force)=>{assert.equal(force,true);nodes.get(to).target=from;},filePathExists:p=>dirs.has(p)||files.has(p),getFolderFromPath:p=>p.slice(0,p.lastIndexOf('/')),makeFolder:p=>{dirs.add(p);return true;},listDirectoryRecursive:()=>['/renders/a.png'],isFile:()=>true};
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/bake.js','utf8'),context);const captures=[];const b=context.createBakeBridge(api,'/root/cache',{submit:q=>{assert(nodes.has(nodes.get(q).target));rendered++;captures.push({queue:{...nodes.get(q)},comp:{...nodes.get(nodes.get(q).target)}});return {id:'job'};},poll:()=>({phase:interruptNext?'cancelled':'complete'}),cancel:()=>{}});
function request(id,action,extra={}){files.set('/root/cache/bake-request.json',JSON.stringify({protocol:1,id,action,session:'bopen',...extra}));b.tick('source');return JSON.parse(files.get('/root/cache/bake-response.json'));}
assert.equal(request('bopen','open').phase,'settings');assert.equal(request('bapply','apply',{values:[{scope:'comp',path:'backgroundColor',value:{r:255,g:255,b:255,a:0}}]}).phase,'settings','object key order must not reject valid colors');
assert.equal(request('bbad','apply',{values:[{scope:'queue',path:'resolutionScale',value:-1}]}).phase,'error');assert.equal(rendered,0);
assert.equal(request('bstale','render',{session:'wrong'}).phase,'error');assert.equal(rendered,0);
assert.equal(request('bwrongformat','apply',{format:'renderUnknown'}).phase,'error');
assert.equal(request('bbake','render').phase,'rendering');b.tick('source');assert.equal(JSON.parse(files.get('/root/cache/bake-response.json')).phase,'complete');assert.equal(rendered,1);assert.equal(nodes.size,1,'private rendering nodes cleaned');assert.equal(nodes.get('source').backgroundColor.a,255);
request('bopen','open');nodes.get('source').uuid='replaced';assert.equal(request('breplaced','render').phase,'error');assert.equal(rendered,1);b.close();assert.equal(nodes.size,1);
nodes.get('source').uuid='sourceUUID';request('bopen','open');interruptNext=true;assert.equal(request('bcancel','render').phase,'rendering');b.tick('source');assert.equal(JSON.parse(files.get('/root/cache/bake-response.json')).phase,'error','cancelled bake must not import partial output');b.close();assert.equal(nodes.size,1);
console.log('PASS interrupted bake, bake schema, value validation, stale requests, fresh snapshot, forced retarget, source identity, cleanup and original preservation');

interruptNext=false;
let opened=request('bopen','open',{previewRange:{first:2,last:5},transparent:true});assert.equal(opened.phase,'settings');assert.equal(opened.rangeMode,2);assert.deepEqual(opened.range,{x:2,y:5});
assert.equal(nodes.get('source').backgroundColor.a,255);
let rendering=request('brangebake','render',{transparent:true});assert.equal(rendering.total,4);assert.equal(captures[captures.length-1].comp.backgroundColor.a,0);assert.equal(captures[captures.length-1].queue.frameRange.x,2);
b.tick('source');assert.equal(nodes.size,1);assert.equal(nodes.get('source').backgroundColor.a,255);
request('bopen','open',{previewRange:{first:7,last:99},transparent:true});request('bopaque','render',{transparent:false});assert.equal(captures[captures.length-1].comp.backgroundColor.a,255);assert.deepEqual(captures[captures.length-1].queue.frameRange,{x:7,y:7});b.tick('source');
request('bopen','open');const renders=rendered;assert.equal(request('breversed','render',{values:[{scope:'queue',path:'frameRangeMode',value:2},{scope:'queue',path:'frameRange',value:{x:5,y:2}}]}).phase,'error');assert.equal(rendered,renders);b.close();
console.log('PASS baking defaults to AE range, inclusive count, transparent/scene background and invalid-range rejection');
request('bopen','open',{previewRange:{first:2,last:5},transparent:true});
request('bstage','apply',{values:[{scope:'queue',path:'resolutionScale',value:25}]});
const saved=b.snapshot();b.close();assert.equal(nodes.size,1);
nodes.get('source').fps=30; // Edits made while the AE settings window is open.
b.restore(saved,'source');const refreshed=request('brefresh','apply');
assert.equal(refreshed.phase,'settings');assert.equal(refreshed.fields.find(f=>f.path==='resolutionScale').value,25);
assert.deepEqual(refreshed.range,{x:2,y:5});assert.equal(nodes.get('source').backgroundColor.a,255);
request('bfresh','render');assert.equal(captures.at(-1).comp.fps,30);assert.equal(captures.at(-1).comp.backgroundColor.a,0);b.tick('source');assert.equal(nodes.size,1);
assert.throws(()=>b.restore({...saved,sourceUUID:'expired'},'source'),/原合成已改变/);
assert.throws(()=>b.restore({...saved,sourceNodeId:'same-uuid-other-comp'},'source'),/原合成已改变/);
console.log('PASS staged Render Manager settings survive scene reload, use fresh animation and preserve source identity');
request('bopen','open');api.deleteLayer=()=>{throw Error('Scene teardown forbids deletion');};
b.shutdown();assert.equal(b.isRendering(),false);
console.log('PASS application shutdown abandons private editor nodes without touching a destroying scene');
