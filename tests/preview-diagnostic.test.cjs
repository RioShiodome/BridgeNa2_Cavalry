const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname+'/..',source=fs.readFileSync(root+'/ae/preview-diagnostic.jsx','utf8');
let written='',alerts=[],opens=[];
const values={2:1,3:5,4:2,5:100,6:1234,7:0,10:0,11:0,12:249,13:0,14:101};
const effect={matchName:'Cavalry Native Preview',numProperties:16,enabled:true,name:'case5',property:n=>({value:values[n]})};
const layer={name:'bridge',id:42,enabled:true,locked:false,solo:false,startTime:0,inPoint:0,outPoint:5,stretch:100,property:()=>({numProperties:1,property:()=>effect})};
function CompItem(){this.name='Test';this.time=2;this.width=1920;this.height=1080;this.frameRate=25;this.selectedLayers=[layer];}
function File(path){return {fsName:path,name:path.split('/').pop(),exists:/snapshots/.test(path),open:mode=>{opens.push(mode);return true;},read:()=> 'CNSNAPSHOT4\nfixture',write:s=>{written=s;},close:()=>{}};}
File.saveDialog=()=>File('/report.json');
const app={version:'26',project:{activeItem:new CompItem(),bitsPerChannel:16,workingSpace:'sRGB'}};
const G={BN_CacheRoot:n=>({fsName:'C:/Users/测试/Cavalry AE Native/default/channels/'+n})};
const context={app,CompItem,File,$:{os:'Windows 11',global:G},JSON,alert:s=>alerts.push(s)};
const before=JSON.stringify({app,layer,values});
vm.runInNewContext(source,context);let report=JSON.parse(written);
assert.equal(report.layers[0].effects[0].cachedPercent,100);assert.equal(report.layers[0].effects[0].revision,1234);assert(report.layers[0].effects[0].snapshotExists);assert.equal(report.comp.time,2);assert.equal(report.bitsPerChannel,16);
assert.equal(JSON.stringify({app,layer,values}),before);assert.deepEqual(opens,['r','w']);assert.equal(alerts.length,1);
G.BN_CacheRoot=()=>{throw Error('cannot locate profile');};written='';vm.runInNewContext(source,context);report=JSON.parse(written);assert.match(report.layers[0].effects[0].pathError,/cannot locate profile/);
File.saveDialog=()=>null;written='';vm.runInNewContext(source,context);assert.equal(written,'');assert.equal(JSON.stringify({app,layer,values}),before);
console.log('PASS AE report reads selected channel/revision/timing, records path errors, respects Save cancellation, and leaves project/parameters unchanged');
