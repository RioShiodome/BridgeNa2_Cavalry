const fs=require('fs'),vm=require('vm'),assert=require('assert');
let active=null,failSubmit=false,failPoll=false,uuid='U',time=0;const submissions=[],cancelled=[],backend={
 submit:(source,options)=>{if(failSubmit){failSubmit=false;throw Error('snapshot failed');}assert(!active);const h={source,options,phase:'rendering'};submissions.push(h);active=h;return h;},
 poll:h=>{assert.equal(h,active);if(failPoll){active=null;failPoll=false;throw Error('render failed');}const r={phase:h.phase,done:0};if(/complete|cancelled/.test(h.phase))active=null;return r;},
 cancel:h=>{cancelled.push(h);h.phase='cancelled';},keepAlive(){},inspect(){}};
const c={Date:{now:()=>time},createBackgroundRenderer:()=>backend};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../cavalry/scheduler.js','utf8'),c);
const api={layerExists:()=>true,get:()=>uuid},s=c.createRenderScheduler(api,'/cache'),a=s.channel('/cache/channels/101'),b=s.channel('/cache/channels/202');
const h1=a.submit('A',{kind:'preview'}),h2=b.submit('B',{kind:'preview'}),h3=a.submit('A',{kind:'preview'});a.cancel(h3);s.tick();assert.equal(submissions.length,1);assert.equal(b.poll(h2).phase,'queued');
a.cancel(h1);s.tick();assert.equal(submissions.length,2);assert.equal(active.source,'B');assert.equal(a.poll(h1).phase,'cancelled');active.phase='complete';s.tick();assert.equal(submissions.length,2,'cancelled queued request never exports');assert.equal(b.poll(h2).phase,'complete');
failSubmit=true;const bad=a.submit('A',{}),good=b.submit('B',{});s.tick();assert.throws(()=>a.poll(bad),/snapshot failed/);s.tick();assert.equal(active.source,'B');failPoll=true;s.tick();assert.throws(()=>b.poll(good),/render failed/);
const stale=a.submit('A',{});uuid='replaced';s.tick();assert.throws(()=>a.poll(stale),/合成已改变/);assert.equal(submissions.length,3);
a.submit('A',{});s.tick();s.shutdown();assert(cancelled.length===2);
console.log('PASS renderer FIFO, cancellation acknowledgement, skip queued cancellation, error recovery and source identity at dispatch');
