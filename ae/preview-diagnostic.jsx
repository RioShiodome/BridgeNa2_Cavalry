// Read selected BridgeNa2 effect parameters. Does not change the AE project.
(function(){
 try{
  var c=app.project&&app.project.activeItem;
  if(!(c instanceof CompItem)){alert('请打开黑画面所在的合成，并选中 BridgeNa2 图层。');return;}
  var layers=c.selectedLayers;if(!layers.length){alert('请先选中出现黑画面的 BridgeNa2 图层。');return;}
  var report={tool:'BridgeNa2 preview diagnostic 1',ae:app.version,os:$.os,bitsPerChannel:app.project.bitsPerChannel,workingSpace:app.project.workingSpace,comp:{name:c.name,time:c.time,width:c.width,height:c.height,frameRate:c.frameRate},layers:[]};
  var fields={2:'live',3:'duration',4:'quality',5:'cachedPercent',6:'revision',7:'offset',10:'customRange',11:'first',12:'last',13:'transparent',14:'channel'};
  for(var i=0;i<layers.length;i++){
   var l=layers[i],es=l.property('ADBE Effect Parade'),effects=[];
   for(var j=1;j<=es.numProperties;j++){
    var e=es.property(j);if(e.matchName!=='Cavalry Native Preview')continue;
    var data={enabled:e.enabled,name:e.name};for(var k in fields)if(Number(k)<=e.numProperties)data[fields[k]]=e.property(Number(k)).value;
    var v=Number(data.channel),n=Number(data.revision);
    if(v>0&&v<=2000000001&&Math.floor(v)===v&&n>0&&n<=2000000001&&Math.floor(n)===n){
     try{
      var root=$.global.BN_CacheRoot(v);var snapshot=File(root.fsName+'/snapshots/'+n+'.txt');
      data.cacheRoot=root.fsName;data.snapshotExists=snapshot.exists;
      if(snapshot.exists){snapshot.encoding='UTF-8';if(snapshot.open('r')){data.snapshotText=snapshot.read(12000);snapshot.close();}}
     }catch(pathError){data.pathError=String(pathError);}
    }
    effects.push(data);
   }
   if(effects.length)report.layers.push({name:l.name,id:l.id,enabled:l.enabled,locked:l.locked,solo:l.solo,startTime:l.startTime,inPoint:l.inPoint,outPoint:l.outPoint,stretch:l.stretch,effects:effects});
  }
  if(!report.layers.length){alert('选中图层上没有 BridgeNa2_Cavalry 效果。');return;}
  var output=File.saveDialog('保存黑画面诊断报告（不修改工程）');if(!output)return;
  if(!/\.json$/i.test(output.name))output=File(output.fsName+'.json');output.encoding='UTF-8';
  if(!output.open('w'))throw Error('无法写入报告');output.write(JSON.stringify(report));output.close();
  alert('已保存诊断报告：\n'+output.fsName+'\n报告含合成、图层名称和本机缓存路径。');
 }catch(e){alert('诊断报告失败：'+String(e));}
})();
