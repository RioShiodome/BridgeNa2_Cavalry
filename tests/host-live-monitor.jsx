(function(){
 var c=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).name==='Native Test')c=app.project.item(i);
 var e=c.layer(1).property('ADBE Effect Parade').property(1);e.property(3).setValue(4);e.property(2).setValue(1);
 $.global.CNativeEvents=[];$.global.CNativeStarted=new Date().getTime();
 $.global.CNativeMonitor=function(){try{var c=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).name==='Native Test')c=app.project.item(i);var l=c.layer(1),e=l.property('ADBE Effect Parade').property(1);$.global.CNativeEvents.push({ms:new Date().getTime()-$.global.CNativeStarted,revision:e.property(6).value,progress:e.property(5).value,seconds:e.property(3).value,inPoint:l.inPoint,outPoint:l.outPoint});var f=new File('/Users/moonshot/cavalry-ae-native/tests/live-events.json');f.open('w');f.write(JSON.stringify($.global.CNativeEvents));f.close();if(new Date().getTime()-$.global.CNativeStarted<14000)app.scheduleTask('$.global.CNativeMonitor()',180,false);}catch(x){}};
 $.global.CNativeMonitor();
})();
