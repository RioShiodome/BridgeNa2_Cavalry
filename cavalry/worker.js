(function(){
    var rolePath=api.getPreferencesFolder()+'/BridgeNa2-renderer.json';
    if(api.filePathExists(rolePath)){runRendererHost(api,ui,JSON.parse(api.readFromFile(rolePath)));return;}
    var root=api.getHomeFolder()+'/Cavalry AE Native/default',owner=String(api.uuid()).replace(/[^a-zA-Z0-9]/g,''),channels={},stopped=false,busy=false,lastIO=0,lastCatalog=0,lastLabel='',catalogDirty=true;
    function read(p){try{return api.filePathExists(p)?api.readFromFile(p).replace(/^\uFEFF/,'').replace(/\r/g,''):'';}catch(_){return '';}}
    function ensure(p){if(api.filePathExists(p))return;var parent=api.getFolderFromPath(p);if(parent&&parent!==p)ensure(parent);if(!api.makeFolder(p))throw Error('Cannot create '+p);}
    function write(p,s){if(!api.writeToFile(p,s,true))throw Error('Cannot write '+p);}
    function own(){return read(root+'/owner.txt')===owner;}
    ensure(root);ensure(root+'/channels');write(root+'/owner.txt',owner);
    var scheduler=createRenderScheduler(api,root);
    ui.setTitle('BridgeNa2_Cavalry');ui.setMinimumWidth(380);
    var label=new ui.Label('BridgeNa2_Cavalry：在 AE 选择 Cavalry 合成');ui.add(label);
    var inspect=new ui.Button('检查后台 / 登录');inspect.onClick=function(){scheduler.inspect();};ui.add(inspect);ui.show();
    function catalog(){
        var entries=api.getComps().map(function(id){return {nodeId:id,uuid:api.get(id,'uuid'),name:api.getNiceName(id),resolution:api.get(id,'resolution'),fps:api.get(id,'fps'),first:api.get(id,'startFrame'),last:api.get(id,'endFrame')};});
        write(root+'/compositions.json',JSON.stringify({protocol:2,owner:owner,stamp:Date.now(),scene:api.getSceneFilePath(),compositions:entries}));lastCatalog=Date.now();catalogDirty=false;
    }
    function activeChannels(){
        var a=read(root+'/active-channels.txt').split('\n');
        if(a[0]!=='CNCHANNELS1')return ['0']; // compatibility with an already loaded older AE binary
        if(a[a.length-2]!=='END'||a[a.length-1]!==''||!/^\d+$/.test(a[1]))return null; // partial write: retain prior set
        if(Math.abs(Date.now()-Number(a[1]))>7000)return [];
        return a.slice(2,-2).filter(function(id){return /^(0|[1-9][0-9]{0,9})$/.test(id)&&Number(id)<=2000000001;});
    }
    function syncChannels(){
        var ids=activeChannels();if(ids===null)return;
        var needed={};ids.forEach(function(id){needed[id]=true;if(!channels[id]){var path=id==='0'?root:root+'/channels/'+id;ensure(path);channels[id]=createPreviewChannel(api,path,scheduler.channel(path),owner,own);}});
        Object.keys(channels).forEach(function(id){if(!needed[id]){channels[id].shutdown(id!=='0');delete channels[id];}});
    }
    function heartbeat(offline){
        var ids=Object.keys(channels),enabled=0,queued=0,rendering=0,errors=0;
        ids.forEach(function(id){var c=channels[id];if(c.enabled())enabled++;var p=c.phase();if(p==='queued')queued++;if(/^(rendering|loading|starting|baking)$/.test(p))rendering++;if(p==='error'||p==='missingSource')errors++;});
        // Global state belongs to process lifecycle; individual streams have
        // their own status and cache manifests under channels/<id>.
        if(offline||!channels['0'])write(root+'/state.txt',['CAVALRY_NATIVE_4',owner,'',String(Date.now()),offline?'offline':'ready','0','0','','','0','END',''].join('\n'));
        if(!offline){var text='已连接 '+enabled+' 个合成 · 更新 '+rendering+' · 排队 '+queued+(errors?' · 错误 '+errors:'');if(text!==lastLabel){label.setText(text);lastLabel=text;}}
    }
    function broadcast(name,args){if(stopped)return;catalogDirty=true;Object.keys(channels).forEach(function(id){var fn=channels[id].callbacks[name];if(fn)fn.apply(null,args);});}
    var callbacks={};['onAttrChanged','onLayerAdded','onLayerRemoved','onAttrConnected','onAttrDisconnected','onAssetAdded','onAssetRemoved','onAssetUpdated','onAssetAsyncLoadFinished','onAppStateChanged','onSceneChanged'].forEach(function(name){callbacks[name]=function(){broadcast(name,arguments);};});ui.addCallbackObject(callbacks);
    function shutdown(){if(stopped)return;stopped=true;timer.stop();Object.keys(channels).forEach(function(id){channels[id].shutdown();});try{scheduler.shutdown();}catch(_){}try{if(own()){heartbeat(true);write(root+'/renderer-demand.txt','0');}}catch(_){} }
    function tick(){
        if(stopped||busy)return;busy=true;
        try{
            if(!own()){shutdown();return;}
            var now=Date.now();
            if(now-lastIO>=250){syncChannels();lastIO=now;}
            if(now-lastCatalog>1000||(catalogDirty&&now-lastCatalog>500))catalog();
            Object.keys(channels).forEach(function(id){channels[id].tick();});scheduler.tick();
            if(now-lastIO<34)heartbeat(false);
        }catch(e){try{write(root+'/last-error.txt',String(e));label.setText('桥接错误：'+e);}catch(_){} }
        finally{busy=false;}
    }
    var timer=new api.Timer({onTimeout:tick});timer.setRepeating(true);timer.setInterval(33);timer.start();ui.onClose=shutdown;tick();
})();
