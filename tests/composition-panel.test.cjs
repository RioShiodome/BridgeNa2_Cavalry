const fs=require('fs'),vm=require('vm'),assert=require('assert');
const files=new Map(),dirs=new Set(['~','~/Cavalry AE Native','~/Cavalry AE Native/default']),widgets=[];let now=1791867276492,undo=0,failWrite=false,corruptWrite=false;
class Clock extends Date{constructor(){super(now);}static now(){return now;}}
function Folder(path){if(!(this instanceof Folder))return new Folder(path);this.fsName=path;Object.defineProperty(this,'exists',{get:()=>dirs.has(path)});Object.defineProperty(this,'parent',{get:()=>Folder(path.slice(0,path.lastIndexOf('/')))});}Folder.prototype.create=function(){dirs.add(this.fsName);return true;};
function File(path){if(!(this instanceof File))return new File(path);this.path=path;this.exists=files.has(path);}File.prototype.open=()=>true;File.prototype.read=function(){return files.get(this.path);};File.prototype.write=function(s){if(failWrite)return false;files.set(this.path,corruptWrite?s.slice(0,10):s);return true;};File.prototype.close=()=>{};
function UI(kind,text){this.kind=kind;this.text=text;this.items=[];this.preferredSize={};this.enabled=true;widgets.push(this);}UI.prototype.add=function(k,b,t){const x=new UI(k,arguments.length===2?b:t);if(k==='item'){x.index=this.items.length;this.items.push(x);}return x;};UI.prototype.removeAll=function(){this.items=[];this._selection=null;};UI.prototype.show=function(){};UI.prototype.close=function(){};Object.defineProperty(UI.prototype,'selection',{get(){return this._selection;},set(x){this._selection=typeof x==='number'?this.items[x]:x;}});
function effect(token){const v={2:0,5:75,6:456,9:0,14:0,16:token};return {matchName:'Cavalry Native Preview',numProperties:16,name:'BridgeNa2_Cavalry',v,property:i=>({get value(){return v[i];},setValue:n=>v[i]=Math.fround(n)})};}
const e1=effect(123),e2=effect(456),layers=[{id:42,property:()=>({numProperties:1,property:()=>e1})},{id:43,property:()=>({numProperties:1,property:()=>e2})}];function CompItem(){this.numLayers=2;this.layer=n=>layers[n-1];}
const G={},app={project:{numItems:1,item:()=>new CompItem()},beginUndoGroup:()=>undo++,endUndoGroup:()=>undo--};const context={$:{global:G},File,Folder,Window:function(k,t){return new UI(k,t);},CompItem,app,Date:Clock,alert:x=>{throw Error(x);}};vm.createContext(context);for(const name of ['cache-root.js','composition-panel.jsx'])vm.runInContext(fs.readFileSync((process.env.BRIDGE_TEST_SOURCE||__dirname+'/..')+'/ae/'+name,'utf8'),context);
const root='~/Cavalry AE Native/default';const comps=[{nodeId:'compNode#A',uuid:'uuidA',name:'相同名称',fps:24,first:0,last:47,resolution:{x:320,y:180}},{nodeId:'compNode#B',uuid:'uuidB',name:'相同名称',fps:30,first:10,last:59,resolution:{x:640,y:360}}],catalog={protocol:2,owner:'owner-a',scene:'/project/a.cv',stamp:now,compositions:comps};
files.set(root+'/compositions.json',JSON.stringify(catalog));G.BN46_Select(42,123);let list=widgets.find(x=>x.kind==='listbox');assert.equal(list.items.length,2);assert(list.items[1].text.includes('compNode#B'));list.selection=1;widgets.find(x=>x.text==='连接所选合成').onClick();
let id1=e1.v[14];assert(id1>0);assert(files.has(root+'/channels/'+id1+'/binding.json'),'AE float32 channel must address the exact directory created by the picker');assert.equal(JSON.parse(files.get(root+'/channels/'+id1+'/binding.json')).nodeId,'compNode#B');assert.equal(e1.v[2],1);assert.equal(e1.v[6],0);assert.equal(e2.v[14],0);assert.equal(undo,0);
let id2=G.BN46_Bind(43,456,comps[0],catalog);assert.notEqual(id1,id2,'same-millisecond bindings get unique channels');assert.equal(e1.v[14],id1);assert.equal(e2.v[14],id2);
assert.throws(()=>G.BN46_Bind(42,999,comps[0]),/已删除/);
G.CN41={current:{layerID:42,token:0,running:true}};assert.throws(()=>G.BN46_Bind(42,123,comps[0]),/正在烘焙/);assert.equal(e1.v[14],id1);G.CN41=null;
failWrite=true;assert.throws(()=>G.BN46_Bind(42,123,comps[0]),/写入失败/);assert.equal(e1.v[14],id1);failWrite=false;
corruptWrite=true;assert.throws(()=>G.BN46_Bind(42,123,comps[0]),/无法验证/);assert.equal(e1.v[14],id1);corruptWrite=false;assert.equal(undo,0);
files.set(root+'/compositions.json',JSON.stringify({...catalog,compositions:[comps[1]]}));assert.throws(()=>G.BN46_Bind(42,123,comps[0],catalog),/当前 Cavalry 工程/);assert.equal(e1.v[14],id1);
for(const stamp of [16777213,16777214,16777215,2000000000,1791867276492]){now=stamp;const c={...catalog,stamp};files.set(root+'/compositions.json',JSON.stringify(c));for(let i=0;i<3;i++){const id=G.BN46_Bind(42,123,comps[0],c);assert(id<=16777215&&id>0);assert.equal(e1.v[14],id);assert.equal(JSON.parse(files.get(root+'/channels/'+id+'/binding.json')).uuid,'uuidA');}}
now+=10000;widgets.length=0;G.BN46_Select(42,123);assert.equal(widgets.find(x=>x.text==='连接所选合成').enabled,false,'stale catalog cannot select a previous editor scene');
assert.throws(()=>G.BN46_Bind(42,123,comps[0],catalog),/连接已过期/);
console.log('PASS picker float32 round-trip at observed failure timestamp, collision/wrap boundaries, IO failure rollback, stale/changed scene rejection, UUID binding and bake guard');
// Observed real project: every duplicated comp has the SAME UUID. A selection
// must survive catalog refresh, binding write/read and reopening the picker.
const duplicated=comps.map((c,i)=>({...c,uuid:'shared',name:i?'case5':'Composition 1'}));
const duplicateCatalog={...catalog,stamp:now,compositions:duplicated};
files.set(root+'/compositions.json',JSON.stringify(duplicateCatalog));widgets.length=0;G.BN46_Select(42,123);
list=widgets.find(x=>x.kind==='listbox');list.selection=1;widgets.find(x=>x.text==='连接所选合成').onClick();
const selected=JSON.parse(files.get(root+'/channels/'+e1.v[14]+'/binding.json'));
assert.equal(selected.nodeId,'compNode#B');assert.equal(selected.name,'case5');assert.equal(selected.scene,catalog.scene);assert.equal(selected.protocol,2);
widgets.length=0;G.BN46_Select(42,123);assert.equal(widgets.find(x=>x.kind==='listbox').selection.index,1);
// Another scene can contain the exact same UUID AND node ID. Never connect
// using a list captured from the previous scene.
files.set(root+'/compositions.json',JSON.stringify({...duplicateCatalog,scene:'/other.cv'}));
assert.throws(()=>widgets.find(x=>x.text==='连接所选合成').onClick(),/工程已切换/);
files.set(root+'/compositions.json',JSON.stringify({...duplicateCatalog,protocol:1}));widgets.length=0;G.BN46_Select(42,123);
assert.equal(widgets.find(x=>x.text==='连接所选合成').enabled,false);
console.log('PASS duplicated UUID picker selects case5 by node ID, persists exact source, restores selection, rejects switched scene and old runtime');
