// The editing process exports immutable snapshots; it never calls api.render.
function createBackgroundRenderer(api,root){
    var serial=0,active=null,lastDemand=0,prepared=false,inspectionDemandUntil=0;
    function ensure(p){if(api.filePathExists(p))return;var parent=api.getFolderFromPath(p);if(parent&&parent!==p)ensure(parent);if(!api.makeFolder(p))throw Error('Cannot create '+p);}
    function write(p,x){if(!api.writeToFile(p,JSON.stringify(x),true))throw Error('Cannot write '+p);}
    function read(p){try{if(!api.filePathExists(p))return null;return JSON.parse(api.readFromFile(p));}catch(_){return null;}}
    function demand(){if(Date.now()-lastDemand<500)return;lastDemand=Date.now();api.writeToFile(root+'/renderer-demand.txt',String(Date.now()),true);}
    function submit(source,options){
        ensure(root+'/requests');
        var id='job-'+String(api.uuid()).replace(/[^a-zA-Z0-9]/g,'')+'-'+(++serial),scene=root+'/requests/'+id+'.cv';
        var snapshotStarted=Date.now(),beforeFile=api.getSceneFilePath(),beforeDirty=api.sceneHasUnsavedChanges();
        if(!api.exportSceneAs(scene))throw Error('无法导出后台渲染快照，请确认 Cavalry 已完成登录/授权并可正常导出；旧动画已保留');
        if(api.getSceneFilePath()!==beforeFile||api.sceneHasUnsavedChanges()!==beforeDirty)throw Error('Cavalry 快照导出改变了工程状态，已停止同步');
        var snapshotMs=Date.now()-snapshotStarted;
        var config={root:root,preferences:api.getPreferencesFolder(),appData:api.getAppDataFolder(),assets:api.getAppAssetsPath(),script:api.getAppDataFolder()+'/Scripts/Cavalry AE Native.js'};
        write(root+'/renderer-config.json',config);
        var req={protocol:3,id:id,scene:scene,sourceNodeId:source,sourceUUID:api.get(source,'uuid'),project:api.getProjectPath(),kind:options.kind,snapshotMs:snapshotMs};
        for(var k in options)req[k]=options[k];
        write(root+'/renderer-job.json',req);prepared=true;active={id:id,snapshotMs:snapshotMs,prepareMs:options.prepareMs,fingerprintMs:options.fingerprintMs,started:Date.now(),lastProgress:Date.now(),done:-1};demand();return active;
    }
    function poll(handle){
        demand();if(handle.cached&&Date.now()-handle.polledAt<100)return handle.cached;handle.polledAt=Date.now();var health=read(root+'/renderer-health.json');
        if(health&&health.phase==='error'&&health.stamp>=handle.started)throw Error('后台渲染器：'+health.error);
        var result=read(root+'/renderer-result.json');
        if(result&&result.id===handle.id){
            if(result.phase==='error')throw Error(result.error);
            // Receiving a loading acknowledgement is not successful startup.
            // Modal login dialogs can keep a process alive indefinitely.
            if((result.phase==='loading'||result.phase==='starting')&&Date.now()-handle.started>60000)throw Error('后台未能加载动画，可能正在等待 Cavalry 登录/授权。请点“检查后台 / 登录”，处理提示后重新连接；旧动画已保留。');
            if(result.done!==handle.done){handle.done=result.done;handle.lastProgress=Date.now();}
            if(result.phase==='complete'||result.phase==='cancelled'){
                if(active===handle)active=null;
                if(result.phase==='complete'&&!handle.reported){
                    handle.reported=true;
                    // Diagnostics only: reporting must never break completed work.
                    try{write(root+'/performance.json',{id:handle.id,snapshotMs:handle.snapshotMs,prepareMs:handle.prepareMs,fingerprintMs:handle.fingerprintMs,loadMs:result.loadMs,renderMs:result.renderMs,firstFrameMs:result.firstFrameMs,elapsedMs:Date.now()-handle.started,frames:result.done,batches:result.batches,renderFps:result.renderFps,stamp:Date.now()});}catch(_){}
                }
            }
            handle.cached=result;return result;
        }
        // A supervisor's ready flag never proves that this request was accepted.
        // In 4.3 a dead child's cached NSRunningApplication kept ready true forever.
        if(Date.now()-handle.started>45000)throw Error('后台未响应当前任务。请点“检查后台 / 登录”，确认后台 Cavalry 已就绪后重新连接；旧动画已保留。');
        return {phase:'starting',done:0};
    }
    return {submit:submit,poll:poll,keepAlive:function(connected){if((connected!==false&&prepared)||Date.now()<inspectionDemandUntil)demand();},inspect:function(){inspectionDemandUntil=Date.now()+30000;ensure(root);write(root+'/renderer-show.json',{id:String(api.uuid()),stamp:Date.now()});lastDemand=0;demand();},cancel:function(h){if(h)write(root+'/renderer-cancel.json',{id:h.id});if(active===h)active=null;}};
}
