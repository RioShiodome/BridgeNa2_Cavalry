const fs=require('fs'),vm=require('vm'),assert=require('assert');
const files=new Map(),nodes=[];
function UI(kind,text){this.kind=kind;this.text=typeof text==='string'?text:'';this.children=[];this.items=[];this.enabled=true;this.preferredSize={};this.layout={layout(){},resize(){}};nodes.push(this);if(Array.isArray(text))text.forEach(t=>this.add('item',t));}
Object.defineProperty(UI.prototype,'selection',{get(){return this._selection;},set(v){this._selection=typeof v==='number'?this.items[v]:v;}});
UI.prototype.add=function(kind,bounds,text){const x=new UI(kind,arguments.length===2?bounds:text);x.index=this.items.length;x.subItems=[{text:''}];this.children.push(x);if(kind==='item')this.items.push(x);return x;};
UI.prototype.removeAll=function(){this.children=[];this.items=[];this._selection=null;};UI.prototype.remove=function(x){this.children.splice(this.children.indexOf(x),1);};UI.prototype.show=function(){};UI.prototype.close=function(){if(this.onClose)this.onClose();};
function File(path){if(!(this instanceof File))return new File(path);this.path=path;this.name=path.split('/').pop();this.exists=files.has(path);}File.prototype.open=function(){return true;};File.prototype.read=function(){return files.get(this.path);};File.prototype.write=function(s){files.set(this.path,s);};File.prototype.close=function(){};
function Folder(path){if(!(this instanceof Folder))return new Folder(path);this.fsName=path;}Folder.prototype.getFiles=()=>[];
const values={2:1,9:778,10:1,11:20,12:29,13:1,14:202},effect={matchName:'Cavalry Native Preview',numProperties:16,property:i=>({get value(){return values[i];},setValue:v=>values[i]=v})};
const layer={id:42,locked:false,property:()=>({numProperties:1,property:()=>effect})};function CompItem(){this.numLayers=1;this.layer=()=>layer;}
const app={project:{numItems:1,item:()=>new CompItem()},scheduleTask(){}};const G={};
vm.runInNewContext(fs.readFileSync(__dirname+'/../ae/cache-root.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../ae/bake-panel.jsx','utf8'),{$:{global:G},Window:function(k,t){return new UI(k,t);},Folder,File,CompItem,app,alert:s=>{throw Error(s);},JSON,Date});
G.CN41_Open(42,778);const root='~/Cavalry AE Native/default/channels/202';let request=JSON.parse(files.get(root+'/bake-request.json'));assert.deepEqual(request.previewRange,{first:20,last:29});assert.equal(request.transparent,true);
files.set(root+'/bake-response.json',JSON.stringify({id:request.id,phase:'settings',session:'bsettings',format:'renderPNG',formats:[{type:'renderPNG',label:'PNG'}],fields:[],rangeMode:2,range:{x:20,y:29},version:'2.7.2'}));G.CN41.current.poll();
nodes.find(n=>n.kind==='button'&&n.text==='烘焙到当前图层').onClick();request=JSON.parse(files.get(root+'/bake-request.json'));assert.equal(request.action,'render');assert.equal(request.transparent,true);assert.equal(request.session,'bsettings');assert.deepEqual(request.values,[{scope:'queue',path:'frameRangeMode',value:2},{scope:'queue',path:'frameRange',value:{x:20,y:29}}]);assert.equal(values[2],0);
assert(!files.has('~/Cavalry AE Native/default/bake-request.json'),'bake must not target the global channel');
console.log('PASS per-channel bake panel inherits AE range/alpha and sends them on Bake, then freezes live preview');
