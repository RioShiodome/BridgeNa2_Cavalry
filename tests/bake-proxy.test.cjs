const fs=require('fs'),vm=require('vm'),assert=require('assert');
const files=new Map(),requests=[],cancelled=[];let uuid='source-1',exists=true,interrupted=0,pollError=false,heartbeats=0;
const base={filePathExists:p=>files.has(p),readFromFile:p=>files.get(p),writeToFile:(p,s)=>{files.set(p,s);return true;},layerExists:()=>exists,get:(id,p)=>{assert.equal(p,'uuid');return uuid;}};
const api=new Proxy(base,{get:(o,p)=>{if(!(p in o))throw Error('Editor attempted unapproved API: '+p);return o[p];}});
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/bake-proxy.js','utf8'),context);
const background={submit:(source,options)=>{const h={source,options,phase:'starting'};requests.push(h);return h;},poll:h=>{if(pollError)throw Error('renderer failed');return {phase:h.phase};},cancel:h=>cancelled.push(h),keepAlive:()=>heartbeats++};
const b=context.createBakeProxy(api,'/cache',background,()=>interrupted++);
function request(id,action,extra={}){files.set('/cache/bake-request.json',JSON.stringify({protocol:1,id,action,session:'bopen',...extra}));b.tick('source');return response();}
function response(){return JSON.parse(files.get('/cache/bake-response.json'));}
function reply(phase){const h=requests.at(-1);files.set('/cache/bake-response.json',JSON.stringify({id:h.options.bakeRequest.id,phase}));h.phase='complete';b.tick('source');}
assert.equal(request('bopen','open',{transparent:true,previewRange:{first:5,last:9}}).phase,'loading');
assert(b.isRendering());assert.equal(requests[0].source,'source');assert.equal(requests[0].options.kind,'bake-control');
assert.equal(requests[0].options.bakeRequest.transparent,true);reply('settings');assert(!b.isRendering());
const beats=heartbeats;b.tick('source');assert(heartbeats>beats,'an idle settings panel must retain its renderer session');
request('bapply','apply',{format:'renderPNG',values:[{scope:'queue',path:'resolutionScale',value:25}]});assert.equal(requests.length,2);reply('settings');
request('brender','render');assert(b.isRendering());assert.equal(requests.length,3);reply('complete');assert(!b.isRendering());
assert.equal(interrupted,3);assert.equal(request('bwrong','render',{session:'expired'}).phase,'error');assert.equal(requests.length,3);
uuid='changed';assert.equal(request('bstale','render').phase,'error');assert.equal(requests.length,3);uuid='source-1';
request('bretry','render');pollError=true;b.tick('source');assert.equal(response().phase,'error');assert(!b.isRendering());pollError=false;
request('bcancel','render');const last=requests.at(-1);request('bclose','close');assert(cancelled.includes(last));assert(!b.isRendering());
request('bopen','open');b.shutdown();assert(!b.isRendering());
const beforeRestart=requests.length;const fresh=context.createBakeProxy(api,'/cache',background);fresh.tick('source');assert.equal(requests.length,beforeRestart,'restart must not replay the previous bake request');
files.set('/cache/bake-request.json',JSON.stringify({protocol:1,id:'bnew',action:'open'}));fresh.tick('source');assert(fresh.isRendering());
files.set('/cache/bake-response.json','{"id":');fresh.tick('source');assert(fresh.isRendering(),'a partially written response is retried, not treated as a failed render');fresh.close();
files.set('/cache/bake-request.json',JSON.stringify({protocol:1,id:'brecent',action:'open',stamp:Date.now()}));const newlyDiscovered=context.createBakeProxy(api,'/cache',background);const num=requests.length;newlyDiscovered.tick('source');assert.equal(requests.length,num+1,'a new channel accepts a settings open sent just before channel discovery');newlyDiscovered.close();
console.log('PASS bake proxy settings, session keep-alive, render, errors, source identity, cancellation and shutdown without editor mutations');
const lazy=context.createBakeProxy(api,'/lazy',background);let resolutions=0;
function missing(){resolutions++;throw Error('source missing');}
lazy.tick(missing);assert.equal(resolutions,0,'an idle/paused channel must not resolve a missing source for baking');
files.set('/lazy/bake-request.json',JSON.stringify({protocol:1,id:'bmissing',action:'open'}));lazy.tick(missing);assert.equal(resolutions,1);assert.equal(JSON.parse(files.get('/lazy/bake-response.json')).phase,'error','a failed source lookup returns an explicit bake response');
