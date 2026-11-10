const fs=require('fs'),vm=require('vm'),assert=require('assert');
let now=1000,scene='/project/a.cv',serial=0;const files=new Map(),calls=[],root='/cache/channels/101';
const nodes={A:{uuid:'shared',name:'Composition 1'},B:{uuid:'shared',name:'case5'}};
class Clock extends Date{static now(){return now;}}
const api={uuid:()=>String(++serial),getSceneFilePath:()=>scene,getComps:()=>Object.keys(nodes),layerExists:id=>!!nodes[id],getNiceName:id=>nodes[id].name,
 get:(id,key)=>({...nodes[id],startFrame:0,endFrame:3,fps:25,resolution:{x:64,y:64}}[key]),filePathExists:p=>files.has(p),getFolderFromPath:()=>'',makeFolder:()=>true,
 readFromFile:p=>files.get(p)||'',writeToFile:(p,s)=>{files.set(p,s);return true;}};
const backend={submit:(source,options)=>{calls.push(source);return {options};},poll:h=>({phase:'complete',done:h.options.count,sizes:Array(h.options.count).fill('100')}),cancel:()=>{}};
const ctx={Date:Clock,editFingerprint:(_,id)=>id};vm.createContext(ctx);for(const n of ['source.js','channel.js'])vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/'+n,'utf8'),ctx);
const binding={protocol:2,nodeId:'B',uuid:'shared',name:'case5',scene,owner:'editor'};files.set(root+'/binding.json',JSON.stringify(binding));const c=ctx.createPreviewChannel(api,root,backend,'editor',()=>true);
function command(action='connect'){files.set(root+'/control.txt',['CAVALRY_NATIVE_4','r'+(++serial),action,25,now,'AE','END',''].join('\n'));}
function step(n=30){while(n--){now+=100;c.tick();}}
command();step();assert.deepEqual(calls,['B']);assert.equal(c.phase(),'ready');const complete=files.get(root+'/complete.txt');
scene='/project/copied-scene.cv';c.callbacks.onSceneChanged();step();assert.equal(c.phase(),'missingSource');assert.deepEqual(calls,['B']);assert.equal(files.get(root+'/complete.txt'),complete);
scene='/project/a.cv';c.callbacks.onSceneChanged();step();assert.deepEqual(calls,['B','B']);
delete nodes.B;c.callbacks.onLayerRemoved('B');step();assert.equal(c.phase(),'missingSource');assert.deepEqual(calls,['B','B'],'never fall back to A although its UUID matches');
files.set(root+'/binding.json',JSON.stringify({uuid:'shared'}));nodes.B={uuid:'shared',name:'case5'};command();step();assert.equal(c.phase(),'missingSource');assert.deepEqual(calls,['B','B'],'ambiguous legacy binding needs reselection');
files.set(root+'/binding.json',JSON.stringify({...binding,scene:'',owner:'old-editor'}));command();step();assert.equal(c.phase(),'missingSource','unsaved scene identity expires with its editor owner');
command('pause');step();assert.equal(c.phase(),'paused');c.shutdown();
console.log('PASS editor channel picks exact duplicate UUID node, rejects another scene, preserves cache, resumes original scene, and never guesses missing/legacy sources');
