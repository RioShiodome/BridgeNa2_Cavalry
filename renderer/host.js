// Executed only in the launcher's private Cavalry profile. No editor code runs here.
function runRendererHost(api,ui,role){
    var root=String(role.root).replace(/\\/g,'/').replace(/\/+$/,''),last=role.ignoreJobId||'',busy=false,job=null,closed=false,beat=0,bake=null,bakeStates={};
    function pathKey(p){return bridgeSceneKey(p).replace(/\/+$/,'');}
    function replyRoot(req){
        var path=pathKey(req.responseRoot||root),base=pathKey(root),prefix=base+'/channels/';
        if(path===base)return root;
        if(path.indexOf(prefix)===0&&/^[1-9][0-9]{0,9}$/.test(path.slice(prefix.length)))return root+'/channels/'+path.slice(prefix.length);
        throw Error('Invalid channel response path');
    }
    function read(p){try{if(!api.filePathExists(p))return null;return JSON.parse(api.readFromFile(p));}catch(_){return null;}}
    function write(p,x){if(!api.writeToFile(p,JSON.stringify(x),true))throw Error('Cannot write renderer result');}
    function status(phase,extra){var out={session:role.session,id:job?job.id:last,phase:phase,stamp:Date.now()};if(job&&job.source){out.sourceNodeId=job.source;out.sourceUUID=job.sourceUUID;out.sourceName=job.sourceName;}if(extra)for(var k in extra)out[k]=extra[k];write(root+'/renderer-result.json',out);}
    function cancelled(){var c=read(root+'/renderer-cancel.json'),next=read(root+'/renderer-job.json');return (c&&job&&c.id===job.id)||(next&&job&&next.id!==job.id);}
    function file(frame){return job.directory+'/frame.'+(frame<0?'-':'')+('000000'+Math.abs(frame)).slice(frame<0?-5:-6)+'.png';}
    function load(req){
        if(!/^[a-zA-Z0-9-]+$/.test(req.id)||pathKey(req.scene)!==pathKey(root+'/requests/'+req.id+'.cv'))throw Error('Invalid renderer request');
        var previous=read(root+'/renderer-result.json');
        if(bake)bake.close();
        job=req;job.done=0;job.sizes=[];job.batch=2;job.started=Date.now();job.renderMs=0;job.batches=0;job.firstFrameMs=0;
        if((req.kind==='bake'||req.kind==='bake-control')&&previous&&previous.id===req.id&&previous.phase==='complete'){status('complete');job=null;return;}
        if(req.kind==='preview'&&previous&&previous.id===req.id&&previous.sizes&&previous.done>=0&&previous.done<=req.count&&previous.done===previous.sizes.length){job.done=previous.done;job.sizes=previous.sizes;}
        // Acknowledge before any API that may enter a modal event loop.
        job.loading=true;job.loadedAt=Date.now();status('loading',{done:job.done,total:job.count||0,sizes:job.sizes});
        if(req.project)api.setProject(req.project);else if(req.project==='')api.clearProject();
        api.openScene(req.scene,true);
    }
    function loaded(){
        var req=job,queue='',source='';
        if(pathKey(api.getSceneFilePath())===pathKey(req.scene)){
            if(req.protocol===3||req.protocol===2){
                if(req.protocol===3&&(!req.sourceNodeId||typeof req.sourceNodeId!=='string'))throw Error('后台请求缺少合成节点 ID，请更新两端并重新选择合成。');
                try{source=bridgeSource(api,{uuid:req.sourceUUID,nodeId:req.protocol===3?req.sourceNodeId:undefined});}catch(e){if(e.ambiguousSource||Date.now()-req.loadedAt>45000)throw e;return false;}
                job.source=source;job.sourceName=api.getNiceName(source);
            }else{
                // Accept a queued 4.5.1 request during an upgrade.
                var queues=api.getRenderQueueItems();
                for(var qi=0;qi<queues.length;qi++)if(api.get(queues[qi],'uuid')===req.queueUUID){if(queue)throw Error('旧后台队列 UUID 不唯一，请重新连接。');queue=queues[qi];}
            }
        }
        if(!queue&&!source){
            if(Date.now()-req.loadedAt>45000)throw Error('后台未能打开快照，请检查 Cavalry 的启动/授权状态。旧动画已保留。');
            // openScene can load assets asynchronously. Reopening every two
            // seconds races an in-flight load on large projects. Wait for this
            // one load; explicit reconnect retries after an authentication error.
            return false;
        }
        if(req.kind==='bake-control'){
            var responseRoot=replyRoot(req);
            bake=createBakeBridge(api,responseRoot,{submit:function(q){api.render(q);return {};},poll:function(){return {phase:cancelled()?'cancelled':'complete'};},cancel:function(){}});
            var br=req.bakeRequest;
            if(!br||br.protocol!==1||!/^b[a-zA-Z0-9]+$/.test(br.id))throw Error('Invalid bake request');
            if(br.action!=='open'){
                var saved=bakeStates[responseRoot];if(!saved||saved.id!==br.session)throw Error('后台烘焙设置已过期，请重新打开');
                bake.restore(saved,source);
            }
            status('rendering',{kind:'bake-control'});
            bake.dispatch(br,source);bake.poll();
            bakeStates[responseRoot]=bake.snapshot();bake.close();
            status('complete');job=null;return false;
        }
        if(source){
            // This scene is already an isolated copy. All preview mutations
            // happen here, never in the editing application's undo history.
            if(req.transparent){var bg=JSON.parse(JSON.stringify(api.get(source,'backgroundColor')));bg.a=0;api.set(source,{backgroundColor:bg});}
            queue=api.addRenderQueueItem(source);api.setGenerator(queue,'generator','renderPNG');
            if(api.getCurrentGeneratorType(queue,'generator')!=='renderPNG')throw Error('当前 Cavalry 不支持 PNG 渲染');
            api.set(queue,{filePath:req.directory,fileName:'frame',padding:6,frameRangeMode:2,resolutionScale:req.scale,ensureUniqueNames:false,usePlaybackStep:false,respectViewportFiltering:true,dynamicRender:false,upload:false,canvaUpload:false,enableMetadata:false,preRenderExpression:'',postRenderExpression:'',renderSetupExpression:'','targets.0.retimeRender':false,'generator.compression':1,'generator.pngFilter':0});
        }else if(req.directory)api.set(queue,{filePath:req.directory});
        job.queue=queue;job.loading=false;job.loadMs=Date.now()-job.loadedAt;
        if(job.kind==='preview'&&job.done===job.count){status('complete',{done:job.done,total:job.count,sizes:job.sizes});job=null;return false;}
        status('rendering',{done:job.done,total:job.count||0,sizes:job.sizes});return true;
    }
    function render(){
        var j=job;
        if(j.kind==='bake'){
            status('rendering',{kind:'bake'});
            api.render(j.queue);
            if(cancelled()){status('cancelled');job=null;return;}
            status('complete');job=null;return;
        }
        // Keep the first response small. Large scenes pay substantial setup cost
        // for every api.render call; retain a short continuous run instead of
        // falling back to one-frame renders. Extremely slow frames stay bounded.
        var end=Math.min(j.count,j.done+(j.done===0?2:j.batch)),first=j.first+j.done,lastFrame=j.first+end-1,started=Date.now();
        var name=end-j.done===1?'frame.'+(first<0?'-':'')+('000000'+Math.abs(first)).slice(first<0?-5:-6):'frame';
        api.set(j.queue,{fileName:name,frameRangeMode:2,frameRange:{x:first,y:lastFrame}});
        api.render(j.queue);
        if(cancelled()){status('cancelled');job=null;return;}
        for(var i=j.done;i<end;i++){
            var path=file(j.first+i);if(!api.filePathExists(path))throw Error('Missing rendered frame '+(j.first+i));
            var bytes=Math.round(api.getFileSize(path)*1024);if(bytes<45)throw Error('Incomplete PNG');j.sizes.push(String(bytes));
        }
        var elapsed=Math.max(1,Date.now()-started),frames=end-j.done;
        var perFrame=elapsed/frames;
        // At most ~6 seconds of predicted work for slow scenes. This is a
        // throughput/refresh tradeoff; editing remains in the other process.
        var floor=Math.max(1,Math.min(4,Math.floor(6000/perFrame)));
        j.batch=Math.max(floor,Math.min(64,Math.round(frames*600/elapsed),Math.max(16,j.batch*2)));
        j.renderMs+=elapsed;j.batches++;
        if(!j.firstFrameMs)j.firstFrameMs=Date.now()-j.started;
        j.done=end;status(end===j.count?'complete':'rendering',{done:end,total:j.count,sizes:j.sizes,batchMs:elapsed,elapsedMs:Date.now()-j.started,loadMs:j.loadMs,renderMs:j.renderMs,firstFrameMs:j.firstFrameMs,batches:j.batches,renderFps:1000*end/Math.max(1,j.renderMs)});
        if(end===j.count)job=null;
    }
    function tick(){
        if(closed||busy)return;
        busy=true;
        try{
            if(Date.now()-beat>500){write(root+'/renderer-heartbeat.json',{session:role.session,stamp:Date.now(),preferences:api.getPreferencesFolder()});beat=Date.now();}
            var req=read(root+'/renderer-job.json');
            if(req&&req.id!==last){last=req.id;var cancellation=read(root+'/renderer-cancel.json');if(!cancellation||cancellation.id!==req.id)load(req);}
            if(job){if(cancelled()){status('cancelled');job=null;}else if(!job.loading||loaded())render();}
        }catch(e){if(job&&job.kind==='bake-control'&&job.bakeRequest){try{write(replyRoot(job)+'/bake-response.json',{id:job.bakeRequest.id,phase:'error',error:String(e)});}catch(_){}}status('error',{error:String(e)});job=null;}
        finally{busy=false;}
    }
    var expected=role.profile.replace(/\\/g,'/').toLowerCase()+'/',actual=api.getPreferencesFolder().replace(/\\/g,'/').toLowerCase()+'/';
    var isolated=role.preferences?pathKey(api.getPreferencesFolder())===pathKey(role.preferences)&&pathKey(api.getAppDataFolder())===pathKey(role.appData):actual.indexOf(expected)===0;
    if(!isolated){write(root+'/renderer-heartbeat.json',{session:role.session,stamp:Date.now(),error:'Cavalry did not use an isolated preference profile. Foreground rendering is disabled.'});return;}
    ui.setTitle('BridgeNa2_Cavalry Renderer');ui.setCallbacksActive(true);
    var timer=new api.Timer({onTimeout:tick});timer.setRepeating(true);timer.setInterval(10);timer.start();
    ui.onClose=function(){closed=true;timer.stop();};tick();
}
