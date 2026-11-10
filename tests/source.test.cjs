const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/source.js','utf8'),ctx);
const nodes={a:{uuid:'same',name:'case4'},b:{uuid:'same',name:'case5'},c:{uuid:'other',name:'Composition 1'}};
const api={getComps:()=>Object.keys(nodes),get:(id,key)=>nodes[id][key],getSceneFilePath:()=>'/project.cv'};
assert.equal(ctx.bridgeSource(api,{uuid:'same',nodeId:'b'}),'b','nodeId selects the exact duplicate UUID composition');
assert.throws(()=>ctx.bridgeSource(api,{uuid:'same'}),/相同 UUID/,'legacy UUID-only bindings must not guess');
assert.throws(()=>ctx.bridgeSource(api,{uuid:'missing',nodeId:'x'}),/不在当前工程/);
console.log('PASS exact Cavalry composition node routing when UUIDs are duplicated');
