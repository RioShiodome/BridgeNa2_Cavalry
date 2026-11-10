(function(){
 var comp=app.project.activeItem;
 if(!(comp instanceof CompItem)){alert('请先打开目标 AE 合成。');return;}
 var match='Cavalry Native Preview',installed=false;
 var available=app.effects;for(var i=0;i<available.length;i++)if(available[i].matchName===match)installed=true;
 if(!installed){alert('AE 尚未载入 BridgeNa2_Cavalry 原生插件。请先运行安装命令，保存工程并正常重启 AE。');return;}
 var input=prompt('动画在 AE 中占用多少秒？','5');if(input===null)return;
 var seconds=Number(input);if(!isFinite(seconds)||seconds<0.04||seconds>10800){alert('请输入 0.04–10800 秒。');return;}
 try{var root=$.global.BN_CacheRoot();if(!root.parent.exists)root.parent.create();if(!root.exists)root.create();}catch(e){alert(String(e));return;}
 var start=Math.max(0,comp.time);seconds=Math.max(1,Math.round(seconds*comp.frameRate))/comp.frameRate;
 if(start+seconds>10800){alert('插入后超过 AE 合成的最大时长。');return;}
 app.beginUndoGroup('创建 BridgeNa2_Cavalry 动画图层');
 try{
  if(comp.duration<start+seconds)comp.duration=start+seconds;
  var layer=comp.layers.addSolid([0,0,0],'BridgeNa2_Cavalry',comp.width,comp.height,comp.pixelAspect,Math.max(comp.duration,start+seconds));
  layer.startTime=start;layer.inPoint=start;layer.outPoint=start+seconds;
  var effect=layer.property('ADBE Effect Parade').addProperty(match);effect.property(3).setValue(seconds);
  layer.comment='BridgeNa2_Cavalry 4.6.4；每个效果可独立选择 Cavalry 合成。';
  var token=new Date().getTime()%16777215+1;effect.property(16).setValue(token);token=effect.property(16).value;
  for(var j=1;j<=comp.numLayers;j++)comp.layer(j).selected=false;layer.selected=true;
 }catch(e){alert(String(e));return;}finally{app.endUndoGroup();}
 $.global.BN46_Select(layer.id,token);
})();
